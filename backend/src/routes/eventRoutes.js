const express = require("express");
const { requireAuth, allowRoles, optionalAuth } = require("../middlewares/auth");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const ForumMessage = require("../models/ForumMessage");
const Feedback = require("../models/Feedback");
const { upload, toPublicUploadUrl } = require("../middlewares/upload");
const asyncHandler = require("../utils/asyncHandler");
const { createTicketPayload } = require("../services/ticketService");
const { sendEmail } = require("../services/emailService");
const { sortEventsByPreference } = require("../services/recommendationService");
const { emitToEvent } = require("../services/socketService");

const router = express.Router();

function levenshteinDistance(a = "", b = "") {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[a.length][b.length];
}

function fuzzyScore(query, target) {
  const q = String(query || "").trim().toLowerCase();
  const t = String(target || "").trim().toLowerCase();
  if (!q || !t) {
    return 0;
  }

  if (t.includes(q)) {
    return 1;
  }

  const targetTokens = t.split(/\s+/).filter(Boolean);
  let best = 0;
  for (const token of targetTokens) {
    const distance = levenshteinDistance(q, token);
    const denom = Math.max(q.length, token.length) || 1;
    const score = 1 - distance / denom;
    if (score > best) {
      best = score;
    }
  }
  return best;
}

function serializeForumMessage(message, viewerId) {
  return {
    id: message._id,
    event: message.event,
    author: {
      id: message.author?._id,
      name:
        message.author?.role === "organizer"
          ? message.author?.organizerName
          : `${message.author?.firstName || ""} ${message.author?.lastName || ""}`.trim(),
      role: message.authorRole,
      email: message.author?.email,
    },
    parentMessage: message.parentMessage || null,
    text: message.isDeleted ? "[deleted by organizer]" : message.text,
    isAnnouncement: message.isAnnouncement,
    isPinned: message.isPinned,
    isDeleted: message.isDeleted,
    reactions: (message.reactions || []).map((reaction) => ({
      emoji: reaction.emoji,
      count: (reaction.users || []).length,
      reacted: (reaction.users || []).some((id) => String(id) === String(viewerId)),
    })),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

async function ensureForumAccess(event, user) {
  if (user.role === "organizer") {
    if (String(event.organizer) !== String(user._id)) {
      return false;
    }
    return true;
  }

  if (user.role !== "participant") {
    return false;
  }

  const registration = await Registration.findOne({
    event: event._id,
    participant: user._id,
    status: { $nin: ["cancelled", "rejected"] },
  }).select("_id");
  return Boolean(registration);
}

router.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { search = "", eventType, eligibility, dateFrom, dateTo, followedOnly } = req.query;

    const query = {
      archived: false,
      status: { $in: ["published", "ongoing"] },
    };

    if (eventType) {
      query.eventType = eventType;
    }

    if (eligibility && eligibility !== "all") {
      query.eligibility = new RegExp(`^${eligibility}$`, "i");
    }

    if (dateFrom || dateTo) {
      query.startDate = {};
      if (dateFrom) {
        query.startDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.startDate.$lte = new Date(dateTo);
      }
    }

    if (followedOnly === "true" && req.user?.role === "participant") {
      query.organizer = { $in: req.user.followedOrganizers || [] };
    }

    let events = await Event.find(query).populate("organizer", "organizerName category description").sort({ startDate: 1 });

    if (search) {
      const scored = events
        .map((event) => {
          const eventNameScore = fuzzyScore(search, event.name);
          const organizerScore = fuzzyScore(search, event.organizer?.organizerName || "");
          return {
            event,
            score: Math.max(eventNameScore, organizerScore),
          };
        })
        .filter((row) => row.score >= 0.45)
        .sort((a, b) => b.score - a.score);

      events = scored.map((row) => row.event);
    }

    if (req.user?.role === "participant") {
      events = sortEventsByPreference(events, req.user);
    }

    return res.json({ events });
  })
);

router.get(
  "/trending",
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const top = await Registration.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $nin: ["rejected", "cancelled"] } } },
      { $group: { _id: "$event", registrations: { $sum: 1 } } },
      { $sort: { registrations: -1 } },
      { $limit: 5 },
    ]);

    const ids = top.map((row) => row._id);
    const events = await Event.find({ _id: { $in: ids } }).populate("organizer", "organizerName");
    const map = new Map(events.map((event) => [String(event._id), event]));

    const ordered = top
      .map((row) => ({ event: map.get(String(row._id)), registrations: row.registrations }))
      .filter((row) => row.event);

    return res.json({ trending: ordered });
  })
);

router.get(
  "/:id/forum/messages",
  requireAuth,
  allowRoles("participant", "organizer"),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.id);
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const canAccess = await ensureForumAccess(event, req.user);
    if (!canAccess) {
      return res.status(403).json({ message: "You can access forum only for events you are part of" });
    }

    const messages = await ForumMessage.find({ event: event._id })
      .populate("author", "firstName lastName organizerName role email")
      .sort({ isPinned: -1, isAnnouncement: -1, createdAt: 1 });

    return res.json({
      messages: messages.map((message) => serializeForumMessage(message, req.user._id)),
    });
  })
);

router.post(
  "/:id/forum/messages",
  requireAuth,
  allowRoles("participant", "organizer"),
  asyncHandler(async (req, res) => {
    const { text, parentMessage, isAnnouncement = false } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: "Message text is required" });
    }

    const event = await Event.findById(req.params.id);
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const canAccess = await ensureForumAccess(event, req.user);
    if (!canAccess) {
      return res.status(403).json({ message: "You can post only for events you are part of" });
    }

    if (parentMessage) {
      const parent = await ForumMessage.findOne({ _id: parentMessage, event: event._id }).select("_id");
      if (!parent) {
        return res.status(400).json({ message: "Invalid parent message" });
      }
    }

    const message = await ForumMessage.create({
      event: event._id,
      author: req.user._id,
      authorRole: req.user.role,
      parentMessage: parentMessage || null,
      text: String(text).trim(),
      isAnnouncement: req.user.role === "organizer" && String(event.organizer) === String(req.user._id) ? Boolean(isAnnouncement) : false,
    });

    const hydrated = await ForumMessage.findById(message._id).populate("author", "firstName lastName organizerName role email");
    const payload = serializeForumMessage(hydrated, req.user._id);
    emitToEvent(event._id, "forum:new_message", { message: payload });
    return res.status(201).json({ message: payload });
  })
);

router.patch(
  "/:id/forum/messages/:messageId",
  requireAuth,
  allowRoles("organizer"),
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const message = await ForumMessage.findOne({ _id: req.params.messageId, event: event._id }).populate(
      "author",
      "firstName lastName organizerName role email"
    );
    if (!message) {
      return res.status(404).json({ message: "Forum message not found" });
    }

    const { pin, remove } = req.body;
    if (typeof pin === "boolean") {
      message.isPinned = pin;
    }
    if (remove === true) {
      message.isDeleted = true;
      message.deletedBy = req.user._id;
      message.deletedAt = new Date();
    }

    await message.save();
    const payload = serializeForumMessage(message, req.user._id);
    emitToEvent(event._id, "forum:updated_message", { message: payload });
    return res.json({ message: payload });
  })
);

router.post(
  "/:id/forum/messages/:messageId/react",
  requireAuth,
  allowRoles("participant", "organizer"),
  asyncHandler(async (req, res) => {
    const { emoji } = req.body;
    if (!emoji || !String(emoji).trim()) {
      return res.status(400).json({ message: "Emoji is required" });
    }

    const event = await Event.findById(req.params.id);
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const canAccess = await ensureForumAccess(event, req.user);
    if (!canAccess) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const message = await ForumMessage.findOne({ _id: req.params.messageId, event: event._id });
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: "Forum message not found" });
    }

    const normalizedEmoji = String(emoji).trim();
    const reaction = message.reactions.find((item) => item.emoji === normalizedEmoji);
    if (!reaction) {
      message.reactions.push({
        emoji: normalizedEmoji,
        users: [req.user._id],
      });
    } else {
      const existingIndex = reaction.users.findIndex((id) => String(id) === String(req.user._id));
      if (existingIndex === -1) {
        reaction.users.push(req.user._id);
      } else {
        reaction.users.splice(existingIndex, 1);
      }
      if (!reaction.users.length) {
        message.reactions = message.reactions.filter((item) => item.emoji !== normalizedEmoji);
      }
    }

    await message.save();
    const response = (message.reactions || []).map((item) => ({
      emoji: item.emoji,
      count: (item.users || []).length,
      reacted: (item.users || []).some((id) => String(id) === String(req.user._id)),
    }));

    emitToEvent(event._id, "forum:reaction_update", {
      messageId: message._id,
      reactions: response,
    });

    return res.json({ reactions: response });
  })
);

router.get(
  "/:id/feedback/me",
  requireAuth,
  allowRoles("participant"),
  asyncHandler(async (req, res) => {
    const feedback = await Feedback.findOne({ event: req.params.id, participant: req.user._id });
    return res.json({ feedback });
  })
);

router.post(
  "/:id/feedback",
  requireAuth,
  allowRoles("participant"),
  asyncHandler(async (req, res) => {
    const { rating, comment = "" } = req.body;
    if (![1, 2, 3, 4, 5].includes(Number(rating))) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const event = await Event.findById(req.params.id);
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (new Date(event.endDate) > new Date()) {
      return res.status(400).json({ message: "Feedback can be submitted only after event completion" });
    }

    const registration = await Registration.findOne({
      event: event._id,
      participant: req.user._id,
      status: { $nin: ["cancelled", "rejected"] },
    }).select("_id");
    if (!registration) {
      return res.status(403).json({ message: "Only participants of this event can submit feedback" });
    }

    const feedback = await Feedback.findOneAndUpdate(
      { event: event._id, participant: req.user._id },
      {
        rating: Number(rating),
        comment: String(comment || "").trim(),
        anonymous: true,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ message: "Feedback submitted", feedback });
  })
);

router.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.id).populate("organizer", "organizerName category contactEmail description");
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const activeRegistrations = await Registration.countDocuments({
      event: event._id,
      status: { $nin: ["rejected", "cancelled"] },
    });

    const registrationClosed = new Date(event.registrationDeadline) < new Date() || activeRegistrations >= event.registrationLimit;
    const merchandiseStockExhausted =
      event.eventType === "merchandise" &&
      event.merchandiseItems.length > 0 &&
      event.merchandiseItems.every((item) => item.stock <= 0);

    let viewerRegistration = null;
    if (req.user?.role === "participant") {
      viewerRegistration = await Registration.findOne({
        event: event._id,
        participant: req.user._id,
        status: { $nin: ["cancelled", "rejected"] },
      }).select("status createdAt ticketId paymentStatus paymentProofUrl");
    }

    return res.json({
      event,
      viewerRegistration,
      meta: {
        activeRegistrations,
        registrationClosed,
        merchandiseStockExhausted,
      },
    });
  })
);

router.post(
  "/:id/register",
  requireAuth,
  allowRoles("participant"),
  upload.any(),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.id).populate("organizer", "organizerName email");
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.eventType !== "normal") {
      return res.status(400).json({ message: "Use purchase route for merchandise events" });
    }

    if (!["published", "ongoing"].includes(event.status)) {
      return res.status(400).json({ message: "Event registrations are not open" });
    }

    if (new Date(event.registrationDeadline) < new Date()) {
      return res.status(400).json({ message: "Registration deadline has passed" });
    }

    const existing = await Registration.findOne({ event: event._id, participant: req.user._id });
    if (existing) {
      return res.status(409).json({ message: "You have already registered for this event" });
    }

    const activeCount = await Registration.countDocuments({
      event: event._id,
      status: { $nin: ["rejected", "cancelled"] },
    });

    if (activeCount >= event.registrationLimit) {
      return res.status(400).json({ message: "Registration limit reached" });
    }

    let parsedFormResponses = {};
    if (typeof req.body.formResponses === "string") {
      try {
        parsedFormResponses = JSON.parse(req.body.formResponses);
      } catch (error) {
        return res.status(400).json({ message: "Invalid formResponses payload" });
      }
    } else if (req.body.formResponses && typeof req.body.formResponses === "object") {
      parsedFormResponses = req.body.formResponses;
    }

    if (!parsedFormResponses || typeof parsedFormResponses !== "object" || Array.isArray(parsedFormResponses)) {
      return res.status(400).json({ message: "formResponses must be an object" });
    }

    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    const uploadedFileMap = new Map(uploadedFiles.map((file) => [file.fieldname, toPublicUploadUrl(req, file)]));
    const normalizedFormResponses = {};

    for (const field of event.customFormFields || []) {
      let value = parsedFormResponses[field.id];
      if ((value === undefined || value === null || value === "") && typeof req.body[field.id] !== "undefined") {
        value = req.body[field.id];
      }

      if (field.type === "file") {
        const uploadedValue = uploadedFileMap.get(field.id);
        if (uploadedValue) {
          value = uploadedValue;
        }
      } else if (field.type === "number" && value !== undefined && value !== null && value !== "") {
        const numeric = Number(value);
        if (Number.isNaN(numeric)) {
          return res.status(400).json({ message: `Invalid number for ${field.label || field.id}` });
        }
        value = numeric;
      } else if (field.type === "checkbox") {
        if (typeof value === "string") {
          value = ["true", "1", "on", "yes"].includes(value.toLowerCase());
        } else if (value !== undefined) {
          value = Boolean(value);
        }
      } else if (Array.isArray(value)) {
        value = value.map((item) => String(item).trim()).filter(Boolean);
      } else if (value !== undefined && value !== null) {
        value = String(value).trim();
      }

      if (field.type === "dropdown" && value) {
        const options = (field.options || []).map((option) => String(option).trim());
        if (options.length && !options.includes(String(value))) {
          return res.status(400).json({ message: `Invalid option selected for ${field.label || field.id}` });
        }
      }

      const isMissing =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);

      if (field.required && isMissing) {
        return res.status(400).json({ message: `${field.label || field.id} is required` });
      }

      if (!isMissing) {
        normalizedFormResponses[field.id] = value;
      }
    }

    const formResponses = (event.customFormFields || []).length ? normalizedFormResponses : parsedFormResponses;

    const registration = await Registration.create({
      event: event._id,
      participant: req.user._id,
      organizer: event.organizer._id,
      eventType: event.eventType,
      status: "registered",
      formResponses,
      paymentStatus: "na",
      amountPaid: event.registrationFee,
    });

    const ticketData = await createTicketPayload({ event, participant: req.user, registration });
    registration.ticketId = ticketData.ticketId;
    registration.ticketQrData = ticketData.ticketQrData;
    await registration.save();

    if (!event.formLocked && event.customFormFields.length) {
      event.formLocked = true;
      await event.save();
    }

    await sendEmail({
      to: req.user.email,
      subject: `Registration confirmed: ${event.name}`,
      text: `You are registered for ${event.name}. Ticket ID: ${registration.ticketId}`,
    });

    return res.status(201).json({ message: "Registered successfully", registration });
  })
);

router.post(
  "/:id/purchase",
  requireAuth,
  allowRoles("participant"),
  upload.single("paymentProof"),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.id).populate("organizer", "organizerName email");
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.eventType !== "merchandise") {
      return res.status(400).json({ message: "This endpoint is only for merchandise events" });
    }

    if (!["published", "ongoing"].includes(event.status)) {
      return res.status(400).json({ message: "Purchases are closed for this event" });
    }

    if (new Date(event.registrationDeadline) < new Date()) {
      return res.status(400).json({ message: "Purchase deadline has passed" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Payment proof image is required" });
    }

    const existing = await Registration.findOne({
      event: event._id,
      participant: req.user._id,
      status: { $nin: ["rejected", "cancelled"] },
    });
    if (existing) {
      return res.status(409).json({ message: "You have already placed an order for this event" });
    }

    let selections = [];
    if (Array.isArray(req.body.selections)) {
      selections = req.body.selections;
    } else if (typeof req.body.selections === "string") {
      try {
        selections = JSON.parse(req.body.selections);
      } catch (error) {
        return res.status(400).json({ message: "Invalid selections payload" });
      }
    }

    if (!selections.length) {
      return res.status(400).json({ message: "At least one merchandise item is required" });
    }

    const requestQuantity = selections.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (requestQuantity > event.purchaseLimitPerParticipant) {
      return res.status(400).json({ message: `Purchase limit exceeded. Limit: ${event.purchaseLimitPerParticipant}` });
    }

    const itemMap = new Map(event.merchandiseItems.map((item) => [String(item._id), item]));
    const normalizedSelections = [];
    let totalAmount = 0;

    for (const selected of selections) {
      const item = itemMap.get(String(selected.itemId));
      const quantity = Number(selected.quantity || 0);
      if (!item || quantity <= 0) {
        return res.status(400).json({ message: "Invalid merchandise selection" });
      }

      if (item.stock <= 0) {
        return res.status(400).json({ message: `${item.name} is out of stock` });
      }

      totalAmount += quantity * item.price;
      normalizedSelections.push({
        itemId: item._id,
        name: item.name,
        quantity,
        unitPrice: item.price,
      });
    }

    const registration = await Registration.create({
      event: event._id,
      participant: req.user._id,
      organizer: event.organizer._id,
      eventType: event.eventType,
      status: "registered",
      merchandiseSelections: normalizedSelections,
      amountPaid: totalAmount,
      paymentStatus: "pending",
      paymentProofUrl: toPublicUploadUrl(req, req.file),
    });

    return res.status(201).json({
      message: "Order placed. Awaiting organizer payment approval.",
      registration,
    });
  })
);

module.exports = router;

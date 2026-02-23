const express = require("express");
const { requireAuth, allowRoles, optionalAuth } = require("../middlewares/auth");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const Team = require("../models/Team");
const User = require("../models/User");
const { upload, toPublicUploadUrl } = require("../middlewares/upload");
const asyncHandler = require("../utils/asyncHandler");
const { createTicketPayload } = require("../services/ticketService");
const { sendEmail } = require("../services/emailService");
const { sortEventsByPreference } = require("../services/recommendationService");

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
      }).select("status attendance createdAt ticketId");
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

    if (event.teamConfig?.enabled) {
      return res.status(400).json({ message: "This event requires team registration" });
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

    const existingPurchases = await Registration.find({ event: event._id, participant: req.user._id, status: { $nin: ["rejected", "cancelled"] } });
    const purchasedCount = existingPurchases.reduce(
      (acc, reg) =>
        acc +
        (reg.merchandiseSelections || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      0
    );

    const requestQuantity = selections.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (purchasedCount + requestQuantity > event.purchaseLimitPerParticipant) {
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

      if (item.stock < quantity) {
        return res.status(400).json({ message: `${item.name} is out of stock or insufficient` });
      }

      totalAmount += quantity * item.price;
      normalizedSelections.push({
        itemId: item._id,
        name: item.name,
        quantity,
        unitPrice: item.price,
      });
    }

    const paymentProofUrl = req.body.paymentProofUrl || toPublicUploadUrl(req, req.file);
    if (event.paymentApprovalRequired && !paymentProofUrl) {
      return res.status(400).json({ message: "Payment proof is required for this merchandise event" });
    }
    const requiresApproval = Boolean(event.paymentApprovalRequired || paymentProofUrl);

    const registration = await Registration.create({
      event: event._id,
      participant: req.user._id,
      organizer: event.organizer._id,
      eventType: event.eventType,
      status: requiresApproval ? "pending_approval" : "registered",
      merchandiseSelections: normalizedSelections,
      amountPaid: totalAmount,
      paymentStatus: requiresApproval ? "pending" : "approved",
      paymentProofUrl,
    });

    if (!requiresApproval) {
      for (const selected of normalizedSelections) {
        const item = itemMap.get(String(selected.itemId));
        item.stock -= selected.quantity;
      }

      const ticketData = await createTicketPayload({ event, participant: req.user, registration });
      registration.ticketId = ticketData.ticketId;
      registration.ticketQrData = ticketData.ticketQrData;
      await event.save();
      await registration.save();

      await sendEmail({
        to: req.user.email,
        subject: `Purchase confirmed: ${event.name}`,
        text: `Your purchase is confirmed. Ticket ID: ${registration.ticketId}`,
      });
    }

    return res.status(201).json({
      message: requiresApproval ? "Purchase submitted for approval" : "Purchase successful",
      registration,
    });
  })
);

router.post(
  "/:id/team/create",
  requireAuth,
  allowRoles("participant"),
  asyncHandler(async (req, res) => {
    const { teamName, maxMembers } = req.body;
    const event = await Event.findById(req.params.id);

    if (!event || !event.teamConfig?.enabled) {
      return res.status(400).json({ message: "Team registration is not enabled for this event" });
    }

    if (!["published", "ongoing"].includes(event.status)) {
      return res.status(400).json({ message: "Team registration is not open for this event" });
    }

    if (new Date(event.registrationDeadline) < new Date()) {
      return res.status(400).json({ message: "Registration deadline has passed" });
    }

    const configuredMaxMembers = Number(event.teamConfig.maxMembers || 1);
    const requestedMaxMembers = Number(maxMembers) || configuredMaxMembers;
    if (requestedMaxMembers < 2) {
      return res.status(400).json({ message: "Team size must be at least 2" });
    }
    if (requestedMaxMembers > configuredMaxMembers) {
      return res.status(400).json({ message: `Team size cannot exceed configured max (${configuredMaxMembers})` });
    }

    const existingRegistration = await Registration.findOne({
      event: event._id,
      participant: req.user._id,
      status: { $nin: ["cancelled", "rejected"] },
    });
    if (existingRegistration) {
      return res.status(409).json({ message: "You are already registered for this event" });
    }

    const existingTeam = await Team.findOne({
      event: event._id,
      status: { $ne: "cancelled" },
      $or: [{ leader: req.user._id }, { "members.participant": req.user._id }],
    });
    if (existingTeam) {
      return res.status(409).json({ message: "You are already part of a team for this event" });
    }

    const inviteCode = `${event._id.toString().slice(-4)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const team = await Team.create({
      event: event._id,
      leader: req.user._id,
      name: teamName || `${req.user.firstName || "Team"}'s Team`,
      inviteCode,
      maxMembers: requestedMaxMembers,
      members: [{ participant: req.user._id, status: "accepted", joinedAt: new Date() }],
    });

    return res.status(201).json({ team });
  })
);

router.post(
  "/:id/team/join",
  requireAuth,
  allowRoles("participant"),
  asyncHandler(async (req, res) => {
    const { inviteCode } = req.body;
    const event = await Event.findById(req.params.id).populate("organizer", "email");
    if (!event || !event.teamConfig?.enabled) {
      return res.status(400).json({ message: "Team registration is not enabled for this event" });
    }

    if (!["published", "ongoing"].includes(event.status)) {
      return res.status(400).json({ message: "Team registration is not open for this event" });
    }

    if (new Date(event.registrationDeadline) < new Date()) {
      return res.status(400).json({ message: "Registration deadline has passed" });
    }

    const team = await Team.findOne({ event: event._id, inviteCode });
    if (!team || team.status !== "forming") {
      return res.status(404).json({ message: "Team not found or not accepting members" });
    }

    const existingMembership = await Team.findOne({
      event: event._id,
      status: { $ne: "cancelled" },
      "members.participant": req.user._id,
    });
    if (existingMembership && String(existingMembership._id) !== String(team._id)) {
      return res.status(409).json({ message: "You are already part of another team for this event" });
    }

    const alreadyMember = team.members.some((member) => String(member.participant) === String(req.user._id));
    if (alreadyMember) {
      return res.status(409).json({ message: "You are already in this team" });
    }

    if (team.members.length >= team.maxMembers) {
      return res.status(400).json({ message: "Team is full" });
    }

    team.members.push({ participant: req.user._id, status: "accepted", joinedAt: new Date() });

    if (team.members.length === team.maxMembers) {
      team.status = "completed";

      const participants = team.members.map((member) => member.participant);
      const existingRegistrations = await Registration.find({ event: event._id, participant: { $in: participants } }).select("participant");
      const existingSet = new Set(existingRegistrations.map((reg) => String(reg.participant)));

      for (const member of team.members) {
        if (existingSet.has(String(member.participant))) {
          continue;
        }

        const registration = await Registration.create({
          event: event._id,
          participant: member.participant,
          organizer: event.organizer._id,
          team: team._id,
          teamName: team.name,
          eventType: event.eventType,
          status: "registered",
          paymentStatus: "na",
        });

        const participantDoc =
          String(member.participant) === String(req.user._id)
            ? req.user
            : await User.findById(member.participant).select("email");
        const ticketData = await createTicketPayload({
          event,
          participant: participantDoc || { _id: member.participant, email: "participant@local" },
          registration,
        });
        registration.ticketId = ticketData.ticketId;
        registration.ticketQrData = ticketData.ticketQrData;
        await registration.save();
      }
    }

    await team.save();

    return res.json({ message: "Joined team", team });
  })
);

router.get(
  "/:id/team/my",
  requireAuth,
  allowRoles("participant"),
  asyncHandler(async (req, res) => {
    const team = await Team.findOne({
      event: req.params.id,
      $or: [{ leader: req.user._id }, { "members.participant": req.user._id }, { "invites.email": req.user.email }],
    })
      .populate("leader", "firstName lastName email")
      .populate("members.participant", "firstName lastName email")
      .populate("invites.participant", "firstName lastName email");

    return res.json({ team });
  })
);

module.exports = router;

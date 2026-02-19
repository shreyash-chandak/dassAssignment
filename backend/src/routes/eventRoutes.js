const express = require("express");
const mongoose = require("mongoose");
const { requireAuth, allowRoles, optionalAuth } = require("../middlewares/auth");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const Team = require("../models/Team");
const User = require("../models/User");
const upload = require("../middlewares/upload");
const asyncHandler = require("../utils/asyncHandler");
const { createTicketPayload } = require("../services/ticketService");
const { sendEmail } = require("../services/emailService");
const { sortEventsByPreference } = require("../services/recommendationService");

const router = express.Router();

function nowISO() {
  return new Date().toISOString();
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
      const regex = new RegExp(search, "i");
      events = events.filter((event) => regex.test(event.name) || regex.test(event.organizer?.organizerName || ""));
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

    return res.json({
      event,
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

    const registration = await Registration.create({
      event: event._id,
      participant: req.user._id,
      organizer: event.organizer._id,
      eventType: event.eventType,
      status: "registered",
      formResponses: req.body.formResponses || {},
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

    const selections = Array.isArray(req.body.selections) ? req.body.selections : [];
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

    const paymentProofUrl = req.body.paymentProofUrl || (req.file ? `uploaded://${req.file.originalname}` : null);
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

    const existingTeam = await Team.findOne({ event: event._id, leader: req.user._id, status: { $ne: "cancelled" } });
    if (existingTeam) {
      return res.status(409).json({ message: "You already lead a team for this event" });
    }

    const inviteCode = `${event._id.toString().slice(-4)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const team = await Team.create({
      event: event._id,
      leader: req.user._id,
      name: teamName || `${req.user.firstName || "Team"}'s Team`,
      inviteCode,
      maxMembers: Number(maxMembers) || event.teamConfig.maxMembers,
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

    const team = await Team.findOne({ event: event._id, inviteCode });
    if (!team || team.status !== "forming") {
      return res.status(404).json({ message: "Team not found or not accepting members" });
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

module.exports = router;

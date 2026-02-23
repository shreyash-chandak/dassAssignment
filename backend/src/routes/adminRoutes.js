const express = require("express");
const User = require("../models/User");
const Event = require("../models/Event");
const PasswordResetRequest = require("../models/PasswordResetRequest");
const SecurityEvent = require("../models/SecurityEvent");
const { requireAuth, allowRoles } = require("../middlewares/auth");
const asyncHandler = require("../utils/asyncHandler");
const { randomPassword } = require("../utils/validators");
const { getBlockedIpsSnapshot } = require("../services/securityService");

const router = express.Router();

router.use(requireAuth, allowRoles("admin"));

function generateOrganizerEmail(name = "club") {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "organizer"}-${Date.now().toString().slice(-5)}@felicity.local`;
}

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const [organizers, activeEvents, pendingResetRequests, securityEventsLast24h] = await Promise.all([
      User.countDocuments({ role: "organizer" }),
      Event.countDocuments({ archived: false, status: { $in: ["published", "ongoing"] } }),
      PasswordResetRequest.countDocuments({ status: "pending" }),
      SecurityEvent.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    ]);

    const blockedIps = getBlockedIpsSnapshot();
    return res.json({ organizers, activeEvents, pendingResetRequests, securityEventsLast24h, blockedIps: blockedIps.length });
  })
);

router.get(
  "/security-events",
  asyncHandler(async (req, res) => {
    const { type, ip, email, page = 1, limit = 50 } = req.query;

    const filters = {};
    if (type) {
      filters.type = type;
    }
    if (ip) {
      filters.ip = new RegExp(String(ip), "i");
    }
    if (email) {
      filters.email = new RegExp(String(email), "i");
    }

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 50, 1), 200);

    const [events, total] = await Promise.all([
      SecurityEvent.find(filters)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      SecurityEvent.countDocuments(filters),
    ]);

    const blockedIps = getBlockedIpsSnapshot();

    return res.json({
      events,
      blockedIps,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  })
);

router.get(
  "/organizers",
  asyncHandler(async (req, res) => {
    const organizers = await User.find({ role: "organizer" })
      .select("organizerName category description email contactEmail isActive createdAt")
      .sort({ createdAt: -1 });

    return res.json({ organizers });
  })
);

router.post(
  "/organizers",
  asyncHandler(async (req, res) => {
    const { organizerName, category, description, contactEmail, contactNumber } = req.body;
    if (!organizerName || !category || !description) {
      return res.status(400).json({ message: "organizerName, category, and description are required" });
    }

    const email = generateOrganizerEmail(organizerName);
    const password = randomPassword(12);

    const organizer = await User.create({
      role: "organizer",
      organizerName,
      category,
      description,
      contactEmail: contactEmail || email,
      contactNumber,
      email,
      password,
      firstName: organizerName,
      lastName: "",
      isActive: true,
    });

    return res.status(201).json({
      message: "Organizer created",
      credentials: {
        email,
        password,
      },
      organizer: organizer.toSafeJSON(),
    });
  })
);

router.patch(
  "/organizers/:id/status",
  asyncHandler(async (req, res) => {
    const { isActive } = req.body;
    const organizer = await User.findOne({ _id: req.params.id, role: "organizer" });
    if (!organizer) {
      return res.status(404).json({ message: "Organizer not found" });
    }

    organizer.isActive = Boolean(isActive);
    await organizer.save();

    return res.json({ message: `Organizer ${organizer.isActive ? "enabled" : "disabled"}`, organizer: organizer.toSafeJSON() });
  })
);

router.delete(
  "/organizers/:id",
  asyncHandler(async (req, res) => {
    const { permanent = "false" } = req.query;
    const organizer = await User.findOne({ _id: req.params.id, role: "organizer" });
    if (!organizer) {
      return res.status(404).json({ message: "Organizer not found" });
    }

    if (permanent === "true") {
      await Event.deleteMany({ organizer: organizer._id });
      await organizer.deleteOne();
      return res.json({ message: "Organizer and related events deleted permanently" });
    }

    organizer.isActive = false;
    await organizer.save();
    await Event.updateMany({ organizer: organizer._id }, { $set: { archived: true, status: "closed" } });

    return res.json({ message: "Organizer archived/disabled and events archived" });
  })
);

router.get(
  "/password-reset-requests",
  asyncHandler(async (req, res) => {
    const requests = await PasswordResetRequest.find()
      .populate("organizer", "organizerName email")
      .populate("processedBy", "email")
      .sort({ createdAt: -1 });

    return res.json({ requests });
  })
);

router.patch(
  "/password-reset-requests/:id",
  asyncHandler(async (req, res) => {
    const { decision, comment = "" } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "decision must be approved or rejected" });
    }

    const request = await PasswordResetRequest.findById(req.params.id).populate("organizer");
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Only pending requests can be processed" });
    }

    request.status = decision;
    request.adminComment = comment;
    request.processedBy = req.user._id;
    request.processedAt = new Date();

    if (decision === "approved") {
      const newPassword = randomPassword(12);
      request.generatedPassword = newPassword;
      request.organizer.password = newPassword;
      await request.organizer.save();
    }

    await request.save();

    return res.json({
      message: `Password reset request ${decision}`,
      request,
      credentials: decision === "approved" ? { email: request.organizer.email, password: request.generatedPassword } : null,
    });
  })
);

module.exports = router;

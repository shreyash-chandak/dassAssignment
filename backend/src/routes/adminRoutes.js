const express = require("express");
const User = require("../models/User");
const Event = require("../models/Event");
const PasswordResetRequest = require("../models/PasswordResetRequest");
const { requireAuth, allowRoles } = require("../middlewares/auth");
const asyncHandler = require("../utils/asyncHandler");
const { randomPassword } = require("../utils/validators");

const router = express.Router();

router.use(requireAuth, allowRoles("admin"));

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const [organizers, activeEvents, pendingResetRequests] = await Promise.all([
      User.countDocuments({ role: "organizer" }),
      Event.countDocuments({ archived: false, status: { $in: ["published", "ongoing"] } }),
      PasswordResetRequest.countDocuments({ status: "pending" }),
    ]);

    return res.json({
      organizers,
      activeEvents,
      pendingResetRequests,
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
    const { organizerName, category, description, contactEmail, contactNumber, email, password } = req.body;
    if (!organizerName || !category || !description || !email || !password) {
      return res.status(400).json({ message: "organizerName, category, description, email, and password are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const organizer = await User.create({
      role: "organizer",
      organizerName,
      category,
      description,
      contactEmail: contactEmail || normalizedEmail,
      contactNumber,
      email: normalizedEmail,
      password: String(password),
      firstName: organizerName,
      lastName: "",
      isActive: true,
    });

    return res.status(201).json({
      message: "Organizer created",
      credentials: {
        email: normalizedEmail,
        password: String(password),
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
      await PasswordResetRequest.deleteMany({ organizer: organizer._id });
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
    const { status } = req.query;
    const query = {};
    if (status) {
      query.status = status;
    }

    const requests = await PasswordResetRequest.find(query)
      .populate("organizer", "organizerName email")
      .populate("resolvedBy", "email")
      .sort({ createdAt: -1 });

    return res.json({ requests });
  })
);

router.patch(
  "/password-reset-requests/:id",
  asyncHandler(async (req, res) => {
    const { action, comment = "" } = req.body;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Action must be approve or reject" });
    }

    const request = await PasswordResetRequest.findById(req.params.id).populate("organizer");
    if (!request) {
      return res.status(404).json({ message: "Reset request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request is already resolved" });
    }

    request.adminComment = String(comment || "").trim();
    request.resolvedBy = req.user._id;
    request.resolvedAt = new Date();

    let generatedPassword = null;
    if (action === "approve") {
      generatedPassword = randomPassword(12);
      request.status = "approved";
      request.generatedPassword = generatedPassword;
      request.organizer.password = generatedPassword;
      await request.organizer.save();
    } else {
      request.status = "rejected";
    }

    await request.save();

    const refreshed = await PasswordResetRequest.findById(request._id)
      .populate("organizer", "organizerName email")
      .populate("resolvedBy", "email");

    return res.json({
      message: `Request ${action}d`,
      request: refreshed,
      generatedPassword,
    });
  })
);

module.exports = router;

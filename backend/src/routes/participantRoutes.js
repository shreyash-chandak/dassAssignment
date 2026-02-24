const express = require("express");
const mongoose = require("mongoose");
const { requireAuth, allowRoles } = require("../middlewares/auth");
const Registration = require("../models/Registration");
const Event = require("../models/Event");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.use(requireAuth, allowRoles("participant"));

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate("followedOrganizers", "organizerName category description");
    return res.json({ user: user.toSafeJSON() });
  })
);

router.put(
  "/profile",
  asyncHandler(async (req, res) => {
    const allowed = ["firstName", "lastName", "contactNumber", "collegeOrOrg", "interests", "followedOrganizers"];
    for (const key of allowed) {
      if (key in req.body) {
        req.user[key] = req.body[key];
      }
    }

    await req.user.save();
    const updated = await User.findById(req.user._id).populate("followedOrganizers", "organizerName category");

    return res.json({ user: updated.toSafeJSON() });
  })
);

router.put(
  "/onboarding",
  asyncHandler(async (req, res) => {
    const { interests = [], followedOrganizers = [] } = req.body;
    req.user.interests = interests;
    req.user.followedOrganizers = followedOrganizers;
    await req.user.save();

    return res.json({ message: "Preferences saved", user: req.user.toSafeJSON() });
  })
);

router.post(
  "/follow/:organizerId",
  asyncHandler(async (req, res) => {
    const organizer = await User.findOne({ _id: req.params.organizerId, role: "organizer", isActive: true });
    if (!organizer) {
      return res.status(404).json({ message: "Organizer not found" });
    }

    const exists = req.user.followedOrganizers.some((id) => String(id) === String(organizer._id));
    if (!exists) {
      req.user.followedOrganizers.push(organizer._id);
      await req.user.save();
    }

    return res.json({ message: "Organizer followed", followedOrganizers: req.user.followedOrganizers });
  })
);

router.delete(
  "/follow/:organizerId",
  asyncHandler(async (req, res) => {
    req.user.followedOrganizers = req.user.followedOrganizers.filter(
      (id) => String(id) !== String(req.params.organizerId)
    );
    await req.user.save();

    return res.json({ message: "Organizer unfollowed", followedOrganizers: req.user.followedOrganizers });
  })
);

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const registrations = await Registration.find({ participant: req.user._id })
      .populate({ path: "event", populate: { path: "organizer", select: "organizerName" } })
      .sort({ createdAt: -1 });

    const upcomingEvents = registrations
      .filter((reg) => reg.event && new Date(reg.event.startDate) > now)
      .map((reg) => ({
        registrationId: reg._id,
        ticketId: reg.ticketId,
        eventId: reg.event._id,
        name: reg.event.name,
        type: reg.event.eventType,
        organizer: reg.event.organizer?.organizerName,
        schedule: { startDate: reg.event.startDate, endDate: reg.event.endDate },
        status: reg.status,
      }));

    const participationHistory = {
      normal: registrations.filter((reg) => reg.eventType === "normal"),
      merchandise: registrations.filter((reg) => reg.eventType === "merchandise"),
      completed: registrations.filter((reg) => reg.status === "completed"),
      cancelledOrRejected: registrations.filter((reg) => ["cancelled", "rejected"].includes(reg.status)),
    };

    return res.json({ upcomingEvents, participationHistory });
  })
);

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const history = await Registration.find({ participant: req.user._id })
      .populate({ path: "event", select: "name eventType organizer startDate endDate", populate: { path: "organizer", select: "organizerName" } })
      .sort({ createdAt: -1 });

    const records = history.map((reg) => ({
      id: reg._id,
      ticketId: reg.ticketId,
      eventName: reg.event?.name,
      eventType: reg.eventType,
      organizer: reg.event?.organizer?.organizerName,
      participationStatus: reg.status,
      teamName: reg.teamName || null,
      createdAt: reg.createdAt,
    }));

    return res.json({ records });
  })
);

router.get(
  "/recommendations",
  asyncHandler(async (req, res) => {
    const filters = {
      status: { $in: ["published", "ongoing"] },
      registrationDeadline: { $gte: new Date() },
    };

    if (req.user.followedOrganizers.length) {
      filters.organizer = { $in: req.user.followedOrganizers };
    }

    const interests = req.user.interests || [];
    if (interests.length) {
      filters.tags = { $in: interests.map((tag) => new RegExp(tag, "i")) };
    }

    const events = await Event.find(filters)
      .populate("organizer", "organizerName")
      .sort({ startDate: 1 })
      .limit(10);

    return res.json({ events });
  })
);

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const [totalRegistrations, completed] = await Promise.all([
      Registration.countDocuments({ participant: req.user._id }),
      Registration.countDocuments({ participant: req.user._id, status: "completed" }),
    ]);

    return res.json({ totalRegistrations, completed });
  })
);

module.exports = router;

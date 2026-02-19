const express = require("express");
const { optionalAuth } = require("../middlewares/auth");
const User = require("../models/User");
const Event = require("../models/Event");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const organizers = await User.find({ role: "organizer", isActive: true })
      .select("organizerName category description contactEmail")
      .sort({ organizerName: 1 });

    const followedSet = new Set((req.user?.followedOrganizers || []).map((id) => String(id)));
    const items = organizers.map((org) => ({
      ...org.toObject(),
      isFollowed: followedSet.has(String(org._id)),
    }));

    return res.json({ organizers: items });
  })
);

router.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const organizer = await User.findOne({ _id: req.params.id, role: "organizer", isActive: true }).select(
      "organizerName category description contactEmail"
    );

    if (!organizer) {
      return res.status(404).json({ message: "Organizer not found" });
    }

    const now = new Date();
    const events = await Event.find({ organizer: organizer._id, archived: false, status: { $in: ["published", "ongoing", "completed", "closed"] } }).sort({ startDate: 1 });

    const upcoming = events.filter((event) => new Date(event.startDate) > now);
    const past = events.filter((event) => new Date(event.endDate) <= now);

    return res.json({ organizer, upcoming, past });
  })
);

module.exports = router;
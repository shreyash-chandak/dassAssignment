const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const Registration = require("../models/Registration");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.get(
  "/:ticketId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const registration = await Registration.findOne({ ticketId: req.params.ticketId })
      .populate("event", "name eventType startDate endDate")
      .populate("participant", "firstName lastName email")
      .populate("organizer", "organizerName");

    if (!registration) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const allowed =
      req.user.role === "admin" ||
      String(registration.participant._id) === String(req.user._id) ||
      String(registration.organizer._id) === String(req.user._id);

    if (!allowed) {
      return res.status(403).json({ message: "Not allowed" });
    }

    return res.json({ ticket: registration });
  })
);

module.exports = router;
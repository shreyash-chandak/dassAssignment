const express = require("express");
const { requireAuth, allowRoles } = require("../middlewares/auth");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const Feedback = require("../models/Feedback");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/my/:eventId",
  allowRoles("participant"),
  asyncHandler(async (req, res) => {
    const feedback = await Feedback.findOne({ event: req.params.eventId, participant: req.user._id });
    return res.json({ feedback });
  })
);

router.post(
  "/:eventId",
  allowRoles("participant"),
  asyncHandler(async (req, res) => {
    const { rating, comment = "" } = req.body;
    const numericRating = Number(rating);

    if (Number.isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const registration = await Registration.findOne({
      event: event._id,
      participant: req.user._id,
      status: { $nin: ["cancelled", "rejected"] },
    });

    if (!registration) {
      return res.status(403).json({ message: "You are not registered for this event" });
    }

    const hasAttended = Boolean(registration.attendance?.scannedAt || registration.status === "completed");
    const eventEnded = new Date(event.endDate) <= new Date();
    if (!hasAttended && !eventEnded) {
      return res.status(400).json({ message: "Feedback is allowed only after attendance or event completion" });
    }

    const feedback = await Feedback.findOneAndUpdate(
      { event: event._id, participant: req.user._id },
      {
        event: event._id,
        participant: req.user._id,
        organizer: event.organizer,
        rating: numericRating,
        comment,
        anonymous: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ message: "Feedback submitted", feedback });
  })
);

router.get(
  "/event/:eventId",
  allowRoles("organizer", "admin"),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (req.user.role === "organizer" && String(event.organizer) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { rating, export: exportType } = req.query;
    const filters = { event: event._id };
    if (rating) {
      filters.rating = Number(rating);
    }

    const feedback = await Feedback.find(filters).sort({ createdAt: -1 });

    const stats = await Feedback.aggregate([
      { $match: { event: event._id } },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 },
          avg: { $avg: "$rating" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const total = stats.reduce((sum, row) => sum + row.count, 0);
    const weighted = stats.reduce((sum, row) => sum + row._id * row.count, 0);
    const averageRating = total ? weighted / total : 0;

    const distribution = [1, 2, 3, 4, 5].map((star) => ({
      rating: star,
      count: stats.find((row) => row._id === star)?.count || 0,
    }));

    const rows = feedback.map((entry) => ({
      rating: entry.rating,
      comment: entry.comment || "",
      createdAt: entry.createdAt,
    }));

    if (exportType === "csv") {
      const header = "rating,comment,createdAt";
      const csvBody = rows
        .map((row) =>
          [row.rating, row.comment, new Date(row.createdAt).toISOString()]
            .map((cell) => `\"${String(cell).replace(/\"/g, '\"\"')}\"`)
            .join(",")
        )
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=event-${event._id}-feedback.csv`);
      return res.send(`${header}\n${csvBody}`);
    }

    return res.json({
      event: { id: event._id, name: event.name },
      summary: {
        total,
        averageRating,
        distribution,
      },
      feedback: rows,
    });
  })
);

module.exports = router;

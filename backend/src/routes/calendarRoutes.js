const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const asyncHandler = require("../utils/asyncHandler");
const { createICSForEvent, createGoogleCalendarLink, createOutlookCalendarLink } = require("../services/calendarService");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/event/:eventId",
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId).populate("organizer", "organizerName email");
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (req.user.role === "participant") {
      const registration = await Registration.findOne({
        event: event._id,
        participant: req.user._id,
        status: { $nin: ["rejected", "cancelled"] },
      });
      if (!registration) {
        return res.status(403).json({ message: "You are not registered for this event" });
      }
    }

    const ics = createICSForEvent(event, req.user.email);

    if (req.query.download === "true") {
      res.setHeader("Content-Type", "text/calendar");
      res.setHeader("Content-Disposition", `attachment; filename=${String(event.name).replace(/[^a-zA-Z0-9]/g, "-")}.ics`);
      return res.send(ics);
    }

    return res.json({
      ics,
      googleCalendarLink: createGoogleCalendarLink(event),
      outlookCalendarLink: createOutlookCalendarLink(event),
    });
  })
);

router.get(
  "/batch",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "participant") {
      return res.status(400).json({ message: "Batch export is only available for participants" });
    }

    const registrations = await Registration.find({
      participant: req.user._id,
      status: { $nin: ["rejected", "cancelled"] },
    }).populate({ path: "event", populate: { path: "organizer", select: "organizerName email" } });

    const events = registrations.map((registration) => registration.event).filter(Boolean);
    const icsFiles = events.map((event) => ({
      eventId: event._id,
      eventName: event.name,
      ics: createICSForEvent(event, req.user.email),
      googleCalendarLink: createGoogleCalendarLink(event),
      outlookCalendarLink: createOutlookCalendarLink(event),
    }));

    return res.json({ events: icsFiles });
  })
);

module.exports = router;
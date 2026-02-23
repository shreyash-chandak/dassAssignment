const express = require("express");
const mongoose = require("mongoose");
const { requireAuth, allowRoles } = require("../middlewares/auth");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const AttendanceLog = require("../models/AttendanceLog");
const User = require("../models/User");
const PasswordResetRequest = require("../models/PasswordResetRequest");
const asyncHandler = require("../utils/asyncHandler");
const { createTicketPayload } = require("../services/ticketService");
const { sendEmail } = require("../services/emailService");

const router = express.Router();

router.use(requireAuth, allowRoles("organizer"));

async function postToDiscord(webhook, payload) {
  if (!webhook) {
    return;
  }

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Discord webhook failed", error.message);
  }
}

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    return res.json({ user: req.user.toSafeJSON() });
  })
);

router.put(
  "/profile",
  asyncHandler(async (req, res) => {
    const editable = ["organizerName", "category", "description", "contactEmail", "contactNumber", "discordWebhook"];
    for (const field of editable) {
      if (field in req.body) {
        req.user[field] = req.body[field];
      }
    }

    await req.user.save();
    return res.json({ message: "Profile updated", user: req.user.toSafeJSON() });
  })
);

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const events = await Event.find({ organizer: req.user._id, archived: false }).sort({ createdAt: -1 });
    const completedIds = events.filter((event) => event.status === "completed").map((event) => event._id);

    const stats = completedIds.length
      ? await Registration.aggregate([
          { $match: { event: { $in: completedIds }, status: { $nin: ["rejected", "cancelled"] } } },
          {
            $group: {
              _id: null,
              registrations: { $sum: 1 },
              sales: {
                $sum: {
                  $cond: [{ $eq: ["$eventType", "merchandise"] }, 1, 0],
                },
              },
              revenue: { $sum: "$amountPaid" },
              attendance: {
                $sum: {
                  $cond: [{ $ifNull: ["$attendance.scannedAt", false] }, 1, 0],
                },
              },
            },
          },
        ])
      : [];

    return res.json({
      eventsCarousel: events.map((event) => ({
        id: event._id,
        name: event.name,
        type: event.eventType,
        status: event.status,
      })),
      analytics: stats[0] || { registrations: 0, sales: 0, revenue: 0, attendance: 0 },
    });
  })
);

router.post(
  "/password-reset-request",
  asyncHandler(async (req, res) => {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ message: "reason is required" });
    }

    const pending = await PasswordResetRequest.findOne({
      organizer: req.user._id,
      status: "pending",
    });
    if (pending) {
      return res.status(409).json({ message: "A pending request already exists" });
    }

    const request = await PasswordResetRequest.create({
      organizer: req.user._id,
      reason,
      status: "pending",
    });

    return res.status(201).json({ message: "Password reset request submitted", request });
  })
);

router.get(
  "/ongoing-events",
  asyncHandler(async (req, res) => {
    const events = await Event.find({ organizer: req.user._id, status: "ongoing", archived: false }).sort({ startDate: 1 });
    return res.json({ events });
  })
);

router.post(
  "/events",
  asyncHandler(async (req, res) => {
    const payload = {
      ...req.body,
      organizer: req.user._id,
      status: "draft",
    };

    if (!payload.eventType) {
      return res.status(400).json({ message: "eventType is required" });
    }

    const event = await Event.create(payload);
    return res.status(201).json({ message: "Draft event created", event });
  })
);

router.patch(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const patch = req.body;

    if (event.status === "draft") {
      Object.assign(event, patch);
    } else if (event.status === "published") {
      const allowed = ["description", "registrationDeadline", "registrationLimit", "status"];
      for (const key of Object.keys(patch)) {
        if (!allowed.includes(key)) {
          return res.status(400).json({ message: `Cannot edit ${key} after publish` });
        }
      }

      if ("registrationDeadline" in patch && new Date(patch.registrationDeadline) < new Date(event.registrationDeadline)) {
        return res.status(400).json({ message: "Deadline can only be extended" });
      }

      if ("registrationLimit" in patch && Number(patch.registrationLimit) < Number(event.registrationLimit)) {
        return res.status(400).json({ message: "Registration limit can only increase" });
      }

      Object.assign(event, patch);
      if (patch.status && !["published", "closed", "ongoing", "completed"].includes(patch.status)) {
        return res.status(400).json({ message: "Invalid status transition" });
      }
    } else if (["ongoing", "completed"].includes(event.status)) {
      if (Object.keys(patch).some((key) => key !== "status")) {
        return res.status(400).json({ message: "Only status can be changed for ongoing/completed events" });
      }
      if (!["ongoing", "completed", "closed"].includes(patch.status)) {
        return res.status(400).json({ message: "Invalid status update" });
      }
      event.status = patch.status;
    } else if (event.status === "closed") {
      if (Object.keys(patch).length) {
        return res.status(400).json({ message: "Closed events cannot be edited" });
      }
    }

    if ("customFormFields" in patch) {
      const registrations = await Registration.countDocuments({ event: event._id });
      if (registrations > 0) {
        return res.status(400).json({ message: "Custom form is locked after first registration" });
      }
    }

    await event.save();
    return res.json({ message: "Event updated", event });
  })
);

router.post(
  "/events/:id/publish",
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id }).populate("organizer", "organizerName discordWebhook");
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.status !== "draft") {
      return res.status(400).json({ message: "Only draft events can be published" });
    }

    event.status = "published";
    await event.save();

    await postToDiscord(event.organizer.discordWebhook, {
      content: `New event published: ${event.name}\nType: ${event.eventType}\nStarts: ${new Date(event.startDate).toLocaleString()}`,
    });

    return res.json({ message: "Event published", event });
  })
);

router.get(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const registrations = await Registration.find({ event: event._id })
      .populate("participant", "firstName lastName email")
      .sort({ createdAt: -1 });

    const analytics = {
      registrations: registrations.length,
      sales: registrations.filter((r) => r.eventType === "merchandise").length,
      attendance: registrations.filter((r) => r.attendance?.scannedAt).length,
      revenue: registrations.reduce((sum, r) => sum + Number(r.amountPaid || 0), 0),
      teamCompletion: registrations.filter((r) => Boolean(r.teamName)).length,
    };

    const participants = registrations.map((r) => ({
      id: r._id,
      name: `${r.participant?.firstName || ""} ${r.participant?.lastName || ""}`.trim(),
      email: r.participant?.email,
      regDate: r.createdAt,
      eventType: r.eventType,
      payment: r.paymentStatus,
      paymentProofUrl: r.paymentProofUrl || null,
      merchandiseSelections: r.merchandiseSelections || [],
      team: r.teamName || null,
      attendance: Boolean(r.attendance?.scannedAt),
      ticketId: r.ticketId,
      status: r.status,
    }));

    return res.json({ event, analytics, participants });
  })
);

router.get(
  "/events/:id/participants",
  asyncHandler(async (req, res) => {
    const { search = "", payment, attendance, export: exportType } = req.query;
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const registrations = await Registration.find({ event: event._id })
      .populate("participant", "firstName lastName email")
      .sort({ createdAt: -1 });

    const regex = new RegExp(search, "i");
    const rows = registrations
      .map((r) => ({
        id: r._id,
        name: `${r.participant?.firstName || ""} ${r.participant?.lastName || ""}`.trim(),
        email: r.participant?.email || "",
        regDate: r.createdAt,
        eventType: r.eventType,
        payment: r.paymentStatus,
        paymentProofUrl: r.paymentProofUrl || "",
        team: r.teamName || "",
        attendance: r.attendance?.scannedAt ? "present" : "absent",
        status: r.status,
        ticketId: r.ticketId || "",
      }))
      .filter((row) => (!search ? true : regex.test(row.name) || regex.test(row.email)))
      .filter((row) => (!payment ? true : row.payment === payment))
      .filter((row) => (!attendance ? true : row.attendance === attendance));

    if (exportType === "csv") {
      const header = "name,email,regDate,payment,team,attendance,status,ticketId";
      const csvBody = rows
        .map((row) =>
          [row.name, row.email, new Date(row.regDate).toISOString(), row.payment, row.team, row.attendance, row.status, row.ticketId]
            .map((cell) => `\"${String(cell).replace(/\"/g, '\"\"')}\"`)
            .join(",")
        )
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=event-${event._id}-participants.csv`);
      return res.send(`${header}\n${csvBody}`);
    }

    return res.json({ participants: rows });
  })
);

router.post(
  "/orders/:registrationId/decision",
  asyncHandler(async (req, res) => {
    const { decision } = req.body;
    const registration = await Registration.findOne({
      _id: req.params.registrationId,
      organizer: req.user._id,
      eventType: "merchandise",
      status: "pending_approval",
    }).populate("event participant");

    if (!registration) {
      return res.status(404).json({ message: "Pending order not found" });
    }

    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "Decision must be approved or rejected" });
    }

    if (decision === "rejected") {
      registration.status = "rejected";
      registration.paymentStatus = "rejected";
      await registration.save();

      await sendEmail({
        to: registration.participant.email,
        subject: `Order rejected: ${registration.event.name}`,
        text: "Your merchandise payment proof was rejected. Please contact the organizer.",
      });

      return res.json({ message: "Order rejected", registration });
    }

    const event = await Event.findById(registration.event._id);
    const stockMap = new Map(event.merchandiseItems.map((item) => [String(item._id), item]));

    for (const selection of registration.merchandiseSelections) {
      const item = stockMap.get(String(selection.itemId));
      if (!item || item.stock < selection.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${selection.name}` });
      }
    }

    for (const selection of registration.merchandiseSelections) {
      const item = stockMap.get(String(selection.itemId));
      item.stock -= selection.quantity;
    }

    registration.status = "approved";
    registration.paymentStatus = "approved";

    const ticketData = await createTicketPayload({
      event,
      participant: registration.participant,
      registration,
    });

    registration.ticketId = ticketData.ticketId;
    registration.ticketQrData = ticketData.ticketQrData;

    await event.save();
    await registration.save();

    await sendEmail({
      to: registration.participant.email,
      subject: `Order approved: ${registration.event.name}`,
      text: `Your order is approved. Ticket ID: ${registration.ticketId}`,
    });

    return res.json({ message: "Order approved", registration });
  })
);

router.post(
  "/attendance/scan",
  asyncHandler(async (req, res) => {
    const { ticketId, manualOverride = false, note = "" } = req.body;
    if (!ticketId) {
      return res.status(400).json({ message: "ticketId is required" });
    }

    const registration = await Registration.findOne({ ticketId, organizer: req.user._id }).populate("event participant");
    if (!registration) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (registration.attendance?.scannedAt && !manualOverride) {
      await AttendanceLog.create({
        registration: registration._id,
        event: registration.event._id,
        action: "duplicate_rejected",
        by: req.user._id,
        note,
      });

      return res.status(409).json({
        message: "Duplicate scan rejected",
        registration: {
          id: registration._id,
          ticketId: registration.ticketId,
          participant: registration.participant.email,
          scannedAt: registration.attendance.scannedAt,
        },
      });
    }

    registration.attendance = {
      scannedAt: new Date(),
      scannedBy: req.user._id,
      manualOverride,
    };

    await registration.save();

    await AttendanceLog.create({
      registration: registration._id,
      event: registration.event._id,
      action: manualOverride ? "manual_override" : "scanned",
      by: req.user._id,
      note,
    });

    return res.json({
      message: manualOverride ? "Attendance manually overridden" : "Attendance marked",
      registration: {
        id: registration._id,
        ticketId: registration.ticketId,
        participant: registration.participant.email,
        scannedAt: registration.attendance.scannedAt,
      },
    });
  })
);

router.get(
  "/events/:id/attendance-report",
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const registrations = await Registration.find({ event: event._id }).populate("participant", "firstName lastName email");

    const rows = registrations.map((r) => ({
      name: `${r.participant?.firstName || ""} ${r.participant?.lastName || ""}`.trim(),
      email: r.participant?.email || "",
      ticketId: r.ticketId || "",
      scannedAt: r.attendance?.scannedAt ? new Date(r.attendance.scannedAt).toISOString() : "",
      status: r.attendance?.scannedAt ? "scanned" : "not_scanned",
    }));

    const header = "name,email,ticketId,scannedAt,status";
    const csvBody = rows
      .map((row) =>
        [row.name, row.email, row.ticketId, row.scannedAt, row.status]
          .map((cell) => `\"${String(cell).replace(/\"/g, '\"\"')}\"`)
          .join(",")
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=event-${event._id}-attendance.csv`);
    return res.send(`${header}\n${csvBody}`);
  })
);

module.exports = router;

const express = require("express");
const { requireAuth, allowRoles } = require("../middlewares/auth");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const PasswordResetRequest = require("../models/PasswordResetRequest");
const Feedback = require("../models/Feedback");
const asyncHandler = require("../utils/asyncHandler");
const { createTicketPayload } = require("../services/ticketService");
const { sendEmail } = require("../services/emailService");
const { emitToEvent } = require("../services/socketService");

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

function isAttendanceEligible(registration) {
  if (["rejected", "cancelled"].includes(registration.status)) {
    return false;
  }
  if (registration.eventType === "merchandise") {
    return registration.paymentStatus === "approved";
  }
  return true;
}

async function buildAttendanceSnapshot(eventId) {
  const registrations = await Registration.find({ event: eventId })
    .populate("participant", "firstName lastName email")
    .sort({ createdAt: 1 });

  const eligible = registrations.filter(isAttendanceEligible);
  const scanned = eligible.filter((row) => row.attendance?.scannedAt);
  const pending = eligible.filter((row) => !row.attendance?.scannedAt);

  const toRow = (row) => ({
    registrationId: row._id,
    name: `${row.participant?.firstName || ""} ${row.participant?.lastName || ""}`.trim(),
    email: row.participant?.email || "",
    ticketId: row.ticketId || "",
    paymentStatus: row.paymentStatus,
    scannedAt: row.attendance?.scannedAt || null,
    manualOverride: Boolean(row.attendance?.manualOverride),
    status: row.status,
  });

  return {
    totals: {
      eligible: eligible.length,
      scanned: scanned.length,
      pending: pending.length,
    },
    scanned: scanned.map(toRow),
    pending: pending.map(toRow),
  };
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
    const resetRequests = await PasswordResetRequest.find({ organizer: req.user._id }).sort({ createdAt: -1 }).limit(10);

    const stats = completedIds.length
      ? await Registration.aggregate([
          { $match: { event: { $in: completedIds }, status: { $nin: ["rejected", "cancelled"] } } },
          {
            $group: {
              _id: null,
              registrations: { $sum: 1 },
              sales: {
                $sum: {
                  $cond: [
                    {
                      $and: [{ $eq: ["$eventType", "merchandise"] }, { $eq: ["$paymentStatus", "approved"] }],
                    },
                    1,
                    0,
                  ],
                },
              },
              revenue: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$eventType", "normal"] },
                        { $and: [{ $eq: ["$eventType", "merchandise"] }, { $eq: ["$paymentStatus", "approved"] }] },
                      ],
                    },
                    "$amountPaid",
                    0,
                  ],
                },
              },
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
      resetRequests,
    });
  })
);

router.get(
  "/password-reset-requests",
  asyncHandler(async (req, res) => {
    const requests = await PasswordResetRequest.find({ organizer: req.user._id }).sort({ createdAt: -1 });
    return res.json({ requests });
  })
);

router.post(
  "/password-reset-requests",
  asyncHandler(async (req, res) => {
    const reason = String(req.body.reason || "").trim();
    if (!reason) {
      return res.status(400).json({ message: "Reason is required" });
    }

    const existing = await PasswordResetRequest.findOne({ organizer: req.user._id, status: "pending" });
    if (existing) {
      return res.status(409).json({ message: "A pending password reset request already exists" });
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
      registrations: registrations.filter((r) => !["rejected", "cancelled"].includes(r.status)).length,
      sales: registrations.filter((r) => r.eventType === "merchandise" && r.paymentStatus === "approved").length,
      attendance: registrations.filter((r) => r.attendance?.scannedAt).length,
      revenue: registrations.reduce((sum, r) => {
        if (r.eventType === "normal") {
          return sum + Number(r.amountPaid || 0);
        }
        if (r.eventType === "merchandise" && r.paymentStatus === "approved") {
          return sum + Number(r.amountPaid || 0);
        }
        return sum;
      }, 0),
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
      team: r.teamName || null,
      attendance: Boolean(r.attendance?.scannedAt),
      attendanceLogs: r.attendance?.logs || [],
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

router.get(
  "/events/:id/merch-orders",
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id, eventType: "merchandise" });
    if (!event || event.archived) {
      return res.status(404).json({ message: "Merchandise event not found" });
    }

    const query = { event: event._id, eventType: "merchandise" };
    if (status) {
      query.paymentStatus = status;
    }

    const orders = await Registration.find(query)
      .populate("participant", "firstName lastName email")
      .sort({ createdAt: -1 });

    return res.json({
      orders: orders.map((row) => ({
        id: row._id,
        participant: {
          name: `${row.participant?.firstName || ""} ${row.participant?.lastName || ""}`.trim(),
          email: row.participant?.email || "",
        },
        selections: row.merchandiseSelections || [],
        amountPaid: row.amountPaid,
        paymentStatus: row.paymentStatus,
        paymentProofUrl: row.paymentProofUrl || null,
        paymentReviewComment: row.paymentReviewComment || "",
        ticketId: row.ticketId || null,
        createdAt: row.createdAt,
      })),
    });
  })
);

router.patch(
  "/registrations/:id/payment",
  asyncHandler(async (req, res) => {
    const { action, comment = "" } = req.body;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Action must be approve or reject" });
    }

    const registration = await Registration.findOne({ _id: req.params.id, organizer: req.user._id })
      .populate("event")
      .populate("participant", "email firstName lastName");
    if (!registration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    if (registration.eventType !== "merchandise") {
      return res.status(400).json({ message: "Payment approval is only for merchandise orders" });
    }

    if (registration.paymentStatus !== "pending") {
      return res.status(400).json({ message: "Only pending orders can be reviewed" });
    }

    if (action === "approve") {
      const itemMap = new Map(registration.event.merchandiseItems.map((item) => [String(item._id), item]));
      for (const selection of registration.merchandiseSelections || []) {
        const item = itemMap.get(String(selection.itemId));
        if (!item || item.stock < selection.quantity) {
          return res.status(400).json({ message: `${selection.name} has insufficient stock for approval` });
        }
      }

      for (const selection of registration.merchandiseSelections || []) {
        const item = itemMap.get(String(selection.itemId));
        item.stock -= selection.quantity;
      }

      registration.paymentStatus = "approved";
      registration.status = "registered";
      registration.paymentReviewedBy = req.user._id;
      registration.paymentReviewedAt = new Date();
      registration.paymentReviewComment = String(comment || "").trim();

      if (!registration.ticketId) {
        const ticketData = await createTicketPayload({
          event: registration.event,
          participant: registration.participant,
          registration,
        });
        registration.ticketId = ticketData.ticketId;
        registration.ticketQrData = ticketData.ticketQrData;
      }

      await registration.event.save();
      await registration.save();

      await sendEmail({
        to: registration.participant.email,
        subject: `Purchase approved: ${registration.event.name}`,
        text: `Your merchandise order is approved. Ticket ID: ${registration.ticketId}`,
      });
    } else {
      registration.paymentStatus = "rejected";
      registration.status = "rejected";
      registration.paymentReviewedBy = req.user._id;
      registration.paymentReviewedAt = new Date();
      registration.paymentReviewComment = String(comment || "").trim();
      await registration.save();

      await sendEmail({
        to: registration.participant.email,
        subject: `Purchase rejected: ${registration.event.name}`,
        text: `Your merchandise order was rejected. ${registration.paymentReviewComment || ""}`.trim(),
      });
    }

    emitToEvent(registration.event._id, "merch:payment_update", {
      registrationId: registration._id,
      paymentStatus: registration.paymentStatus,
      ticketId: registration.ticketId || null,
    });

    return res.json({ message: `Order ${action}d`, registration });
  })
);

router.get(
  "/events/:id/attendance/dashboard",
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const snapshot = await buildAttendanceSnapshot(event._id);
    if (req.query.export === "csv") {
      const rows = [...snapshot.scanned, ...snapshot.pending];
      const header = "name,email,ticketId,paymentStatus,status,scannedAt,manualOverride";
      const csvBody = rows
        .map((row) =>
          [row.name, row.email, row.ticketId, row.paymentStatus, row.status, row.scannedAt || "", row.manualOverride ? "yes" : "no"]
            .map((cell) => `\"${String(cell).replace(/\"/g, '\"\"')}\"`)
            .join(",")
        )
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=event-${event._id}-attendance.csv`);
      return res.send(`${header}\n${csvBody}`);
    }

    return res.json(snapshot);
  })
);

router.post(
  "/events/:id/attendance/scan",
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    let ticketId = String(req.body.ticketId || "").trim();
    const qrPayload = req.body.qrPayload;
    if (!ticketId && qrPayload) {
      try {
        const parsed = typeof qrPayload === "string" ? JSON.parse(qrPayload) : qrPayload;
        ticketId = String(parsed.ticketId || "").trim();
      } catch (error) {
        return res.status(400).json({ message: "Invalid QR payload" });
      }
    }

    if (!ticketId) {
      return res.status(400).json({ message: "ticketId or qrPayload is required" });
    }

    const registration = await Registration.findOne({
      event: event._id,
      ticketId,
      status: { $nin: ["rejected", "cancelled"] },
    }).populate("participant", "firstName lastName email");
    if (!registration) {
      return res.status(404).json({ message: "Ticket not found for this event" });
    }

    if (registration.eventType === "merchandise" && registration.paymentStatus !== "approved") {
      return res.status(400).json({ message: "Ticket is not active until payment is approved" });
    }

    if (registration.attendance?.scannedAt) {
      return res.status(409).json({ message: "Duplicate scan detected" });
    }

    registration.attendance = registration.attendance || {};
    registration.attendance.scannedAt = new Date();
    registration.attendance.scannedBy = req.user._id;
    registration.attendance.manualOverride = false;
    registration.attendance.logs = registration.attendance.logs || [];
    registration.attendance.logs.push({
      action: "scan",
      source: String(req.body.source || "scanner"),
      note: "Ticket validated by QR scan",
      by: req.user._id,
      at: new Date(),
    });
    await registration.save();

    const snapshot = await buildAttendanceSnapshot(event._id);
    emitToEvent(event._id, "attendance:update", snapshot);

    return res.json({
      message: "Attendance marked",
      registration: {
        id: registration._id,
        ticketId: registration.ticketId,
        name: `${registration.participant?.firstName || ""} ${registration.participant?.lastName || ""}`.trim(),
        email: registration.participant?.email || "",
        scannedAt: registration.attendance.scannedAt,
      },
      totals: snapshot.totals,
    });
  })
);

router.post(
  "/registrations/:id/attendance/manual",
  asyncHandler(async (req, res) => {
    const { present, note = "" } = req.body;
    if (typeof present !== "boolean") {
      return res.status(400).json({ message: "present must be true or false" });
    }

    const registration = await Registration.findOne({ _id: req.params.id, organizer: req.user._id }).populate("event");
    if (!registration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    registration.attendance = registration.attendance || {};
    registration.attendance.logs = registration.attendance.logs || [];

    if (present) {
      registration.attendance.scannedAt = new Date();
      registration.attendance.scannedBy = req.user._id;
      registration.attendance.manualOverride = true;
      registration.attendance.logs.push({
        action: "manual_mark_present",
        source: "manual",
        note: String(note || "Manually marked present"),
        by: req.user._id,
        at: new Date(),
      });
    } else {
      registration.attendance.scannedAt = null;
      registration.attendance.scannedBy = null;
      registration.attendance.manualOverride = true;
      registration.attendance.logs.push({
        action: "manual_mark_absent",
        source: "manual",
        note: String(note || "Manually marked absent"),
        by: req.user._id,
        at: new Date(),
      });
    }

    await registration.save();
    const snapshot = await buildAttendanceSnapshot(registration.event._id);
    emitToEvent(registration.event._id, "attendance:update", snapshot);

    return res.json({ message: "Attendance override saved", registration, totals: snapshot.totals });
  })
);

router.get(
  "/events/:id/feedback",
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event || event.archived) {
      return res.status(404).json({ message: "Event not found" });
    }

    const query = { event: event._id };
    if (req.query.rating) {
      query.rating = Number(req.query.rating);
    }

    const feedbackList = await Feedback.find(query).sort({ createdAt: -1 });
    const allFeedback = await Feedback.find({ event: event._id }).select("rating");
    const total = allFeedback.length;
    const averageRating = total
      ? Number((allFeedback.reduce((sum, row) => sum + Number(row.rating), 0) / total).toFixed(2))
      : 0;

    const distribution = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: allFeedback.filter((row) => Number(row.rating) === rating).length,
    }));

    return res.json({
      averageRating,
      totalFeedback: total,
      distribution,
      feedback: feedbackList.map((row) => ({
        id: row._id,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.createdAt,
      })),
    });
  })
);

module.exports = router;

const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const ForumMessage = require("../models/ForumMessage");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

async function canAccessForum(user, eventId) {
  if (user.role === "admin") {
    return true;
  }

  if (user.role === "organizer") {
    const event = await Event.findOne({ _id: eventId, organizer: user._id });
    return Boolean(event);
  }

  if (user.role === "participant") {
    const reg = await Registration.findOne({
      event: eventId,
      participant: user._id,
      status: { $nin: ["rejected", "cancelled"] },
    });
    return Boolean(reg);
  }

  return false;
}

router.get(
  "/:eventId/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const allowed = await canAccessForum(req.user, req.params.eventId);
    if (!allowed) {
      return res.status(403).json({ message: "You are not allowed to view this forum" });
    }

    const messages = await ForumMessage.find({ event: req.params.eventId })
      .populate("user", "firstName lastName organizerName role")
      .sort({ isPinned: -1, createdAt: 1 });

    return res.json({ messages });
  })
);

router.post(
  "/:eventId/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const allowed = await canAccessForum(req.user, req.params.eventId);
    if (!allowed) {
      return res.status(403).json({ message: "You are not allowed to post in this forum" });
    }

    const { content, parent = null, isAnnouncement = false } = req.body;
    if (!content) {
      return res.status(400).json({ message: "content is required" });
    }

    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (isAnnouncement && req.user.role !== "organizer") {
      return res.status(403).json({ message: "Only organizers can post announcements" });
    }

    if (req.user.role === "organizer" && String(event.organizer) !== String(req.user._id)) {
      return res.status(403).json({ message: "Only the event organizer can moderate this forum" });
    }

    const message = await ForumMessage.create({
      event: req.params.eventId,
      user: req.user._id,
      content,
      parent,
      isAnnouncement,
    });

    const populated = await message.populate("user", "firstName lastName organizerName role");
    const io = req.app.get("io");
    io.to(`forum:${req.params.eventId}`).emit("forum:new-message", populated);

    return res.status(201).json({ message: populated });
  })
);

router.patch(
  "/:eventId/messages/:messageId/pin",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== "organizer") {
      return res.status(403).json({ message: "Only organizers can pin messages" });
    }

    const event = await Event.findOne({ _id: req.params.eventId, organizer: req.user._id });
    if (!event) {
      return res.status(403).json({ message: "Organizer mismatch" });
    }

    const message = await ForumMessage.findOne({ _id: req.params.messageId, event: req.params.eventId });
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.isPinned = !message.isPinned;
    await message.save();

    const io = req.app.get("io");
    io.to(`forum:${req.params.eventId}`).emit("forum:message-updated", message);

    return res.json({ message });
  })
);

router.delete(
  "/:eventId/messages/:messageId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const message = await ForumMessage.findOne({ _id: req.params.messageId, event: req.params.eventId });
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (req.user.role === "participant" && String(message.user) !== String(req.user._id)) {
      return res.status(403).json({ message: "Participants can delete only their own messages" });
    }

    if (req.user.role === "organizer") {
      const event = await Event.findOne({ _id: req.params.eventId, organizer: req.user._id });
      if (!event && String(message.user) !== String(req.user._id)) {
        return res.status(403).json({ message: "Organizer not authorized" });
      }
    }

    await message.deleteOne();
    const io = req.app.get("io");
    io.to(`forum:${req.params.eventId}`).emit("forum:message-deleted", { messageId: req.params.messageId });

    return res.json({ message: "Deleted" });
  })
);

router.post(
  "/:eventId/messages/:messageId/react",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { emoji } = req.body;
    if (!emoji) {
      return res.status(400).json({ message: "emoji is required" });
    }

    const allowed = await canAccessForum(req.user, req.params.eventId);
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const message = await ForumMessage.findOne({ _id: req.params.messageId, event: req.params.eventId });
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    let reaction = message.reactions.find((r) => r.emoji === emoji);
    if (!reaction) {
      reaction = { emoji, users: [] };
      message.reactions.push(reaction);
      reaction = message.reactions.find((r) => r.emoji === emoji);
    }

    const alreadyReacted = reaction.users.some((id) => String(id) === String(req.user._id));
    if (alreadyReacted) {
      reaction.users = reaction.users.filter((id) => String(id) !== String(req.user._id));
    } else {
      reaction.users.push(req.user._id);
    }

    message.reactions = message.reactions.filter((r) => r.users.length > 0);
    await message.save();

    const io = req.app.get("io");
    io.to(`forum:${req.params.eventId}`).emit("forum:message-updated", message);

    return res.json({ message });
  })
);

module.exports = router;
const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const Team = require("../models/Team");
const TeamMessage = require("../models/TeamMessage");
const Event = require("../models/Event");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

async function isAllowedInTeam(user, teamId) {
  const team = await Team.findById(teamId);
  if (!team) {
    return { allowed: false, team: null };
  }

  if (user.role === "admin") {
    return { allowed: true, team };
  }

  if (user.role === "organizer") {
    const event = await Event.findOne({ _id: team.event, organizer: user._id });
    return { allowed: Boolean(event), team };
  }

  const member = team.members.some((entry) => String(entry.participant) === String(user._id));
  return { allowed: member, team };
}

router.use(requireAuth);

router.get(
  "/my",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "participant") {
      return res.json({ teams: [] });
    }

    const teams = await Team.find({ "members.participant": req.user._id })
      .populate("event", "name")
      .sort({ updatedAt: -1 });

    return res.json({ teams });
  })
);

router.get(
  "/:teamId",
  asyncHandler(async (req, res) => {
    const { allowed, team } = await isAllowedInTeam(req.user, req.params.teamId);
    if (!allowed || !team) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const populated = await Team.findById(team._id)
      .populate("leader", "firstName lastName email")
      .populate("members.participant", "firstName lastName email")
      .populate("event", "name");

    return res.json({ team: populated });
  })
);

router.get(
  "/:teamId/messages",
  asyncHandler(async (req, res) => {
    const { allowed, team } = await isAllowedInTeam(req.user, req.params.teamId);
    if (!allowed || !team) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const messages = await TeamMessage.find({ team: team._id })
      .populate("sender", "firstName lastName email")
      .sort({ createdAt: 1 });

    return res.json({ messages });
  })
);

router.post(
  "/:teamId/messages",
  asyncHandler(async (req, res) => {
    const { allowed, team } = await isAllowedInTeam(req.user, req.params.teamId);
    if (!allowed || !team) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { text, attachmentUrl = "" } = req.body;
    if (!text) {
      return res.status(400).json({ message: "text is required" });
    }

    const message = await TeamMessage.create({
      team: team._id,
      sender: req.user._id,
      text,
      attachmentUrl,
    });

    const populated = await message.populate("sender", "firstName lastName email");
    const io = req.app.get("io");
    io.to(`team:${team._id}`).emit("team:new-message", populated);

    return res.status(201).json({ message: populated });
  })
);

module.exports = router;
const crypto = require("crypto");
const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { upload, toPublicUploadUrl } = require("../middlewares/upload");
const Team = require("../models/Team");
const TeamMessage = require("../models/TeamMessage");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { createTicketPayload } = require("../services/ticketService");
const { sendEmail } = require("../services/emailService");

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
  const invited = team.invites.some((invite) => invite.email === user.email);
  return { allowed: member || invited, team };
}

async function finalizeTeamRegistrations(team) {
  const acceptedMembers = team.members
    .filter((member) => member.status === "accepted")
    .map((member) => member.participant);

  if (acceptedMembers.length < team.maxMembers) {
    return;
  }

  const event = await Event.findById(team.event).populate("organizer", "_id");
  if (!event) {
    return;
  }

  team.status = "completed";

  const existingRegs = await Registration.find({ event: event._id, participant: { $in: acceptedMembers } }).select(
    "participant"
  );
  const existingSet = new Set(existingRegs.map((reg) => String(reg.participant)));

  for (const participantId of acceptedMembers) {
    if (existingSet.has(String(participantId))) {
      continue;
    }

    const participant = await User.findById(participantId).select("email");
    const registration = await Registration.create({
      event: event._id,
      participant: participantId,
      organizer: event.organizer._id,
      team: team._id,
      teamName: team.name,
      eventType: event.eventType,
      status: "registered",
      paymentStatus: "na",
    });

    const ticketData = await createTicketPayload({
      event,
      participant: participant || { _id: participantId, email: "participant@local" },
      registration,
    });

    registration.ticketId = ticketData.ticketId;
    registration.ticketQrData = ticketData.ticketQrData;
    await registration.save();
  }
}

router.use(requireAuth);

router.get(
  "/my",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "participant") {
      return res.json({ teams: [], pendingInvites: [] });
    }

    const teams = await Team.find({ "members.participant": req.user._id })
      .populate("event", "name")
      .sort({ updatedAt: -1 });

    const inviteTeams = await Team.find({ "invites.email": req.user.email, status: "forming" })
      .populate("event", "name")
      .sort({ updatedAt: -1 });

    const pendingInvites = inviteTeams
      .map((team) => {
        const invites = (team.invites || []).filter((invite) => invite.email === req.user.email);
        return invites.map((invite) => ({
          teamId: team._id,
          teamName: team.name,
          eventId: team.event?._id,
          eventName: team.event?.name,
          token: invite.token,
          status: invite.status,
          invitedAt: invite.invitedAt,
          respondedAt: invite.respondedAt,
        }));
      })
      .flat();

    return res.json({ teams, pendingInvites });
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
      .populate("invites.participant", "firstName lastName email")
      .populate("event", "name");

    return res.json({ team: populated });
  })
);

router.get(
  "/:teamId/invites",
  asyncHandler(async (req, res) => {
    const { allowed, team } = await isAllowedInTeam(req.user, req.params.teamId);
    if (!allowed || !team) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const populatedTeam = await Team.findById(team._id).populate("invites.participant", "firstName lastName email");
    return res.json({ invites: populatedTeam.invites || [] });
  })
);

router.post(
  "/:teamId/invites",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "participant") {
      return res.status(403).json({ message: "Only participants can create invites" });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "email is required" });
    }

    const team = await Team.findById(req.params.teamId).populate("event", "name");
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    if (String(team.leader) !== String(req.user._id)) {
      return res.status(403).json({ message: "Only team leader can invite" });
    }

    if (team.status !== "forming") {
      return res.status(400).json({ message: "Invites are closed for this team" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existingInvite = team.invites.find((invite) => invite.email === normalizedEmail && invite.status === "pending");
    if (existingInvite) {
      return res.status(409).json({ message: "Pending invite already exists for this email" });
    }

    const existingMemberUser = await User.findOne({ email: normalizedEmail }).select("_id");
    if (existingMemberUser) {
      const alreadyMember = team.members.some((member) => String(member.participant) === String(existingMemberUser._id));
      if (alreadyMember) {
        return res.status(409).json({ message: "User is already a team member" });
      }
    }

    if (team.invites.filter((invite) => invite.status === "pending").length + team.members.length >= team.maxMembers) {
      return res.status(400).json({ message: "Team invite capacity reached" });
    }

    const token = crypto.randomBytes(10).toString("hex");
    team.invites.push({
      email: normalizedEmail,
      token,
      status: "pending",
      invitedBy: req.user._id,
      invitedAt: new Date(),
    });
    await team.save();

    await sendEmail({
      to: normalizedEmail,
      subject: `Team invite: ${team.name}`,
      text: `You have been invited to join team ${team.name} for ${team.event?.name || "an event"}. Invite token: ${token}`,
    });

    return res.status(201).json({ message: "Invite created", token });
  })
);

router.post(
  "/:teamId/invites/respond",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "participant") {
      return res.status(403).json({ message: "Only participants can respond to invites" });
    }

    const { token, decision } = req.body;
    if (!token || !["accepted", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "token and valid decision are required" });
    }

    const team = await Team.findById(req.params.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const invite = (team.invites || []).find(
      (entry) => entry.token === token && entry.email === req.user.email.toLowerCase()
    );

    if (!invite) {
      return res.status(404).json({ message: "Invite not found" });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({ message: "Invite already processed" });
    }

    invite.status = decision;
    invite.respondedAt = new Date();

    if (decision === "accepted") {
      if (team.status !== "forming") {
        return res.status(400).json({ message: "Team is no longer accepting members" });
      }

      const alreadyMember = team.members.some((member) => String(member.participant) === String(req.user._id));
      if (!alreadyMember) {
        if (team.members.length >= team.maxMembers) {
          return res.status(400).json({ message: "Team is full" });
        }

        team.members.push({
          participant: req.user._id,
          status: "accepted",
          joinedAt: new Date(),
        });
      }

      invite.participant = req.user._id;
      await finalizeTeamRegistrations(team);
    }

    await team.save();

    return res.json({ message: `Invite ${decision}`, team });
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
  upload.single("attachment"),
  asyncHandler(async (req, res) => {
    const { allowed, team } = await isAllowedInTeam(req.user, req.params.teamId);
    if (!allowed || !team) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const text = req.body.text || "";
    const attachmentUrl = req.body.attachmentUrl || toPublicUploadUrl(req, req.file) || "";
    if (!text.trim() && !attachmentUrl) {
      return res.status(400).json({ message: "text or attachment is required" });
    }

    const message = await TeamMessage.create({
      team: team._id,
      sender: req.user._id,
      text: text.trim() || "[Attachment]",
      attachmentUrl,
    });

    const populated = await message.populate("sender", "firstName lastName email");
    const io = req.app.get("io");
    if (io) {
      io.to(`team:${team._id}`).emit("team:new-message", populated);
    }

    return res.status(201).json({ message: populated });
  })
);

module.exports = router;

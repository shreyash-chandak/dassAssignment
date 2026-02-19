const express = require("express");
const User = require("../models/User");
const { requireAuth } = require("../middlewares/auth");
const { signToken } = require("../services/tokenService");
const { isIIITEmail } = require("../utils/validators");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const {
      firstName,
      lastName,
      email,
      password,
      participantType,
      collegeOrOrg,
      contactNumber,
      interests = [],
      followedOrganizers = [],
    } = req.body;

    if (!firstName || !lastName || !email || !password || !participantType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["iiit", "non-iiit"].includes(participantType)) {
      return res.status(400).json({ message: "Invalid participant type" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (participantType === "iiit" && !isIIITEmail(normalizedEmail)) {
      return res.status(400).json({ message: "IIIT participants must use an approved IIIT email domain" });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const participant = await User.create({
      role: "participant",
      firstName,
      lastName,
      email: normalizedEmail,
      password,
      participantType,
      collegeOrOrg,
      contactNumber,
      interests,
      followedOrganizers,
      isActive: true,
    });

    const token = signToken(participant);

    return res.status(201).json({
      token,
      user: participant.toSafeJSON(),
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(user);

    return res.json({
      token,
      user: user.toSafeJSON(),
      redirectTo: `/${user.role}/dashboard`,
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    return res.json({ user: req.user.toSafeJSON() });
  })
);

router.post("/logout", (req, res) => {
  return res.json({ message: "Logout successful. Clear token on client." });
});

router.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Old and new passwords are required" });
    }

    const valid = await req.user.comparePassword(oldPassword);
    if (!valid) {
      return res.status(400).json({ message: "Old password is incorrect" });
    }

    req.user.password = newPassword;
    await req.user.save();

    return res.json({ message: "Password changed successfully" });
  })
);

module.exports = router;
const express = require("express");
const User = require("../models/User");
const { requireAuth } = require("../middlewares/auth");
const { signToken } = require("../services/tokenService");
const { isIIITEmail } = require("../utils/validators");
const asyncHandler = require("../utils/asyncHandler");
const {
  verifyCaptcha,
  getAttemptState,
  registerFailure,
  registerSuccess,
  logSecurityEvent,
} = require("../services/securityService");

const router = express.Router();

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const blockedState = getAttemptState(ip);
    if (blockedState.blocked) {
      await logSecurityEvent({
        ip,
        email: req.body?.email,
        type: "ip_blocked",
        reason: "Blocked IP attempted participant registration",
        blockedUntil: blockedState.blockedUntil,
      });
      return res.status(429).json({ message: `Too many failed attempts. Try again after ${blockedState.blockedUntil.toISOString()}` });
    }

    const captchaResult = verifyCaptcha({
      captchaId: req.body.captchaId,
      captchaAnswer: req.body.captchaAnswer,
      ip,
    });
    if (!captchaResult.ok) {
      await registerFailure({
        ip,
        email: req.body?.email,
        reason: captchaResult.reason,
        type: "captcha_failed",
        metadata: { route: "register" },
      });
      return res.status(400).json({ message: captchaResult.reason });
    }

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
      await registerFailure({
        ip,
        email,
        reason: "Missing required registration fields",
        metadata: { route: "register" },
      });
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["iiit", "non-iiit"].includes(participantType)) {
      await registerFailure({
        ip,
        email,
        reason: "Invalid participant type",
        metadata: { route: "register" },
      });
      return res.status(400).json({ message: "Invalid participant type" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (participantType === "iiit" && !isIIITEmail(normalizedEmail)) {
      await registerFailure({
        ip,
        email: normalizedEmail,
        reason: "IIIT domain validation failed",
        metadata: { route: "register" },
      });
      return res.status(400).json({ message: "IIIT participants must use an approved IIIT email domain" });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      await registerFailure({
        ip,
        email: normalizedEmail,
        reason: "Duplicate email registration attempt",
        metadata: { route: "register" },
      });
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
    registerSuccess(ip);
    await logSecurityEvent({
      ip,
      email: normalizedEmail,
      type: "auth_success",
      reason: "Participant registration successful",
      metadata: { route: "register" },
    });

    return res.status(201).json({
      token,
      user: participant.toSafeJSON(),
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const blockedState = getAttemptState(ip);
    if (blockedState.blocked) {
      await logSecurityEvent({
        ip,
        email: req.body?.email,
        type: "ip_blocked",
        reason: "Blocked IP attempted login",
        blockedUntil: blockedState.blockedUntil,
      });
      return res.status(429).json({ message: `Too many failed attempts. Try again after ${blockedState.blockedUntil.toISOString()}` });
    }

    const captchaResult = verifyCaptcha({
      captchaId: req.body.captchaId,
      captchaAnswer: req.body.captchaAnswer,
      ip,
    });
    if (!captchaResult.ok) {
      await registerFailure({
        ip,
        email: req.body?.email,
        reason: captchaResult.reason,
        type: "captcha_failed",
        metadata: { route: "login" },
      });
      return res.status(400).json({ message: captchaResult.reason });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      await registerFailure({
        ip,
        email,
        reason: "Missing email or password on login",
        metadata: { route: "login" },
      });
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.isActive) {
      await registerFailure({
        ip,
        email,
        reason: "Invalid credentials - user not found/inactive",
        metadata: { route: "login" },
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      await registerFailure({
        ip,
        email,
        reason: "Invalid credentials - wrong password",
        metadata: { route: "login", role: user.role },
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(user);
    registerSuccess(ip);
    await logSecurityEvent({
      ip,
      email: user.email,
      type: "auth_success",
      reason: "Login successful",
      metadata: { route: "login", role: user.role },
    });

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

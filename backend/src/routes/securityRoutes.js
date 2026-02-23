const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { createCaptcha } = require("../services/securityService");

const router = express.Router();

router.get(
  "/captcha",
  asyncHandler(async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const payload = createCaptcha(ip);
    return res.json(payload);
  })
);

module.exports = router;

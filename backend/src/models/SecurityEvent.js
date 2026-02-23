const mongoose = require("mongoose");

const securityEventSchema = new mongoose.Schema(
  {
    ip: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    type: {
      type: String,
      enum: ["captcha_failed", "auth_failed", "ip_blocked", "auth_success"],
      required: true,
    },
    reason: { type: String, trim: true },
    blockedUntil: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

securityEventSchema.index({ createdAt: -1 });
securityEventSchema.index({ ip: 1, createdAt: -1 });

module.exports = mongoose.model("SecurityEvent", securityEventSchema);

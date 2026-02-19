const mongoose = require("mongoose");

const resetRequestSchema = new mongoose.Schema(
  {
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    adminComment: { type: String, trim: true },
    generatedPassword: { type: String, trim: true },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

resetRequestSchema.index({ organizer: 1, createdAt: -1 });

module.exports = mongoose.model("PasswordResetRequest", resetRequestSchema);
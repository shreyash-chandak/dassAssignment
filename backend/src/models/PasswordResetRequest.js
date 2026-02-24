const mongoose = require("mongoose");

const passwordResetRequestSchema = new mongoose.Schema(
  {
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminComment: { type: String, trim: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    generatedPassword: { type: String, trim: true },
  },
  { timestamps: true }
);

passwordResetRequestSchema.index({ organizer: 1, status: 1 });

module.exports = mongoose.model("PasswordResetRequest", passwordResetRequestSchema);

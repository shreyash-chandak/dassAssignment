const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    participant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
    teamName: { type: String, trim: true },

    eventType: { type: String, enum: ["normal", "merchandise"], required: true },
    status: {
      type: String,
      enum: ["registered", "pending_approval", "approved", "rejected", "cancelled", "completed"],
      default: "registered",
    },
    ticketId: { type: String, unique: true, sparse: true },
    ticketQrData: { type: String },

    formResponses: { type: mongoose.Schema.Types.Mixed, default: {} },

    merchandiseSelections: [
      {
        itemId: { type: mongoose.Schema.Types.ObjectId },
        name: String,
        quantity: Number,
        unitPrice: Number,
      },
    ],
    amountPaid: { type: Number, min: 0, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["na", "pending", "approved", "rejected"],
      default: "na",
    },
    paymentProofUrl: { type: String },

    attendance: {
      scannedAt: { type: Date },
      scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      manualOverride: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

registrationSchema.index({ participant: 1, event: 1 }, { unique: true });
registrationSchema.index({ event: 1, status: 1 });
registrationSchema.index({ ticketId: 1 });

module.exports = mongoose.model("Registration", registrationSchema);
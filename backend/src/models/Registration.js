const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    participant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teamName: { type: String, trim: true },

    eventType: { type: String, enum: ["normal", "merchandise"], required: true },
    status: {
      type: String,
      enum: ["registered", "rejected", "cancelled", "completed"],
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
    paymentProofUrl: { type: String, trim: true },
    paymentReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    paymentReviewedAt: { type: Date },
    paymentReviewComment: { type: String, trim: true },

    attendance: {
      scannedAt: { type: Date },
      scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      manualOverride: { type: Boolean, default: false },
      logs: [
        {
          action: { type: String, trim: true },
          source: { type: String, trim: true },
          note: { type: String, trim: true },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          at: { type: Date, default: Date.now },
        },
      ],
    },
  },
  { timestamps: true }
);

registrationSchema.index({ participant: 1, event: 1 }, { unique: true });
registrationSchema.index({ event: 1, status: 1 });

module.exports = mongoose.model("Registration", registrationSchema);

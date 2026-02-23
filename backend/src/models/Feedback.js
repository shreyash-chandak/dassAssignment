const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    participant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, default: "" },
    anonymous: { type: Boolean, default: true },
  },
  { timestamps: true }
);

feedbackSchema.index({ event: 1, participant: 1 }, { unique: true });
feedbackSchema.index({ organizer: 1, event: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);

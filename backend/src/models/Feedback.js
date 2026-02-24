const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    participant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, maxlength: 2000 },
    anonymous: { type: Boolean, default: true },
  },
  { timestamps: true }
);

feedbackSchema.index({ event: 1, participant: 1 }, { unique: true });
feedbackSchema.index({ event: 1, rating: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);

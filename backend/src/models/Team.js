const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    leader: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    inviteCode: { type: String, required: true, unique: true },
    maxMembers: { type: Number, min: 1, required: true },
    members: [
      {
        participant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
        joinedAt: { type: Date },
      },
    ],
    status: { type: String, enum: ["forming", "completed", "cancelled"], default: "forming" },
  },
  { timestamps: true }
);

teamSchema.index({ event: 1, inviteCode: 1 });

module.exports = mongoose.model("Team", teamSchema);
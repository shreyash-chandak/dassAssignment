const mongoose = require("mongoose");

const inviteSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    token: { type: String, required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
    participant: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    invitedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
  },
  { _id: true }
);

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
    invites: [inviteSchema],
    status: { type: String, enum: ["forming", "completed", "cancelled"], default: "forming" },
  },
  { timestamps: true }
);

teamSchema.index({ event: 1, inviteCode: 1 });
teamSchema.index({ "invites.token": 1 });
teamSchema.index({ "invites.email": 1, event: 1 });

module.exports = mongoose.model("Team", teamSchema);

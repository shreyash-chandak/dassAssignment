const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false }
);

const forumMessageSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "ForumMessage", default: null },
    isPinned: { type: Boolean, default: false },
    isAnnouncement: { type: Boolean, default: false },
    reactions: [reactionSchema],
  },
  { timestamps: true }
);

forumMessageSchema.index({ event: 1, createdAt: 1 });

module.exports = mongoose.model("ForumMessage", forumMessageSchema);
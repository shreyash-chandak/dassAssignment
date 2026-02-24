const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true, trim: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false }
);

const forumMessageSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorRole: { type: String, enum: ["participant", "organizer"], required: true },
    parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: "ForumMessage", default: null },
    text: { type: String, required: true, trim: true, maxlength: 1200 },
    isAnnouncement: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date },
    reactions: [reactionSchema],
  },
  { timestamps: true }
);

forumMessageSchema.index({ event: 1, createdAt: 1 });
forumMessageSchema.index({ event: 1, parentMessage: 1 });

module.exports = mongoose.model("ForumMessage", forumMessageSchema);

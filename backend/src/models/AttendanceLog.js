const mongoose = require("mongoose");

const attendanceLogSchema = new mongoose.Schema(
  {
    registration: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    action: {
      type: String,
      enum: ["scanned", "duplicate_rejected", "manual_override"],
      required: true,
    },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AttendanceLog", attendanceLogSchema);
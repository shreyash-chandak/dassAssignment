const mongoose = require("mongoose");

const formFieldSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "textarea", "number", "dropdown", "checkbox", "file", "email", "phone"],
      default: "text",
    },
    required: { type: Boolean, default: false },
    options: [{ type: String, trim: true }],
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const merchandiseItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    size: { type: String, trim: true },
    color: { type: String, trim: true },
    variant: { type: String, trim: true },
    stock: { type: Number, min: 0, required: true },
    price: { type: Number, min: 0, required: true },
    sku: { type: String, trim: true },
  },
  { timestamps: false }
);

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    eventType: { type: String, enum: ["normal", "merchandise"], required: true },
    eligibility: { type: String, default: "all", trim: true },
    registrationDeadline: { type: Date, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    registrationLimit: { type: Number, min: 1, required: true },
    registrationFee: { type: Number, min: 0, default: 0 },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tags: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["draft", "published", "ongoing", "completed", "closed"],
      default: "draft",
    },
    customFormFields: [formFieldSchema],
    formLocked: { type: Boolean, default: false },
    merchandiseItems: [merchandiseItemSchema],
    purchaseLimitPerParticipant: { type: Number, min: 1, default: 1 },

    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

eventSchema.index({ name: "text", description: "text", tags: "text" });
eventSchema.index({ organizer: 1, status: 1 });

module.exports = mongoose.model("Event", eventSchema);

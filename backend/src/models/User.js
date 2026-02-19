const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["participant", "organizer", "admin"],
      required: true,
    },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    participantType: {
      type: String,
      enum: ["iiit", "non-iiit", null],
      default: null,
    },
    collegeOrOrg: { type: String, trim: true },
    contactNumber: { type: String, trim: true },
    interests: [{ type: String, trim: true }],
    followedOrganizers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    organizerName: { type: String, trim: true },
    category: { type: String, trim: true },
    description: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    discordWebhook: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const data = this.toObject();
  delete data.password;
  return data;
};

module.exports = mongoose.model("User", userSchema);
const User = require("../models/User");
const env = require("./env");

async function seedAdmin() {
  const existingAdmin = await User.findOne({ role: "admin" });
  if (existingAdmin) {
    return existingAdmin;
  }

  const admin = await User.create({
    role: "admin",
    firstName: "System",
    lastName: "Admin",
    email: env.adminEmail.toLowerCase(),
    password: env.adminPassword,
    participantType: null,
    collegeOrOrg: "IIIT",
    contactNumber: "0000000000",
    organizerName: "Felicity Admin",
    category: "System",
    description: "System administrator",
    contactEmail: env.adminEmail.toLowerCase(),
    isActive: true,
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded admin account: ${admin.email}`);
  return admin;
}

module.exports = seedAdmin;
const dotenv = require("dotenv");

dotenv.config();

const env = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/felicity",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  adminEmail: process.env.ADMIN_EMAIL || "admin@felicity.local",
  adminPassword: process.env.ADMIN_PASSWORD || "ChangeMe123!",
  allowedIIITDomains: (process.env.ALLOWED_IIIT_DOMAINS || "iiit.ac.in")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
};

module.exports = env;
const env = require("../config/env");

function isIIITEmail(email = "") {
  const [, domain = ""] = email.toLowerCase().split("@");
  return env.allowedIIITDomains.includes(domain);
}

function randomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

module.exports = { isIIITEmail, randomPassword };
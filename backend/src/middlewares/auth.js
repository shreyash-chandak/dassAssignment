const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");

async function resolveUserFromToken(req, res, next, required) {
  try {
    const authHeader = req.headers.authorization || "";
    const queryToken = typeof req.query?.token === "string" ? req.query.token : null;
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;

    if (!token) {
      if (required) {
        return res.status(401).json({ message: "Authentication required" });
      }
      return next();
    }

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid session" });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (required) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    return next();
  }
}

function requireAuth(req, res, next) {
  return resolveUserFromToken(req, res, next, true);
}

function optionalAuth(req, res, next) {
  return resolveUserFromToken(req, res, next, false);
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You are not allowed to access this resource" });
    }

    return next();
  };
}

module.exports = { requireAuth, optionalAuth, allowRoles };

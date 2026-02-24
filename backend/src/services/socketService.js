const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");

let ioRef = null;

function roomForEvent(eventId) {
  return `event:${String(eventId)}`;
}

function getIO() {
  return ioRef;
}

function emitToEvent(eventId, type, payload) {
  if (!ioRef || !eventId) {
    return;
  }
  ioRef.to(roomForEvent(eventId)).emit(type, payload);
}

function initSocket(server) {
  ioRef = new Server(server, {
    cors: {
      origin: env.frontendUrl,
      credentials: true,
    },
  });

  ioRef.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }

      const payload = jwt.verify(String(token), env.jwtSecret);
      const user = await User.findById(payload.userId);
      if (!user || !user.isActive) {
        return next(new Error("Invalid session"));
      }

      socket.user = user;
      return next();
    } catch (error) {
      return next(new Error("Invalid session"));
    }
  });

  ioRef.on("connection", (socket) => {
    socket.on("forum:join", ({ eventId }) => {
      if (!eventId) {
        return;
      }
      socket.join(roomForEvent(eventId));
    });

    socket.on("forum:leave", ({ eventId }) => {
      if (!eventId) {
        return;
      }
      socket.leave(roomForEvent(eventId));
    });
  });
}

module.exports = { initSocket, getIO, emitToEvent, roomForEvent };

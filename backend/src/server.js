const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const app = require("./app");
const connectDatabase = require("./config/db");
const seedAdmin = require("./config/seedAdmin");
const env = require("./config/env");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.frontendUrl,
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    socket.user = payload;
    return next();
  } catch (error) {
    return next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  if (socket.user?.userId) {
    onlineUsers.set(socket.id, socket.user.userId);
  }

  socket.on("forum:join", ({ eventId }) => {
    socket.join(`forum:${eventId}`);
  });

  socket.on("team:join", ({ teamId }) => {
    socket.join(`team:${teamId}`);
    io.to(`team:${teamId}`).emit("team:presence", {
      userId: socket.user?.userId,
      online: true,
      connectedAt: new Date().toISOString(),
    });
  });

  socket.on("team:typing", ({ teamId, isTyping }) => {
    socket.to(`team:${teamId}`).emit("team:typing", {
      userId: socket.user?.userId,
      isTyping,
    });
  });

  socket.on("disconnect", () => {
    const userId = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);

    if (userId) {
      io.emit("presence:update", {
        userId,
        online: false,
        disconnectedAt: new Date().toISOString(),
      });
    }
  });
});

async function bootstrap() {
  await connectDatabase();
  await seedAdmin();

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to bootstrap server", error);
  process.exit(1);
});
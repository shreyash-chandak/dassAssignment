const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const env = require("./config/env");

const authRoutes = require("./routes/authRoutes");
const participantRoutes = require("./routes/participantRoutes");
const eventRoutes = require("./routes/eventRoutes");
const clubRoutes = require("./routes/clubRoutes");
const organizerRoutes = require("./routes/organizerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const forumRoutes = require("./routes/forumRoutes");
const teamRoutes = require("./routes/teamRoutes");
const calendarRoutes = require("./routes/calendarRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/participants", participantRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/clubs", clubRoutes);
app.use("/api/organizer", organizerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/forum", forumRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/tickets", ticketRoutes);

app.use(errorHandler);

module.exports = app;
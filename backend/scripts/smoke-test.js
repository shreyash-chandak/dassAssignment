const assert = require("assert");
const path = require("path");
const supertest = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

async function run() {
  const mem = await MongoMemoryServer.create();

  process.env.MONGODB_URI = mem.getUri();
  process.env.JWT_SECRET = "smoke-test-secret";
  process.env.JWT_EXPIRES_IN = "7d";
  process.env.ADMIN_EMAIL = "admin@smoke.test";
  process.env.ADMIN_PASSWORD = "Admin123!";
  process.env.FRONTEND_URL = "http://localhost:5173";

  const app = require(path.join(__dirname, "../src/app"));
  const connectDatabase = require(path.join(__dirname, "../src/config/db"));
  const seedAdmin = require(path.join(__dirname, "../src/config/seedAdmin"));
  const Event = require(path.join(__dirname, "../src/models/Event"));

  await connectDatabase();
  await seedAdmin();

  const api = supertest(app);
  const now = Date.now();

  const adminLogin = await api.post("/api/auth/login").send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  assert.equal(adminLogin.status, 200, "Admin login failed");
  const adminToken = adminLogin.body.token;

  const organizerEmail = "tech.club@felicity.local";
  const organizerPassword = "TechClub#123";
  const createOrganizer = await api
    .post("/api/admin/organizers")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      organizerName: "Tech Club",
      category: "Technical",
      description: "Runs coding events",
      contactEmail: "tech@club.test",
      contactNumber: "1112223333",
      email: organizerEmail,
      password: organizerPassword,
    });
  assert.equal(createOrganizer.status, 201, "Organizer creation failed");

  const organizerLogin = await api.post("/api/auth/login").send({
    email: organizerEmail,
    password: organizerPassword,
  });
  assert.equal(organizerLogin.status, 200, "Organizer login failed");
  const organizerToken = organizerLogin.body.token;

  const participantRegister = await api.post("/api/auth/register").send({
    firstName: "Alex",
    lastName: "Ray",
    email: "alex@example.com",
    password: "Password1!",
    participantType: "non-iiit",
    collegeOrOrg: "Outside College",
    contactNumber: "9999999999",
  });
  assert.equal(participantRegister.status, 201, "Participant register failed");
  const participantToken = participantRegister.body.token;

  const normalEvent = await api
    .post("/api/organizer/events")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      name: "Code Sprint",
      description: "Fast coding challenge",
      eventType: "normal",
      eligibility: "all",
      registrationDeadline: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(now + 72 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(now + 73 * 60 * 60 * 1000).toISOString(),
      registrationLimit: 100,
      registrationFee: 100,
      tags: ["coding", "contest"],
      customFormFields: [{ id: "github", label: "GitHub", type: "text", required: true, order: 1 }],
    });
  assert.equal(normalEvent.status, 201, "Normal event create failed");
  const normalEventId = normalEvent.body.event._id;

  const publishNormal = await api
    .post(`/api/organizer/events/${normalEventId}/publish`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({});
  assert.equal(publishNormal.status, 200, "Normal event publish failed");

  const normalReg = await api
    .post(`/api/events/${normalEventId}/register`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ formResponses: { github: "alexdev" } });
  assert.equal(normalReg.status, 201, "Normal registration failed");
  const normalTicket = normalReg.body.registration.ticketId;
  assert.ok(normalTicket, "Normal ticket not generated");

  const forumPost = await api
    .post(`/api/events/${normalEventId}/forum/messages`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ text: "Is this event beginner friendly?" });
  assert.equal(forumPost.status, 201, "Forum post failed");
  const forumMessageId = forumPost.body.message.id;

  const forumReply = await api
    .post(`/api/events/${normalEventId}/forum/messages`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ text: "Yes, absolutely.", parentMessage: forumMessageId, isAnnouncement: true });
  assert.equal(forumReply.status, 201, "Organizer forum reply failed");

  const forumReact = await api
    .post(`/api/events/${normalEventId}/forum/messages/${forumMessageId}/react`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ emoji: "+1" });
  assert.equal(forumReact.status, 200, "Forum reaction failed");

  const attendanceScan = await api
    .post(`/api/organizer/events/${normalEventId}/attendance/scan`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ ticketId: normalTicket, source: "smoke" });
  assert.equal(attendanceScan.status, 200, "Attendance scan failed");

  const duplicateScan = await api
    .post(`/api/organizer/events/${normalEventId}/attendance/scan`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ ticketId: normalTicket, source: "smoke" });
  assert.equal(duplicateScan.status, 409, "Duplicate attendance scan should fail");

  const manualAbsent = await api
    .post(`/api/organizer/registrations/${normalReg.body.registration._id}/attendance/manual`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ present: false, note: "Manual correction" });
  assert.equal(manualAbsent.status, 200, "Manual attendance override failed");

  const merchEvent = await api
    .post("/api/organizer/events")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      name: "Merch Drop",
      description: "Official hoodies",
      eventType: "merchandise",
      eligibility: "all",
      registrationDeadline: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(now + 72 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(now + 80 * 60 * 60 * 1000).toISOString(),
      registrationLimit: 300,
      registrationFee: 0,
      tags: ["merch"],
      purchaseLimitPerParticipant: 3,
      merchandiseItems: [{ name: "Hoodie", variant: "Classic", size: "M", color: "Black", stock: 20, price: 500 }],
    });
  assert.equal(merchEvent.status, 201, "Merch event create failed");
  const merchEventId = merchEvent.body.event._id;

  const publishMerch = await api
    .post(`/api/organizer/events/${merchEventId}/publish`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({});
  assert.equal(publishMerch.status, 200, "Merch event publish failed");

  const merchDetails = await api.get(`/api/events/${merchEventId}`).set("Authorization", `Bearer ${participantToken}`);
  const merchItemId = merchDetails.body.event.merchandiseItems[0]._id;

  const merchPurchase = await api
    .post(`/api/events/${merchEventId}/purchase`)
    .set("Authorization", `Bearer ${participantToken}`)
    .field("selections", JSON.stringify([{ itemId: merchItemId, quantity: 1 }]))
    .attach("paymentProof", Buffer.from("proof-image"), "proof.png");
  assert.equal(merchPurchase.status, 201, "Merch purchase request failed");
  assert.equal(merchPurchase.body.registration.paymentStatus, "pending", "Merch purchase should be pending");
  assert.ok(!merchPurchase.body.registration.ticketId, "Pending purchase should not have ticket");

  const pendingOrders = await api
    .get(`/api/organizer/events/${merchEventId}/merch-orders?status=pending`)
    .set("Authorization", `Bearer ${organizerToken}`);
  assert.equal(pendingOrders.status, 200, "Merch orders list failed");
  assert.equal(pendingOrders.body.orders.length, 1, "Expected one pending merch order");

  const approveOrder = await api
    .patch(`/api/organizer/registrations/${merchPurchase.body.registration._id}/payment`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ action: "approve", comment: "Payment verified" });
  assert.equal(approveOrder.status, 200, "Merch order approval failed");
  assert.equal(approveOrder.body.registration.paymentStatus, "approved", "Payment should be approved");
  assert.ok(approveOrder.body.registration.ticketId, "Approved merch should get ticket");

  const attendanceDashboard = await api
    .get(`/api/organizer/events/${normalEventId}/attendance/dashboard`)
    .set("Authorization", `Bearer ${organizerToken}`);
  assert.equal(attendanceDashboard.status, 200, "Attendance dashboard failed");

  const resetRequest = await api
    .post("/api/organizer/password-reset-requests")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ reason: "Credentials rotation" });
  assert.equal(resetRequest.status, 201, "Organizer reset request failed");

  const adminDashboard = await api
    .get("/api/admin/dashboard")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(adminDashboard.status, 200, "Admin dashboard failed");
  assert.ok(adminDashboard.body.pendingResetRequests >= 1, "Pending reset requests should be visible on admin dashboard");

  const resetRequests = await api
    .get("/api/admin/password-reset-requests")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(resetRequests.status, 200, "Admin reset request list failed");
  assert.ok(resetRequests.body.requests.length >= 1, "Expected reset request in admin list");

  const approveReset = await api
    .patch(`/api/admin/password-reset-requests/${resetRequest.body.request._id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ action: "approve", comment: "Approved for rotation" });
  assert.equal(approveReset.status, 200, "Admin reset approval failed");
  assert.ok(approveReset.body.generatedPassword, "Approved reset should return generated password");

  const organizerRelogin = await api.post("/api/auth/login").send({
    email: organizerEmail,
    password: approveReset.body.generatedPassword,
  });
  assert.equal(organizerRelogin.status, 200, "Organizer should login with reset password");

  await Event.findByIdAndUpdate(normalEventId, {
    endDate: new Date(now - 2 * 60 * 60 * 1000),
    status: "completed",
  });

  const submitFeedback = await api
    .post(`/api/events/${normalEventId}/feedback`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ rating: 5, comment: "Great event!" });
  assert.equal(submitFeedback.status, 201, "Feedback submission failed");

  const organizerFeedback = await api
    .get(`/api/organizer/events/${normalEventId}/feedback`)
    .set("Authorization", `Bearer ${organizerToken}`);
  assert.equal(organizerFeedback.status, 200, "Organizer feedback analytics failed");
  assert.equal(organizerFeedback.body.totalFeedback, 1, "Feedback analytics count mismatch");

  await mongoose.disconnect();
  await mem.stop();
  console.log("Smoke tests passed");
}

run().catch(async (error) => {
  console.error("Smoke tests failed", error);
  try {
    await mongoose.disconnect();
  } catch (e) {
    // ignore
  }
  process.exit(1);
});

const assert = require("assert");
const path = require("path");
const supertest = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

async function getCaptcha(api) {
  const response = await api.get("/api/security/captcha");
  assert.equal(response.status, 200, "Captcha endpoint failed");
  const challenge = response.body.challenge || "";
  const match = challenge.match(/What is\s+(\d+)\s*\+\s*(\d+)\?/i);
  assert.ok(match, "Captcha challenge parse failed");
  const answer = String(Number(match[1]) + Number(match[2]));
  return { captchaId: response.body.captchaId, captchaAnswer: answer };
}

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

  await connectDatabase();
  await seedAdmin();

  const api = supertest(app);

  const adminCaptcha = await getCaptcha(api);
  const adminLogin = await api.post("/api/auth/login").send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    ...adminCaptcha,
  });
  assert.equal(adminLogin.status, 200, "Admin login failed");
  const adminToken = adminLogin.body.token;

  const createOrganizer = await api
    .post("/api/admin/organizers")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      organizerName: "Tech Club",
      category: "Technical",
      description: "Runs coding events",
      contactEmail: "tech@club.test",
      contactNumber: "1112223333",
    });
  assert.equal(createOrganizer.status, 201, "Organizer creation failed");

  const organizerCreds = createOrganizer.body.credentials;
  const organizerCaptcha = await getCaptcha(api);
  const organizerLogin = await api.post("/api/auth/login").send({ ...organizerCreds, ...organizerCaptcha });
  assert.equal(organizerLogin.status, 200, "Organizer login failed");
  const organizerToken = organizerLogin.body.token;

  const participantCaptcha = await getCaptcha(api);
  const participantRegister = await api.post("/api/auth/register").send({
    firstName: "Alex",
    lastName: "Ray",
    email: "alex@example.com",
    password: "Password1!",
    participantType: "non-iiit",
    collegeOrOrg: "Outside College",
    contactNumber: "9999999999",
    ...participantCaptcha,
  });
  assert.equal(participantRegister.status, 201, "Participant register failed");
  const participantToken = participantRegister.body.token;

  const participant2Captcha = await getCaptcha(api);
  const participant2Register = await api.post("/api/auth/register").send({
    firstName: "Jamie",
    lastName: "Stone",
    email: "jamie@example.com",
    password: "Password1!",
    participantType: "non-iiit",
    collegeOrOrg: "Outside College",
    contactNumber: "8888888888",
    ...participant2Captcha,
  });
  assert.equal(participant2Register.status, 201, "Second participant register failed");
  const participant2Token = participant2Register.body.token;

  const onboarding = await api
    .put("/api/participants/onboarding")
    .set("Authorization", `Bearer ${participantToken}`)
    .send({
      interests: ["coding", "ai"],
      followedOrganizers: [createOrganizer.body.organizer._id],
    });
  assert.equal(onboarding.status, 200, "Onboarding save failed");

  const normalEvent = await api
    .post("/api/organizer/events")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      name: "Code Sprint",
      description: "Fast coding challenge",
      eventType: "normal",
      eligibility: "all",
      registrationDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 73 * 60 * 60 * 1000).toISOString(),
      registrationLimit: 100,
      registrationFee: 100,
      tags: ["coding", "contest"],
      customFormFields: [
        { id: "github", label: "GitHub", type: "text", required: true, order: 1 },
        { id: "track", label: "Track", type: "dropdown", required: true, options: ["web", "systems"], order: 2 },
        { id: "resume", label: "Resume", type: "file", required: true, order: 3 },
      ],
    });
  assert.equal(normalEvent.status, 201, "Normal event create failed");

  const normalEventId = normalEvent.body.event._id;
  const publishNormal = await api
    .post(`/api/organizer/events/${normalEventId}/publish`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({});
  assert.equal(publishNormal.status, 200, "Normal event publish failed");

  const fuzzySearch = await api.get("/api/events?search=sprnt").set("Authorization", `Bearer ${participantToken}`);
  assert.equal(fuzzySearch.status, 200, "Event search failed");
  assert.ok((fuzzySearch.body.events || []).some((event) => event._id === normalEventId), "Fuzzy search did not return event");

  const invalidNormalReg = await api
    .post(`/api/events/${normalEventId}/register`)
    .set("Authorization", `Bearer ${participantToken}`)
    .field("formResponses", JSON.stringify({ github: "alexdev", track: "ml" }))
    .attach("resume", Buffer.from("resume"), "resume.txt");
  assert.equal(invalidNormalReg.status, 400, "Invalid dropdown option should fail");

  const normalReg = await api
    .post(`/api/events/${normalEventId}/register`)
    .set("Authorization", `Bearer ${participantToken}`)
    .field("formResponses", JSON.stringify({ github: "alexdev", track: "web" }))
    .attach("resume", Buffer.from("resume"), "resume.txt");
  assert.equal(normalReg.status, 201, "Normal registration failed");
  const normalTicket = normalReg.body.registration.ticketId;
  assert.ok(normalTicket, "Normal ticket not generated");
  assert.ok(normalReg.body.registration.formResponses.resume, "Custom file response missing");

  const forumPost = await api
    .post(`/api/forum/${normalEventId}/messages`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ content: "When does this start?" });
  assert.equal(forumPost.status, 201, "Forum post failed");

  const forumReact = await api
    .post(`/api/forum/${normalEventId}/messages/${forumPost.body.message._id}/react`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ emoji: "like" });
  assert.equal(forumReact.status, 200, "Forum reaction failed");

  const teamEvent = await api
    .post("/api/organizer/events")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      name: "Hack Build",
      description: "Team-based build event",
      eventType: "normal",
      eligibility: "all",
      registrationDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
      registrationLimit: 200,
      registrationFee: 0,
      tags: ["hackathon"],
      teamConfig: { enabled: true, maxMembers: 2, inviteMode: "code" },
    });
  assert.equal(teamEvent.status, 201, "Team event create failed");
  const teamEventId = teamEvent.body.event._id;

  const publishTeamEvent = await api
    .post(`/api/organizer/events/${teamEventId}/publish`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({});
  assert.equal(publishTeamEvent.status, 200, "Team event publish failed");

  const createTeam = await api
    .post(`/api/events/${teamEventId}/team/create`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ teamName: "Alpha Team", maxMembers: 2 });
  assert.equal(createTeam.status, 201, "Team creation failed");
  const teamId = createTeam.body.team._id;

  const oversizeTeam = await api
    .post(`/api/events/${teamEventId}/team/create`)
    .set("Authorization", `Bearer ${participant2Token}`)
    .send({ teamName: "Too Big", maxMembers: 5 });
  assert.equal(oversizeTeam.status, 400, "Oversize team should fail");

  const invite = await api
    .post(`/api/teams/${teamId}/invites`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ email: "jamie@example.com" });
  assert.equal(invite.status, 201, "Team invite creation failed");
  const inviteToken = invite.body.token;

  const pendingInvites = await api.get("/api/teams/my").set("Authorization", `Bearer ${participant2Token}`);
  assert.equal(pendingInvites.status, 200, "Team invite listing failed");
  assert.ok((pendingInvites.body.pendingInvites || []).some((entry) => entry.token === inviteToken), "Pending invite missing");

  const acceptInvite = await api
    .post(`/api/teams/${teamId}/invites/respond`)
    .set("Authorization", `Bearer ${participant2Token}`)
    .send({ token: inviteToken, decision: "accepted" });
  assert.equal(acceptInvite.status, 200, "Invite accept failed");
  assert.equal(acceptInvite.body.team.status, "completed", "Team should complete after second acceptance");

  const teamMessage = await api
    .post(`/api/teams/${teamId}/messages`)
    .set("Authorization", `Bearer ${participantToken}`)
    .field("text", "")
    .field("attachmentUrl", "https://example.com/spec")
    .attach("attachment", Buffer.from("hello"), "notes.txt");
  assert.equal(teamMessage.status, 201, "Team message upload failed");
  assert.ok(teamMessage.body.message.attachmentUrl, "Team message attachment URL missing");

  const feedbackEvent = await api
    .post("/api/organizer/events")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      name: "Feedback Event",
      description: "Event for feedback validation",
      eventType: "normal",
      eligibility: "all",
      registrationDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      startDate: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      registrationLimit: 100,
      registrationFee: 0,
      tags: ["feedback"],
    });
  assert.equal(feedbackEvent.status, 201, "Feedback event create failed");
  const feedbackEventId = feedbackEvent.body.event._id;

  const publishFeedbackEvent = await api
    .post(`/api/organizer/events/${feedbackEventId}/publish`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({});
  assert.equal(publishFeedbackEvent.status, 200, "Feedback event publish failed");

  const feedbackReg = await api
    .post(`/api/events/${feedbackEventId}/register`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ formResponses: {} });
  assert.equal(feedbackReg.status, 201, "Feedback event registration failed");

  await api
    .post("/api/organizer/attendance/scan")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ ticketId: feedbackReg.body.registration.ticketId });

  const feedbackSubmit = await api
    .post(`/api/feedback/${feedbackEventId}`)
    .set("Authorization", `Bearer ${participantToken}`)
    .send({ rating: 5, comment: "Great event" });
  assert.equal(feedbackSubmit.status, 201, "Feedback submission failed");

  const feedbackAnalytics = await api
    .get(`/api/feedback/event/${feedbackEventId}`)
    .set("Authorization", `Bearer ${organizerToken}`);
  assert.equal(feedbackAnalytics.status, 200, "Feedback analytics failed");
  assert.ok(feedbackAnalytics.body.summary.total >= 1, "Feedback summary missing entries");

  const merchEvent = await api
    .post("/api/organizer/events")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      name: "Merch Drop",
      description: "Official hoodies",
      eventType: "merchandise",
      eligibility: "all",
      registrationDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 80 * 60 * 60 * 1000).toISOString(),
      registrationLimit: 300,
      registrationFee: 0,
      tags: ["merch"],
      paymentApprovalRequired: true,
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

  const purchase = await api
    .post(`/api/events/${merchEventId}/purchase`)
    .set("Authorization", `Bearer ${participantToken}`)
    .field("selections", JSON.stringify([{ itemId: merchItemId, quantity: 1 }]))
    .attach("paymentProof", Buffer.from("pngdata"), "proof.png");
  assert.equal(purchase.status, 201, "Merch purchase request failed");
  assert.equal(purchase.body.registration.status, "pending_approval", "Merch should be pending approval");

  const organizerMerchViewBefore = await api
    .get(`/api/organizer/events/${merchEventId}`)
    .set("Authorization", `Bearer ${organizerToken}`);
  assert.equal(organizerMerchViewBefore.status, 200, "Organizer merch view failed");
  const beforeOrder = (organizerMerchViewBefore.body.participants || []).find((p) => p.id === purchase.body.registration._id);
  assert.ok(beforeOrder, "Pending merch order missing in organizer view");
  assert.equal(beforeOrder.status, "pending_approval", "Pending merch status missing");
  assert.ok(beforeOrder.paymentProofUrl, "Payment proof URL missing in organizer view");

  const approve = await api
    .post(`/api/organizer/orders/${purchase.body.registration._id}/decision`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ decision: "approved" });
  assert.equal(approve.status, 200, "Order approval failed");
  assert.ok(approve.body.registration.ticketId, "Approved order did not generate ticket");

  const organizerMerchViewAfter = await api
    .get(`/api/organizer/events/${merchEventId}`)
    .set("Authorization", `Bearer ${organizerToken}`);
  const afterOrder = (organizerMerchViewAfter.body.participants || []).find((p) => p.id === purchase.body.registration._id);
  assert.equal(afterOrder.status, "approved", "Approved merch status missing in organizer view");

  const ticketFetch = await api
    .get(`/api/tickets/${approve.body.registration.ticketId}`)
    .set("Authorization", `Bearer ${participantToken}`);
  assert.equal(ticketFetch.status, 200, "Ticket fetch failed");

  const calendarData = await api
    .get(`/api/calendar/event/${normalEventId}`)
    .set("Authorization", `Bearer ${participantToken}`);
  assert.equal(calendarData.status, 200, "Calendar export route failed");
  assert.ok(calendarData.body.googleCalendarLink, "Calendar links missing");

  const calendarBatch = await api
    .get("/api/calendar/batch")
    .set("Authorization", `Bearer ${participantToken}`);
  assert.equal(calendarBatch.status, 200, "Calendar batch export failed");
  assert.ok((calendarBatch.body.events || []).length >= 1, "Calendar batch should include registered events");

  const dashboard = await api
    .get("/api/participants/dashboard")
    .set("Authorization", `Bearer ${participantToken}`);
  assert.equal(dashboard.status, 200, "Participant dashboard failed");
  assert.ok((dashboard.body.upcomingEvents || []).length >= 1, "Upcoming events should have at least one record");

  const securityPanel = await api
    .get("/api/admin/security-events")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(securityPanel.status, 200, "Security events panel failed");

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

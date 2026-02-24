const path = require("path");
const supertest = require("supertest");
const mongoose = require("mongoose");

async function ensureParticipant(api, email, password, profile) {
  const User = require(path.join(__dirname, "../src/models/User"));
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (!existing) {
    const register = await api.post("/api/auth/register").send({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email,
      password,
      participantType: "non-iiit",
      collegeOrOrg: profile.collegeOrOrg || "External College",
      contactNumber: profile.contactNumber || "9000000000",
    });
    if (register.status !== 201) {
      throw new Error(`Failed to register ${email}: ${register.status} ${JSON.stringify(register.body)}`);
    }
  } else {
    existing.role = "participant";
    existing.firstName = profile.firstName;
    existing.lastName = profile.lastName;
    existing.participantType = "non-iiit";
    existing.collegeOrOrg = profile.collegeOrOrg || existing.collegeOrOrg || "External College";
    existing.contactNumber = profile.contactNumber || existing.contactNumber || "9000000000";
    existing.password = password;
    existing.isActive = true;
    await existing.save();
  }

  const login = await api.post("/api/auth/login").send({ email, password });
  if (login.status !== 200) {
    throw new Error(`Failed to login ${email}: ${login.status} ${JSON.stringify(login.body)}`);
  }
  return login.body.token;
}

async function run() {
  const app = require(path.join(__dirname, "../src/app"));
  const connectDatabase = require(path.join(__dirname, "../src/config/db"));
  const seedAdmin = require(path.join(__dirname, "../src/config/seedAdmin"));
  const env = require(path.join(__dirname, "../src/config/env"));
  const User = require(path.join(__dirname, "../src/models/User"));

  await connectDatabase();
  await seedAdmin();

  const api = supertest(app);
  const timestamp = Date.now();
  const adminEmail = env.adminEmail;
  const adminPassword = env.adminPassword;

  const adminLogin = await api.post("/api/auth/login").send({
    email: adminEmail,
    password: adminPassword,
  });
  if (adminLogin.status !== 200) {
    throw new Error(`Admin login failed: ${adminLogin.status} ${JSON.stringify(adminLogin.body)}`);
  }
  const adminToken = adminLogin.body.token;

  const organizerEmail = `part2.organizer.${String(timestamp).slice(-6)}@felicity.local`;
  const organizerPassword = "Organizer#2026";
  const createOrganizer = await api
    .post("/api/admin/organizers")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      organizerName: `Part2 Organizer ${String(timestamp).slice(-4)}`,
      category: "Fest Team",
      description: "Populated organizer with Part-2 workflows",
      contactEmail: organizerEmail,
      contactNumber: "9898989898",
      email: organizerEmail,
      password: organizerPassword,
    });
  if (createOrganizer.status !== 201) {
    throw new Error(`Organizer creation failed: ${createOrganizer.status} ${JSON.stringify(createOrganizer.body)}`);
  }

  const organizerLogin = await api.post("/api/auth/login").send({
    email: organizerEmail,
    password: organizerPassword,
  });
  if (organizerLogin.status !== 200) {
    throw new Error(`Organizer login failed: ${organizerLogin.status} ${JSON.stringify(organizerLogin.body)}`);
  }
  const organizerToken = organizerLogin.body.token;

  const participantProfiles = [
    { email: "flapdoodlequackmire@gmail.com", firstName: "Flap", lastName: "Doodle", collegeOrOrg: "Public University" },
    { email: "shreyash.chandak@research.iiit.ac.in", firstName: "Shreyash", lastName: "Chandak", collegeOrOrg: "IIIT Research" },
    { email: "arijeet.paul@research.iiit.ac.in", firstName: "Arijeet", lastName: "Paul", collegeOrOrg: "IIIT Research" },
    { email: "shreyash.chandak2023@vitstudent.ac.in", firstName: "Shreyash", lastName: "VIT", collegeOrOrg: "VIT" },
    { email: `placeholder.one.${String(timestamp).slice(-5)}@example.com`, firstName: "Placeholder", lastName: "One" },
    { email: `placeholder.two.${String(timestamp).slice(-5)}@example.com`, firstName: "Placeholder", lastName: "Two" },
  ];

  const participantPassword = "Participant#2026";
  const participantTokens = [];
  for (const profile of participantProfiles) {
    const token = await ensureParticipant(api, profile.email, participantPassword, profile);
    participantTokens.push({ email: profile.email, token });
  }

  const now = Date.now();
  const createMerchEvent = await api
    .post("/api/organizer/events")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      name: `Part2 Merch Event ${String(timestamp).slice(-5)}`,
      description: "Merch workflow with pending payment approval and QR issuance",
      eventType: "merchandise",
      eligibility: "all",
      registrationDeadline: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString(),
      registrationLimit: 500,
      registrationFee: 0,
      tags: ["merch", "part2"],
      purchaseLimitPerParticipant: 2,
      merchandiseItems: [
        { name: "Felicity Hoodie", variant: "Classic", size: "M", color: "Black", stock: 50, price: 999 },
        { name: "Felicity Tee", variant: "Logo", size: "L", color: "White", stock: 50, price: 499 },
      ],
    });
  if (createMerchEvent.status !== 201) {
    throw new Error(`Merch event create failed: ${createMerchEvent.status} ${JSON.stringify(createMerchEvent.body)}`);
  }
  const merchEventId = createMerchEvent.body.event._id;

  const publishMerch = await api
    .post(`/api/organizer/events/${merchEventId}/publish`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({});
  if (publishMerch.status !== 200) {
    throw new Error(`Merch event publish failed: ${publishMerch.status} ${JSON.stringify(publishMerch.body)}`);
  }

  const merchDetails = await api.get(`/api/events/${merchEventId}`).set("Authorization", `Bearer ${participantTokens[0].token}`);
  if (merchDetails.status !== 200) {
    throw new Error(`Merch details failed: ${merchDetails.status} ${JSON.stringify(merchDetails.body)}`);
  }
  const itemId = merchDetails.body.event.merchandiseItems[0]._id;

  const createdOrders = [];
  for (const participant of participantTokens) {
    const purchase = await api
      .post(`/api/events/${merchEventId}/purchase`)
      .set("Authorization", `Bearer ${participant.token}`)
      .field("selections", JSON.stringify([{ itemId, quantity: 1 }]))
      .attach("paymentProof", Buffer.from(`proof-for-${participant.email}`), "payment-proof.png");

    if (purchase.status !== 201) {
      throw new Error(`Purchase failed for ${participant.email}: ${purchase.status} ${JSON.stringify(purchase.body)}`);
    }
    createdOrders.push({
      email: participant.email,
      registrationId: purchase.body.registration._id,
    });
  }

  const approvalResults = [];
  for (const order of createdOrders) {
    const approval = await api
      .patch(`/api/organizer/registrations/${order.registrationId}/payment`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ action: "approve", comment: "Verified by populate script" });

    if (approval.status !== 200) {
      throw new Error(`Approval failed for ${order.email}: ${approval.status} ${JSON.stringify(approval.body)}`);
    }
    approvalResults.push({
      email: order.email,
      ticketId: approval.body.registration.ticketId,
      paymentStatus: approval.body.registration.paymentStatus,
    });
  }

  const createNormalEvent = await api
    .post("/api/organizer/events")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      name: `Part2 Forum Event ${String(timestamp).slice(-5)}`,
      description: "Forum, attendance scanning and anonymous feedback data seed",
      eventType: "normal",
      eligibility: "all",
      registrationDeadline: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString(),
      registrationLimit: 150,
      registrationFee: 0,
      tags: ["forum", "feedback", "attendance"],
      customFormFields: [{ id: "intro", label: "Introduce yourself", type: "textarea", required: true, order: 1 }],
    });
  if (createNormalEvent.status !== 201) {
    throw new Error(`Normal event create failed: ${createNormalEvent.status} ${JSON.stringify(createNormalEvent.body)}`);
  }
  const normalEventId = createNormalEvent.body.event._id;

  const publishNormal = await api
    .post(`/api/organizer/events/${normalEventId}/publish`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({});
  if (publishNormal.status !== 200) {
    throw new Error(`Normal event publish failed: ${publishNormal.status} ${JSON.stringify(publishNormal.body)}`);
  }

  const sampleParticipant = participantTokens[0];
  const normalReg = await api
    .post(`/api/events/${normalEventId}/register`)
    .set("Authorization", `Bearer ${sampleParticipant.token}`)
    .send({ formResponses: { intro: "Hello from populate script" } });
  if (normalReg.status !== 201) {
    throw new Error(`Normal registration failed: ${normalReg.status} ${JSON.stringify(normalReg.body)}`);
  }

  await api
    .post(`/api/events/${normalEventId}/forum/messages`)
    .set("Authorization", `Bearer ${sampleParticipant.token}`)
    .send({ text: "When should we report for check-in?" });

  await api
    .post(`/api/events/${normalEventId}/forum/messages`)
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ text: "Please report 30 minutes early.", isAnnouncement: true });

  const resetRequest = await api
    .post("/api/organizer/password-reset-requests")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({ reason: "Populate script demo request" });

  const participantsCount = await User.countDocuments({ role: "participant" });

  console.log(
    JSON.stringify(
      {
        suite: "populate_part2",
        status: "PASS",
        organizerEmail,
        merchEventId,
        normalEventId,
        merchApprovals: approvalResults,
        passwordResetRequestCreated: resetRequest.status === 201,
        participantsCount,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("populate-part2 failed", error);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});

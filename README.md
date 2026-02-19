# Felicity Event Management System

This repository contains a full-stack MERN implementation with basic UI and full workflow coverage for participant, organizer, and admin roles.

## Structure

- `backend/`
- `frontend/`
- `deployment.txt`

## Implemented Feature Coverage

### Core (Part 1)

- Role-based auth system with JWT + bcrypt hashing.
- Participant signup/login with IIIT domain validation for IIIT users.
- Admin-seeded account and admin-controlled organizer provisioning.
- Role-protected frontend routes and session persistence using local storage token.
- Participant onboarding preferences (interests + followed clubs) with editable profile.
- Event model with required fields, normal and merchandise types.
- Normal event registration with dynamic form responses and ticket generation + QR.
- Merchandise purchase with stock validation, ticket generation, and email stubs.
- Participant dashboard with upcoming events and categorized participation history.
- Browse events with search + filters + trending endpoint.
- Event details with registration blocking checks.
- Clubs/organizers listing + detail page + follow/unfollow.
- Organizer dashboard, event lifecycle management (draft/publish/ongoing/completed/closed), analytics, participant list, filtering, CSV export.
- Organizer profile with Discord webhook support.
- Admin organizer management (create, disable/archive, permanent delete).
- Deployment-ready environment structure and docs.

### Advanced (Part 2)

Implemented advanced workflows include:

- Tier A:
  - Hackathon team registration (team create/join, invite codes, completion flow).
  - Merchandise payment approval workflow (pending/approved/rejected with ticket generation on approval).
  - QR attendance scanning workflow with duplicate blocking and audit logs.
- Tier B:
  - Real-time event discussion forum (messages, organizer moderation, reactions).
  - Organizer password reset request and admin approval/rejection workflow.
  - Team chat (real-time messaging with typing indicators and presence events).
- Tier C:
  - Add-to-calendar integration (`.ics`, Google Calendar link, Outlook link, batch export).

## Local Setup

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### 2) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Notes

- Email sending uses SMTP if configured; otherwise logs email payloads to console.
- Admin account is auto-seeded on backend startup from environment variables.
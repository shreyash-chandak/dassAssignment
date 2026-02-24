# Felicity Event Management System

This is a MERN-based event management system with three roles:
- Participant
- Organizer
- Admin

It includes all required Part-1 features and the selected Part-2 features listed below.

## Tech Stack

- MongoDB (Atlas/local)
- Express.js
- React (Vite)
- Node.js
- Socket.IO (real-time forum updates)

## Repository Structure

- `backend/` - REST API, auth, business logic, DB models
- `frontend/` - React UI
- `deployment.txt` - deployed frontend and backend URLs

## What Has Been Implemented

### Part-1 (Core System)

- Authentication and authorization:
  - Participant registration/login (with IIIT domain checks for IIIT participant type)
  - Organizer login (no self-registration)
  - Admin seeded by backend env
  - JWT + bcrypt + role-based protected routes
  - Session persistence on frontend
- Participant features:
  - Onboarding preferences (interests and followed organizers)
  - Browse events (search, fuzzy matching, filters, trending)
  - Event details and registration/purchase blocking rules
  - Normal event registration with custom form support
  - Ticket generation with QR
  - Dashboard (upcoming + history categories)
  - Profile and password change
  - Clubs listing, organizer details, follow/unfollow
- Organizer features:
  - Dashboard and event analytics
  - Create/edit/publish lifecycle with status rules
  - Dynamic form builder with lock after first registration
  - Participant list, filters, CSV export
  - Organizer profile with Discord webhook field
- Admin features:
  - Dashboard
  - Organizer account management (create, disable, archive, delete)

### Part-2 (Selected Options)

Selected as requested:

- Tier A:
  - A2 Merchandise Payment Approval Workflow
  - A3 QR Scanner and Attendance Tracking
- Tier B:
  - B1 Real-Time Discussion Forum
  - B2 Organizer Password Reset Workflow
- Tier C:
  - C1 Anonymous Feedback System

Implemented details:

- Merchandise approval workflow:
  - Participant uploads payment proof
  - Order starts as `pending`
  - Organizer approves/rejects
  - On approval: stock decrement, ticket+QR generation, email
- Attendance tracking:
  - Scan by ticket ID
  - Scan by QR image upload
  - Camera scanner in organizer event page
  - Duplicate scan rejection
  - Manual override with audit logs
  - Attendance CSV export
- Real-time discussion forum:
  - Event-level discussion for registered participants and organizer
  - Organizer moderation (pin/delete), announcements
  - Reactions and live updates through Socket.IO
- Organizer password reset workflow:
  - Organizer submits reset request
  - Admin approves/rejects with comment
  - On approval, system generates a new password
  - Request status/history visible in UI
- Anonymous feedback:
  - Participants submit rating/comment after event completion
  - Organizer sees aggregate analytics and rating filters

### Additional Requested Changes

- Admin now sets organizer login email and password at creation time
- Organizer dashboard includes password reset request form
- Admin dashboard shows pending reset requests

## Environment Variables

### Backend (`backend/.env`)

Use `backend/.env.example` as base:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/felicity
JWT_SECRET=replace-with-strong-secret
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@felicity.local
ADMIN_PASSWORD=ChangeMe123!
ALLOWED_IIIT_DOMAINS=iiit.ac.in,students.iiit.ac.in
FRONTEND_URL=http://localhost:5173
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

### Frontend (`frontend/.env`)

Use `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:5000/api
```

## Run Locally

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Test Commands

### Backend smoke tests

```bash
cd backend
npm run smoke
```

### Frontend production build check

```bash
cd frontend
npm run build
```

### Populate DB with Part-2 sample data

```bash
cd backend
npm run populate:part2
```

## Deployment

Deployed URLs are listed in:
- `deployment.txt`

Backend health endpoint:
- `GET /health`

## Notes

- Discord webhook alerts are sent when an organizer publishes a draft event.
- Merchandise tickets are generated only after payment approval.
- If SMTP is configured, emails are sent through SMTP; otherwise email calls are logged.

# Dermestha — System Design (v2)

Produced by: `anthropics/knowledge-work-plugins@system-design`  
Inputs: `docs/mvp-scope.md`, `docs/competitive-baseline.md`, `docs/architectureSkillGuideLine.md`  
Stack confirmed by user: React + Vite / Node.js + Express / PostgreSQL + Prisma / Vercel + Railway / Daily.co / Resend

---

## 1. Requirements

### Functional

| Role | Core capabilities |
|---|---|
| **Patient** | Register, browse doctor profiles, book a slot, join video call, view & download prescription PDF |
| **Doctor** | Set weekly availability, view appointment queue, join video call, build prescription (select medicines + dosage + duration + instructions + notes), generate PDF |
| **Admin** | Approve doctor accounts, manage medicine catalogue |

**Automated triggers:**
1. Booking confirmed → email to patient
2. 24 hr before appointment → reminder email
3. 1 hr before appointment → reminder email
4. Prescription submitted → "prescription ready" email to patient

### Non-functional

| Dimension | Target |
|---|---|
| Availability | Best-effort MVP (no SLA) |
| Video latency | Must function on 3G (Pakistan common case); handled by Daily.co adaptive bitrate |
| Concurrency | ~10 doctors, ~100 bookings/week at launch |
| Mobile | Mobile-responsive web; no native app in v1 |
| Security | HTTPS enforced by host, JWT auth, bcrypt passwords, Zod input validation at route entry |
| Email deliverability | SPF + DKIM + DMARC configured before launch |

### Constraints

- Timeline: 8.5 weeks solo / 4.5–5.5 weeks with 2 developers
- No online payments in v1 (Safepay added in v1.1, merchant KYC takes 1–2 weeks)
- Video: third-party SDK only (Daily.co chosen — no proprietary WebRTC)
- No DRAP/PMDC regulatory compliance layer

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Dermestha MVP                                   │
│                                                                          │
│  ┌──────────────────┐  HTTPS/JSON   ┌──────────────────────────────────┐ │
│  │  React SPA       │◄─────────────►│  Express REST API (Railway)      │ │
│  │  (Vercel)        │               │                                  │ │
│  │                  │               │  routes/                         │ │
│  │  LandingPage     │               │  ├── auth.js                     │ │
│  │  Auth pages      │               │  ├── doctors.js                  │ │
│  │  DoctorList      │               │  ├── appointments.js             │ │
│  │  BookSlot        │               │  ├── prescriptions.js            │ │
│  │  VideoRoom       │               │  ├── medicines.js                │ │
│  │  PatientDash     │               │  └── admin.js                    │ │
│  │  DoctorDash      │               │                                  │ │
│  │  AdminPanel      │               │  services/                       │ │
│  └──────────────────┘               │  ├── video.js    (Daily.co API)  │ │
│                                     │  ├── email.js    (Resend API)    │ │
│  ┌──────────────────┐  WebRTC       │  ├── pdf.js      (PDFKit)        │ │
│  │  Daily.co CDN    │◄──────────────│  └── scheduler.js (node-cron)    │ │
│  │  (video rooms)   │               │                                  │ │
│  └──────────────────┘               │  middleware/                     │ │
│                                     │  └── auth.js  (JWT verify)       │ │
│  ┌──────────────────┐  Resend API   │                                  │ │
│  │  Resend          │◄──────────────│  lib/                            │ │
│  │  (transactional) │               │  ├── prisma.js  (singleton)      │ │
│  └──────────────────┘               │  └── jwt.js     (sign/verify)    │ │
│                                     │                                  │ │
│                                     └──────────────┬───────────────────┘ │
│                                                   │                     │
│                                     ┌─────────────▼─────────────────┐   │
│                                     │  PostgreSQL (Railway managed)  │   │
│                                     │  ORM: Prisma                   │   │
│                                     └───────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  Railway Persistent Volume  /uploads  (Prescription PDFs)        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Responsibility | Technology |
|---|---|---|
| React SPA | All UI — patient, doctor, admin, landing | React 18 + Vite, react-router-dom |
| Express API | Business logic, auth, route handling | Node.js + Express |
| PostgreSQL | Persistent relational data | Railway managed Postgres |
| Prisma | ORM, migrations, type-safe queries | Prisma |
| Daily.co | Video room lifecycle + WebRTC | Daily.co REST API + `@daily-co/daily-react` |
| Resend | Transactional email delivery | Resend SDK |
| PDFKit | In-process prescription PDF generation | `pdfkit` npm package |
| node-cron | Appointment reminder scheduling | `node-cron` in Express process |
| Railway Volume | PDF file storage at `/uploads` | Railway persistent volume |

---

## 3. Tech Stack Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | React + Vite | Fast DX, large ecosystem, no SSR complexity needed for a SPA with JWT auth |
| Frontend hosting | Vercel | Zero-config CDN, automatic HTTPS, global edge — free tier covers MVP |
| Backend | Node.js + Express | Same language as frontend reduces context-switching for a solo/small team; large ecosystem |
| Backend hosting | Railway | Managed Postgres + persistent volume + environment variables in one platform; Singapore region (~40ms from Pakistan) |
| Database | PostgreSQL | Relational integrity for appointments ↔ prescriptions ↔ medicines; strong Prisma support |
| ORM | Prisma | Type-safe queries, schema migrations, readable schema-as-code |
| Auth | JWT + bcrypt | Stateless — no session store; 7-day expiry; bcrypt for password hashing |
| Video | Daily.co | Prebuilt `<DailyProvider>` React component; adaptive bitrate for 3G; private rooms via server tokens; free tier |
| Email | Resend | Clean REST API, template-free (HTML strings), high deliverability, generous free tier |
| PDF generation | PDFKit | In-process, no headless Chrome, ~5KB library, fast; prescription templates are structured enough for a programmatic API |
| Scheduling | node-cron | Zero infrastructure; 5-minute poll is sufficient at 100 bookings/week |
| File storage | Railway volume | Zero-config for MVP; migrate to S3 when volume size becomes a constraint |
| Input validation | Zod | Schema validation at route entry points only; type-safe, composable |

**Key packages:**
```
server: express, @prisma/client, bcryptjs, jsonwebtoken, zod,
        pdfkit, node-cron, resend, cors, dotenv
client: react, react-router-dom, @daily-co/daily-react, axios
```

---

## 4. Data Model

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  PATIENT
  DOCTOR
  ADMIN
}

enum AppointmentStatus {
  PENDING
  CONFIRMED
  COMPLETED
  CANCELLED
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role
  createdAt    DateTime @default(now())
  patient      Patient?
  doctor       Doctor?
}

model Patient {
  id            String        @id @default(cuid())
  userId        String        @unique
  user          User          @relation(fields: [userId], references: [id])
  name          String
  phone         String?
  age           Int?
  gender        String?
  city          String?
  appointments  Appointment[]
  prescriptions Prescription[]
}

model Doctor {
  id             String               @id @default(cuid())
  userId         String               @unique
  user           User                 @relation(fields: [userId], references: [id])
  name           String
  photoUrl       String?
  bio            String?
  specialization String?
  fee            Decimal
  languages      String[]
  isApproved     Boolean              @default(false)
  availability   DoctorAvailability[]
  appointments   Appointment[]
  prescriptions  Prescription[]
}

model DoctorAvailability {
  id        String @id @default(cuid())
  doctorId  String
  doctor    Doctor @relation(fields: [doctorId], references: [id])
  dayOfWeek Int    // 0 = Sunday … 6 = Saturday
  startTime String // "09:00"
  endTime   String // "17:00"

  @@unique([doctorId, dayOfWeek])
}

model Appointment {
  id            String            @id @default(cuid())
  patientId     String
  patient       Patient           @relation(fields: [patientId], references: [id])
  doctorId      String
  doctor        Doctor            @relation(fields: [doctorId], references: [id])
  scheduledAt   DateTime
  status        AppointmentStatus @default(CONFIRMED)
  videoRoomUrl  String?
  videoRoomName String?
  notified24h   Boolean           @default(false)
  notified1h    Boolean           @default(false)
  prescription  Prescription?
  createdAt     DateTime          @default(now())
}

model Prescription {
  id            String                 @id @default(cuid())
  appointmentId String                 @unique
  appointment   Appointment            @relation(fields: [appointmentId], references: [id])
  patientId     String
  patient       Patient                @relation(fields: [patientId], references: [id])
  doctorId      String
  doctor        Doctor                 @relation(fields: [doctorId], references: [id])
  notes         String?
  pdfPath       String?
  medicines     PrescriptionMedicine[]
  createdAt     DateTime               @default(now())
}

model PrescriptionMedicine {
  id             String       @id @default(cuid())
  prescriptionId String
  prescription   Prescription @relation(fields: [prescriptionId], references: [id])
  medicineId     String?
  medicine       Medicine?    @relation(fields: [medicineId], references: [id])
  customName     String?      // populated when medicineId is null (free-text entry)
  dosage         String
  duration       String
  instructions   String?
}

model Medicine {
  id                    String                 @id @default(cuid())
  name                  String                 @unique
  category              String?
  isActive              Boolean                @default(true)
  prescriptionMedicines PrescriptionMedicine[]
}
```

---

## 5. API Surface

### Auth
```
POST /api/auth/register     body: { email, password, name, role }        → 201 { user, token }
POST /api/auth/login        body: { email, password }                    → 200 { user, token }
GET  /api/auth/me           auth: JWT                                    → 200 { user }
```

### Doctors
```
GET  /api/doctors                         public             → 200 [doctor]
GET  /api/doctors/:id                     public             → 200 { doctor, availability[] }
GET  /api/doctors/:id/slots?date=         public             → 200 [{ datetime, available }]
PUT  /api/doctors/:id/availability        DOCTOR             → 200 { availability[] }
  body: [{ dayOfWeek, startTime, endTime }]
```

### Appointments
```
POST  /api/appointments                   PATIENT            → 201 { appointment }
  body: { doctorId, scheduledAt }
GET   /api/appointments                   PATIENT|DOCTOR     → 200 [appointment]
PATCH /api/appointments/:id/status        PATIENT            → 200 { appointment }
  body: { status: "CANCELLED" }
POST  /api/appointments/:id/join          PATIENT|DOCTOR     → 200 { token, url }
```

### Prescriptions
```
POST /api/prescriptions                   DOCTOR             → 201 { prescription, pdfUrl }
  body: { appointmentId, notes?, medicines: [{ medicineId?, customName?, dosage, duration, instructions? }] }
GET  /api/prescriptions/:id               PATIENT|DOCTOR     → 200 { prescription }
GET  /api/prescriptions/:id/pdf           PATIENT|DOCTOR     → file stream (application/pdf)
GET  /api/patients/me/prescriptions       PATIENT            → 200 [prescription]
```

### Medicines
```
GET /api/medicines?q=                     DOCTOR             → 200 [{ id, name, category }]
```

### Admin
```
GET   /api/admin/doctors/pending          ADMIN              → 200 [doctor]
PATCH /api/admin/doctors/:id/approve      ADMIN              → 200 { doctor }
GET   /api/admin/medicines                ADMIN              → 200 [medicine]
POST  /api/admin/medicines                ADMIN              → 201 { medicine }
  body: { name, category? }
PATCH /api/admin/medicines/:id            ADMIN              → 200 { medicine }
  body: { name?, category?, isActive? }
```

---

## 6. Directory Structure

```
dermestha/
├── client/                         # React + Vite SPA (deployed to Vercel)
│   ├── src/
│   │   ├── api/                    # Axios wrappers, one file per resource
│   │   │   ├── auth.js
│   │   │   ├── appointments.js
│   │   │   ├── doctors.js
│   │   │   └── prescriptions.js
│   │   ├── components/             # Shared UI components
│   │   │   ├── Navbar.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── AppointmentCard.jsx
│   │   │   ├── DoctorCard.jsx
│   │   │   └── VideoCall.jsx       # DailyProvider wrapper
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── auth/
│   │   │   │   ├── Login.jsx
│   │   │   │   └── Register.jsx
│   │   │   ├── patient/
│   │   │   │   ├── Dashboard.jsx
│   │   │   │   ├── DoctorList.jsx
│   │   │   │   ├── BookSlot.jsx
│   │   │   │   └── VideoRoom.jsx
│   │   │   ├── doctor/
│   │   │   │   ├── Dashboard.jsx
│   │   │   │   ├── Availability.jsx
│   │   │   │   ├── PrescriptionBuilder.jsx
│   │   │   │   └── VideoRoom.jsx
│   │   │   └── admin/
│   │   │       ├── DoctorApprovals.jsx
│   │   │       └── MedicineCatalog.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx     # React Context — { user, token, login, logout }
│   │   ├── App.jsx                 # Router + role-based route guards
│   │   └── main.jsx
│   ├── .env                        # VITE_API_URL, VITE_DAILY_DOMAIN
│   └── package.json
│
└── server/                         # Node.js + Express (deployed to Railway)
    ├── src/
    │   ├── routes/
    │   │   ├── auth.js
    │   │   ├── doctors.js
    │   │   ├── appointments.js
    │   │   ├── prescriptions.js
    │   │   ├── medicines.js
    │   │   └── admin.js
    │   ├── services/
    │   │   ├── video.js            # Daily.co room + token creation
    │   │   ├── email.js            # Resend — 4 email functions
    │   │   ├── pdf.js              # PDFKit — generate + write to /uploads
    │   │   └── scheduler.js        # node-cron — 24h + 1h reminder loops
    │   ├── middleware/
    │   │   └── auth.js             # verifyJWT(), requireRole(role)
    │   ├── lib/
    │   │   ├── prisma.js           # singleton PrismaClient export
    │   │   └── jwt.js              # signToken(), verifyToken()
    │   ├── utils/
    │   │   └── slots.js            # slot generation from availability
    │   └── app.js                  # Express setup, CORS, route mounts
    ├── server.js                   # HTTP server entry + scheduler bootstrap
    ├── prisma/
    │   └── schema.prisma
    ├── uploads/                    # Railway volume mount point
    ├── .env
    └── package.json
```

---

## 7. Key Abstractions

### Auth middleware (`middleware/auth.js`)

Two composable Express middlewares applied to protected routes:
```js
verifyJWT(req, res, next)       // extracts + verifies Bearer token → req.user
requireRole(...roles)(req, res, next)  // enforces role after verifyJWT
```

Usage: `router.post('/appointments', verifyJWT, requireRole('PATIENT'), handler)`

### Slot generation (`utils/slots.js`)

Takes a doctor's `DoctorAvailability` row for the requested day and a list of already-booked `scheduledAt` datetimes. Returns 30-minute slot intervals with `available: true/false`. All datetimes stored as UTC; client converts to PKT (UTC+5).

### Cron scheduler (`services/scheduler.js`)

Fires every 5 minutes. Two independent query-and-notify loops:
- **24h reminder:** `scheduledAt ∈ [now+23h55m, now+24h5m]` AND `notified24h=false` AND `status=CONFIRMED`
- **1h reminder:** `scheduledAt ∈ [now+55m, now+65m]` AND `notified1h=false` AND `status=CONFIRMED`

For each match: send email via `services/email.js` → update flag to `true`. The ±5-minute window ensures no appointment falls between two cron ticks; the boolean flag prevents duplicate sends.

### Video service (`services/video.js`)

Wraps Daily.co REST API:
- `createRoom(appointmentId)` — called during booking; stores `videoRoomUrl` + `videoRoomName` on the Appointment record
- `createToken(roomName, userId, isOwner)` — called when patient/doctor clicks "Join Call"; `isOwner: true` for doctor (gives host controls)

### PDF service (`services/pdf.js`)

- Fetches `Prescription` + `PrescriptionMedicine[]` + `Doctor` + `Patient` from DB using Prisma
- Renders via PDFKit: clinic header, doctor details, patient details, medicines table (name / dosage / duration / instructions), free-text notes, footer
- Writes buffer to `/uploads/rx-<id>.pdf`
- Returns the path; stored on `Prescription.pdfPath`
- Served by Express: `GET /api/prescriptions/:id/pdf` streams the file with `Content-Type: application/pdf`

---

## 8. Data Flows

### 8.1 — Patient Books an Appointment

```
Patient clicks "Confirm Booking" (BookSlot.jsx)
  │
  │  POST /api/appointments  { doctorId, scheduledAt }
  │  Authorization: Bearer <patient-jwt>
  ▼
verifyJWT → requireRole('PATIENT')

Route handler (routes/appointments.js)
  ├─ Zod: validate doctorId (string), scheduledAt (ISO datetime)
  ├─ Check slot free:
  │    prisma.appointment.findFirst({
  │      where: { doctorId, scheduledAt, status: { not: 'CANCELLED' } }
  │    })
  │    → conflict → 409 "Slot already booked"
  ├─ Create Appointment:
  │    prisma.appointment.create({ data: { patientId, doctorId, scheduledAt, status: 'CONFIRMED' } })
  ├─ Create Daily.co room:
  │    video.createRoom(appointment.id) → POST daily.co/v1/rooms
  │    → { url, name }
  ├─ Persist room details:
  │    prisma.appointment.update({ data: { videoRoomUrl: url, videoRoomName: name } })
  ├─ Send confirmation email:
  │    email.sendBookingConfirmation({ patient, doctor, appointment }) → Resend
  └─ Return 201 { appointment, videoRoomUrl }

Client → redirect patient to Dashboard.jsx
```

### 8.2 — Doctor Generates a Prescription

```
Doctor submits PrescriptionBuilder.jsx form
  │
  │  POST /api/prescriptions
  │  { appointmentId, notes, medicines: [{ medicineId?, customName?, dosage, duration, instructions? }] }
  ▼
verifyJWT → requireRole('DOCTOR')

Route handler (routes/prescriptions.js)
  ├─ Zod: validate body shape
  ├─ Confirm appointment belongs to this doctor:
  │    prisma.appointment.findFirst({ where: { id: appointmentId, doctorId: req.user.doctorId } })
  │    → not found → 403
  ├─ Create Prescription record
  ├─ Create PrescriptionMedicine records (createMany)
  ├─ Generate PDF:
  │    pdf.generatePrescriptionPdf(prescription.id)
  │      ├─ Fetch full Prescription + relations
  │      ├─ PDFKit renders header / doctor info / patient info / medicines table / notes / footer
  │      ├─ Write buffer → /uploads/rx-<id>.pdf
  │      └─ Return pdfPath
  ├─ Update Prescription.pdfPath
  ├─ Update Appointment.status → 'COMPLETED'
  ├─ Send prescription-ready email → Resend
  └─ Return 201 { prescription, pdfUrl: "/api/prescriptions/<id>/pdf" }

Patient receives email → clicks link → Dashboard → PDF download
```

### 8.3 — Reminder Cron

```
node-cron fires every 5 minutes
  │
  ├─ now = new Date()
  │
  ├─ 24h REMINDER
  │    findMany where scheduledAt ∈ [now+23h55m, now+24h5m]
  │                AND notified24h=false AND status=CONFIRMED
  │    For each:
  │      email.sendReminder24h(...)
  │      prisma.appointment.update({ notified24h: true })
  │
  └─ 1h REMINDER
       findMany where scheduledAt ∈ [now+55m, now+65m]
                   AND notified1h=false AND status=CONFIRMED
       For each:
         email.sendReminder1h(...)
         prisma.appointment.update({ notified1h: true })
```

### 8.4 — Patient Joins a Video Call

```
Patient clicks "Join Call" (Dashboard.jsx at appointment time)
  │
  │  POST /api/appointments/:id/join
  ▼
verifyJWT → req.user = { id, role: 'PATIENT' }

Route handler
  ├─ Fetch appointment, confirm patient owns it
  ├─ video.createToken(appointment.videoRoomName, patient.id, isOwner=false)
  │    → POST daily.co/v1/meeting-tokens { is_owner: false }
  │    → { token }
  └─ Return 200 { token, url: appointment.videoRoomUrl }

Client: VideoRoom.jsx
  └─ DailyProvider({ url, token }) → WebRTC via Daily.co CDN
     → Adaptive bitrate handles 3G connections
```

---

## 9. Environment Variables

### Server (`server/.env`)

```bash
# Database
DATABASE_URL="postgresql://user:password@host.railway.app:5432/railway"

# Auth
JWT_SECRET="<minimum-32-character-random-string>"
JWT_EXPIRES_IN="7d"

# Video
DAILY_API_KEY="<from daily.co dashboard>"
DAILY_DOMAIN="dermestha"

# Email
RESEND_API_KEY="re_<from resend.com>"
EMAIL_FROM="Dermestha <noreply@dermestha.com>"

# App
PORT=3001
NODE_ENV="production"
CLIENT_URL="https://dermestha.com"

# Files
UPLOADS_DIR="/uploads"
```

### Client (`client/.env`)

```bash
VITE_API_URL="https://api.dermestha.com"
VITE_DAILY_DOMAIN="dermestha"
```

**Security notes:**
- `JWT_SECRET` ≥ 32 random characters. Never reuse across environments.
- `DAILY_API_KEY` = full control of Daily.co account — treat as root credential.
- `RESEND_API_KEY` = can send email from your domain — treat as high-sensitivity.
- Neither `.env` nor `.env.local` ever committed. Both in `.gitignore`.

---

## 10. Per-Module Effort Estimates (solo developer)

| # | Module | Key work | Days |
|---|---|---|---|
| 1 | Project setup | Monorepo init, Railway + Vercel config, Prisma init, env, CORS, Git | 2 |
| 2 | Auth | `routes/auth.js`, `middleware/auth.js`, `lib/jwt.js`, Login.jsx, Register.jsx, AuthContext.jsx, ProtectedRoute.jsx | 3 |
| 3 | Doctor profiles | `routes/doctors.js` (list + single), DoctorList.jsx, DoctorCard.jsx, DB seed | 2 |
| 4 | Availability + slot generation | `routes/doctors.js` (availability PUT), `utils/slots.js`, Availability.jsx, `GET /slots` endpoint | 2 |
| 5 | Booking system | `routes/appointments.js` (POST + GET), BookSlot.jsx, AppointmentCard.jsx | 3 |
| 6 | Video integration | `services/video.js`, `POST /appointments/:id/join`, VideoCall.jsx (DailyProvider wrapper), VideoRoom.jsx (patient + doctor) | 3 |
| 7 | Doctor panel | DoctorDashboard.jsx (queue, status update, join-call button) | 2 |
| 8 | Prescription builder | `routes/prescriptions.js`, `services/pdf.js`, PrescriptionBuilder.jsx, PrescriptionForm.jsx (medicine rows), PDF download endpoint | 4 |
| 9 | Patient dashboard | PatientDashboard.jsx, prescription list, PDF download, `GET /patients/me/prescriptions` | 2 |
| 10 | Email notifications | `services/email.js` (4 templates), integrate into booking + prescription routes | 2 |
| 11 | Reminder scheduler | `services/scheduler.js` (node-cron), integrate into server.js | 1 |
| 12 | Admin panel | `routes/admin.js`, DoctorApprovals.jsx, MedicineCatalog.jsx | 2 |
| 13 | Landing page | LandingPage.jsx (static) | 1 |
| 14 | Integration + QA | Cross-flow testing, mobile web (3G simulation), edge cases (double-booking, expired JWT, PDF failures) | 4 |
| | **Total** | | **~33 days (~6.5 weeks)** |

> Conservative estimate: **7–8 weeks** with real-world context switching, Daily.co integration surprises, and PDF rendering edge cases.

### Recommended build order (risk-first)

```
Week 1:    Setup + Auth              (Modules 1–2)  Everything depends on auth.
Week 2:    Video                     (Module 6)     Highest technical risk. Validate Daily.co on target infra first.
Week 2–3:  Booking + Profiles        (Modules 3–5)  Core business logic. Slot edge cases (timezone, day boundary).
Week 3–4:  Prescription + PDF        (Module 8)     Second-highest complexity. PDFKit + volume I/O need integration testing.
Week 4–5:  Dashboards + Email + Cron (Modules 7,9–11) Lower risk, high user value.
Week 5–6:  Admin + Landing           (Modules 12–13) Lowest risk. Admin is internal; landing page is static.
Week 6–7:  Integration QA            (Module 14)    End-to-end across all three roles, mobile web, slow connections.
```

### Complexity classification

| Module | Level | Reason |
|---|---|---|
| Video integration | High | Third-party WebRTC SDK, room lifecycle, token scoping, mobile browser |
| Prescription + PDF | High | Multi-entity form, PDFKit layout, file I/O, Railway volume, email trigger |
| Booking + slots | Medium | Timezone handling, double-booking prevention, date picker UX |
| Auth | Medium | JWT flow, role routing, bcrypt, 3 user types |
| Availability editor | Medium | Day-of-week UI, upsert logic, slot computation |
| Email service | Low | Resend SDK + HTML template strings |
| Scheduler | Low | node-cron + 2 DB queries |
| Admin panel | Low | CRUD, no complex logic |
| Doctor profiles | Low | Read-heavy, simple queries |
| Patient dashboard | Low | Read-heavy + PDF download |
| Landing page | Low | Static JSX, no API calls |

---

## 11. What NOT to Over-Engineer

| Area | Keep in v1 | Avoid |
|---|---|---|
| **Auth** | JWT + bcrypt. 7-day expiry. No refresh tokens. | OAuth/social login, 2FA, refresh rotation, session denylist |
| **Frontend state** | React Context for auth. `useState`/`useEffect` for everything else. | Redux, Zustand, Jotai, React Query, SWR |
| **API style** | Plain REST with Express Router. | GraphQL, tRPC, WebSockets (add Socket.io only in v1.1 for live queue) |
| **Database** | Single Postgres. No pooler. Direct Prisma client. | Read replicas, PgBouncer, sharding |
| **Caching** | None. Every request hits DB. | Redis, in-memory LRU, HTTP cache headers on dynamic endpoints |
| **File storage** | Railway volume. PDFs served by Express. | S3, CloudFront, signed URLs |
| **PDF generation** | PDFKit (in-process). | Puppeteer, headless Chrome, external PDF service |
| **Scheduling** | node-cron in Express process. | BullMQ, Agenda, Redis queues, separate worker |
| **Video** | Daily.co `<DailyProvider>` prebuilt UI. | Custom WebRTC signalling, proprietary TURN/STUN |
| **Validation** | Zod at route entry points only. | Defensive re-validation in services, DB layer, or utilities |
| **Testing** | Manual QA across three roles. | Unit/integration/E2E test suite — add in v1.1 after flows stabilize |
| **Monorepo tooling** | Two `package.json` files. `npm run dev` in each. | Nx, Turborepo, Yarn workspaces |
| **Error monitoring** | `console.error` + Railway logs. | Sentry, Datadog — add in v1.1 when real users hit real bugs |
| **Security hardening** | HTTPS (Vercel/Railway enforce), bcrypt, JWT, Zod. | Rate limiting (add `express-rate-limit` in v1.1), CSRF, helmet.js |
| **Logging** | `console.log`/`console.error` with context. | Winston, Pino, log aggregation |

---

## 12. Scale & Reliability

### Load at launch

| Metric | Value | Implication |
|---|---|---|
| Doctors | ~10 | Single-digit concurrency |
| Bookings/week | ~100 | ~2/hour peak — trivial for a single Postgres instance |
| Video traffic | ~100 sessions/week | Handled entirely by Daily.co CDN; zero Express load |
| PDF writes | ~100/week | ~50KB each → ~5MB/week storage |
| Reminder emails | ~300/week | Booking confirm + 2 reminders per appointment |
| DB queries/min | <10 | No connection pooler needed |

### Failure mitigations

| Component | Failure | Mitigation |
|---|---|---|
| Daily.co room creation | API timeout | try/catch → 503; patient retries |
| Resend delivery | Failure | Log + continue; booking still written to DB |
| PDFKit render | Crash | try/catch; prescription record persists; PDF re-generatable |
| node-cron | Server restart | ±5min window + boolean flag; no missed/duplicate sends |
| Railway volume | Disk full | Monitor dashboard; 1000 PDFs ≈ 50MB |
| Double-booking | Race condition | `findFirst` check before `create`; first write wins → 409 for second |

### Scaling path (post-launch)

1. **PgBouncer** — Railway plugin, no code changes, adds connection pooling
2. **Railway replica** — horizontal Express scaling, no code changes
3. **S3 migration** — change `services/pdf.js` write target + serve route redirect; two files
4. **BullMQ** — replace node-cron with Redis-backed queue when reliability is required
5. **Read replica** — Prisma supports `$extends` for read/write splitting if DB read load spikes

---

## 13. Trade-off Analysis

### Architecture: Monolith vs microservices
**Choice:** Monolith (single Express process).  
**Why:** At 10 doctors and 100 bookings/week, microservices add network hops, distributed tracing, and deployment complexity with zero benefit. Extract services only when a specific bottleneck is measured.  
**Revisit when:** A single module (e.g., PDF generation) creates unacceptable latency for the rest of the API.

### Auth: JWT (stateless) vs sessions (stateful)
**Choice:** Stateless JWT, 7-day expiry.  
**Why:** No session store to manage or scale. Trade-off: a compromised token cannot be invalidated before expiry without a denylist.  
**Revisit when:** Account suspension or instant logout is required (add a Redis-backed token denylist).

### PDF: PDFKit vs Puppeteer
**Choice:** PDFKit.  
**Why:** In-process, fast, no headless Chrome memory overhead (~300MB). Prescription layout is structured (table of medicines, fixed sections) — a programmatic drawing API is sufficient.  
**Revisit when:** Prescription templates require complex HTML/CSS layout.

### Scheduling: node-cron vs BullMQ
**Choice:** node-cron.  
**Why:** Zero infrastructure; a 5-minute poll is accurate enough at this scale. BullMQ requires Redis and a separate worker process.  
**Revisit when:** Job failure visibility or guaranteed-exactly-once delivery is needed.

### File storage: Railway volume vs S3
**Choice:** Railway volume.  
**Why:** Zero config; no IAM, bucket policies, or signed URL logic. At <1000 PDFs, disk usage is negligible.  
**Revisit when:** Volume size approaches Railway plan limits, or PDFs need CDN-level global delivery.

### Caching: none vs Redis
**Choice:** No caching.  
**Why:** At 100 bookings/week, every request hitting Postgres is fast (<10ms). Adding Redis is premature optimization.  
**Revisit when:** p95 DB query latency exceeds 200ms under real load.

### Video SDK: Daily.co vs Agora
**Choice:** Daily.co.  
**Why:** Prebuilt `<DailyProvider>` React component reduces integration to ~50 lines. Adaptive bitrate handles Pakistan 3G. Free tier covers early-stage usage.  
**Revisit when:** Custom in-call UI (virtual backgrounds, recording, breakout rooms) is required.

---

## 14. Future Considerations

### v1.1 (2–4 weeks post-launch)

**Online Payments (Safepay)**
```
server/src/
  services/payment.js     ← new: Safepay SDK wrapper
  routes/payments.js      ← new: POST /api/payments/initiate, POST /api/payments/webhook
  app.js                  ← mount /api/payments
```
Patient flow: "Pay" → `/initiate` returns redirect URL → patient pays on Safepay → webhook fires → appointment status updated. No changes to auth, appointments, or prescriptions.

**SMS / WhatsApp Notifications**
Rename `services/email.js` → `services/notifications.js`. Add Twilio or WhatsApp Business API calls alongside Resend. Scheduler already calls notification functions — no other files change.

**Live Queue / Spot Booking**
Add Socket.io to Express. Doctors emit `online` status; patients receive real-time queue updates. No DB schema changes — `Appointment` already supports the data model.

**Lapid COD Integration**
```
server/src/
  services/lapid.js       ← new: Lapid courier API wrapper
  routes/orders.js        ← new: POST /api/orders
```
Self-contained. No changes to prescriptions, appointments, or auth.

### v1.2+

- **Pharmacy ordering** — new `Pharmacy` + `Order` models; new `services/pharmacy.js`; new routes. Self-contained.
- **Raast P2M** — add as a payment method in `services/payment.js`; same webhook pattern as Safepay.
- **Urdu support** — add `react-i18next`; extract JSX strings to `locales/en.json` + `locales/ur.json`. Zero backend changes.

### v2

**React Native mobile app**  
Can reuse `client/src/api/` entirely (same endpoints, same JWT auth). Daily.co has `@daily-co/react-native-daily-js`. Backend requires no changes.

**Proprietary video streaming**  
Replace `services/video.js` only. `VideoCall.jsx` wraps the video provider — swap the implementation. Pages (`VideoRoom.jsx`) don't change. The `{ token, url }` interface from `POST /appointments/:id/join` stays identical.

**Backend scaling**  
1. PgBouncer — Railway plugin, no code changes
2. Railway replica — no code changes
3. S3 migration — two files (`services/pdf.js` + PDF serve route)
4. Read replica — Prisma `$extends` for read/write splitting

None require architectural redesign. The v1 structure was sized to allow each of these as a one- or two-file change.

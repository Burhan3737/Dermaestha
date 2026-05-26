# 02 — High-Level Architecture

**Style:** Decoupled monorepo. React SPA ↔ Express REST API over HTTPS. External services (Daily.co, Resend) called server-side only.

---

## Component Diagram

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

---

## Components

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

## Storage Decisions

| Data | Store | Rationale |
|---|---|---|
| Users, appointments, prescriptions, medicines | PostgreSQL | Relational — appointments link doctors ↔ patients ↔ prescriptions |
| Prescription PDFs | Railway volume at `/uploads` | Zero-config for MVP; upgrade to S3 later |
| Video rooms | Daily.co manages room state | Server stores only `videoRoomUrl` + `videoRoomName` on the Appointment row |
| Session tokens | Stateless JWT | No session store needed |

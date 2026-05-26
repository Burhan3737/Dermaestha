# 10 — Per-Module Effort Estimates

**Context:** Solo full-stack developer. Includes both backend (routes + services) and frontend (pages + components) per module. Includes ramp-up time for Daily.co and Prisma.

---

## Estimates by Module

| # | Module | Key work | Days |
|---|---|---|---|
| 1 | Project setup | Monorepo init, Railway + Vercel config, Prisma init, env, CORS, Git | 2 |
| 2 | Auth | `routes/auth.js`, `middleware/auth.js`, `lib/jwt.js`, Login.jsx, Register.jsx, AuthContext.jsx, ProtectedRoute.jsx | 3 |
| 3 | Doctor profiles | `routes/doctors.js` (list + single), DoctorList.jsx, DoctorCard.jsx, DB seed | 2 |
| 4 | Availability + slot generation | `routes/doctors.js` (availability PUT), `utils/slots.js`, Availability.jsx, `GET /slots` endpoint | 2 |
| 5 | Booking system | `routes/appointments.js` (POST + GET), BookSlot.jsx (date picker + slot grid + confirm), AppointmentCard.jsx | 3 |
| 6 | Video integration | `services/video.js`, `POST /appointments/:id/join`, VideoCall.jsx (DailyProvider wrapper), VideoRoom.jsx (patient + doctor) | 3 |
| 7 | Doctor panel | DoctorDashboard.jsx (today's queue, status update, join-call button) | 2 |
| 8 | Prescription builder | `routes/prescriptions.js`, `services/pdf.js`, PrescriptionBuilder.jsx, PrescriptionForm.jsx (medicine rows), PDF download endpoint | 4 |
| 9 | Patient dashboard | PatientDashboard.jsx, prescription list, PDF download, `GET /patients/me/prescriptions` | 2 |
| 10 | Email notifications | `services/email.js` (4 templates), integrate into booking + prescription routes | 2 |
| 11 | Reminder scheduler | `services/scheduler.js` (node-cron), integrate into `server.js` | 1 |
| 12 | Admin panel | `routes/admin.js`, DoctorApprovals.jsx, MedicineCatalog.jsx | 2 |
| 13 | Landing page | LandingPage.jsx (static, no API calls) | 1 |
| 14 | Integration + QA | Cross-flow testing, mobile web (3G simulation), edge cases (double-booking, expired JWT, PDF failures), bug fixes | 4 |
| | **Total** | | **~33 days (~6.5 weeks)** |

> Conservative estimate: **7–8 weeks** accounting for real-world context switching, Daily.co integration surprises, and PDF rendering edge cases.

---

## Recommended Build Order (Risk-First)

```
Week 1:    Setup + Auth              Modules 1–2
           Everything else depends on auth working correctly.

Week 2:    Video Integration         Module 6
           Highest technical risk. Validate Daily.co on Railway
           infrastructure before building the booking flows around it.

Week 2–3:  Booking + Profiles        Modules 3–5
           Core business logic. Slot generation has timezone and
           day-boundary edge cases worth surfacing early.

Week 3–4:  Prescription + PDF        Module 8
           Second-highest complexity. PDFKit rendering + Railway
           volume writes + email trigger all need integration testing.

Week 4–5:  Dashboards + Email + Cron Modules 7, 9, 10, 11
           Lower risk, high user value. Build doctor and patient
           dashboards around now-working flows.

Week 5–6:  Admin + Landing           Modules 12, 13
           Lowest risk. Admin is internal tooling;
           landing page is static JSX.

Week 6–7:  Integration QA            Module 14
           End-to-end across all three roles, mobile web,
           3G connection simulation, edge cases.
```

---

## Complexity Classification

| Module | Level | Primary reason |
|---|---|---|
| Video integration | High | Third-party WebRTC SDK, room lifecycle, token scoping, mobile browser compatibility |
| Prescription + PDF | High | Multi-entity form, PDFKit layout, file I/O, Railway volume, email trigger chain |
| Booking + slots | Medium | Timezone handling, double-booking prevention (race condition), date picker UX |
| Auth | Medium | JWT flow, role routing, bcrypt, 3 separate user types |
| Availability editor | Medium | Day-of-week UI, upsert logic, slot computation algorithm |
| Email service | Low | Resend SDK + HTML template strings |
| Scheduler | Low | node-cron + 2 DB queries per tick |
| Admin panel | Low | CRUD operations, no complex business logic |
| Doctor profiles | Low | Read-heavy, simple Prisma queries |
| Patient dashboard | Low | Read-heavy + PDF download link |
| Landing page | Low | Static JSX, no API calls |
| Project setup | Low | One-time config — Railway + Vercel are well-documented |

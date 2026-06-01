# 05 — API Specification Document

| Field | Value |
|---|---|
| Document ID | 05-API_SPECIFICATION_DOCUMENT |
| Status | Canonical |
| Version | 1.0 |
| Last updated | 2026-06-01 |
| Sources absorbed | `docs/engineering/API.md` |
| Related docs | 02, 03, 04, 08, 14 |

---

## Index

1. [Authentication mechanism](#1-authentication-mechanism)
2. [Base URL & versioning](#2-base-url--versioning)
3. [API conventions](#3-api-conventions)
4. [Endpoints](#4-endpoints)
5. [Appointment state-machine transition table](#5-appointment-state-machine-transition-table)
6. [Coverage checklists](#6-coverage-checklists)
7. [Revision footer](#revision-footer)

---

## Purpose

This document is a faithful re-presentation of `docs/engineering/API.md`. It describes every route, role constraint, request/response shape, shared convention, and the appointment state-machine contract that backs the v1 implementation. It does not replace API.md — that file remains the engineering-facing reference; this document serves as the canonical specification-suite view.

---

## 1. Authentication mechanism

**Cookie session auth — no JWT.** All authenticated requests carry an HTTP-only, Secure, SameSite=Lax session cookie set at login. There is no `Authorization` header and no token in the response body.

**Session established at login:** `POST /api/auth/login` accepts `{ email, password, role }`, validates credentials, and — on success — sets the session cookie. The response includes `{ id, role, fullName, mustChangePassword }`.

**`mustChangePassword` gate:** When a doctor account is created by an admin (or has its password manually reset via `POST /api/doctors/:id/reset-password`), the flag `mustChangePassword` is set to `true`. The middleware blocks all non-auth routes for that session until `POST /api/auth/change-password` is called, which clears the flag (DA3).

**Role-based access control (DA6):** Every authenticated route is guarded by the single `requireRole(...)` middleware. Roles are enforced server-side only — never re-checked in handler bodies, never only on the client. Valid roles are `patient`, `doctor`, `admin`, and `system` (worker/webhook, no session). The `GET /api/auth/me` bootstrap endpoint exposes the caller's role to the SPA for client-side UI guards (convenience only; it is not a security boundary).

**Enumeration safety (P2):** `POST /api/auth/forgot-password` and `POST /api/auth/login` return an identical shape for known and unknown accounts, so callers cannot determine whether an email address is registered.

---

## 2. Base URL & versioning

All routes are same-origin under the `/api` prefix. There is no version segment in v1 paths (e.g. `/api/v1/...`). The convention is:

```
/api/<resource>[/:id][/<sub-resource>]
```

File upload (doctor photo) uses `multipart/form-data`; all other routes use `Content-Type: application/json`.

Express serves `client/dist` and the SPA catch-all **after** all `/api` routes. Legal pages (`/legal/terms`, `/legal/privacy`) are static SPA routes — not `/api` endpoints.

---

## 3. API conventions

### 3.1 Request / response format

- **Format:** JSON in, JSON out. `Content-Type: application/json` except file upload (`multipart/form-data`).
- **Success envelope:** the resource directly (`{ ...fields }`) or `{ data: [...], page }` for lists. No success wrapper noise.
- **Error envelope (uniform):**

```json
{ "error": { "code": "SLOT_TAKEN", "message": "Human-readable.", "details": { } } }
```

`code` is a stable SCREAMING_SNAKE string (clients branch on it); `message` is display-safe; `details` is optional (e.g. Zod field errors).

Validation is Zod-first (`shared/schemas`), then the controller calls a service; controllers stay thin.

### 3.2 HTTP status code map

| Status | When | Example `code` |
|---|---|---|
| `200` | OK | — |
| `201` | Resource created | — |
| `204` | OK, no body (logout) | — |
| `400` | Malformed / Zod validation fail | `VALIDATION_FAILED` |
| `401` | Not authenticated | `UNAUTHENTICATED` |
| `403` | Authenticated but wrong role / not owner (DA6) | `FORBIDDEN` |
| `404` | Not found *or* not visible to caller (avoid existence leaks) | `NOT_FOUND` |
| `409` | State/uniqueness conflict | `SLOT_TAKEN`, `LOCK_EXPIRED`, `IMMUTABLE_FIELD`, `ALREADY_PRESCRIBED` |
| `422` | Well-formed but semantically rejected | `BOOKING_TOO_SOON`, `REFUND_INELIGIBLE` |
| `429` | Rate-limited / locked out | `RATE_LIMITED`, `ACCOUNT_LOCKED` |
| `500` | Unexpected; logged to error tracking | `INTERNAL` |

Additional rules:

- **Enumeration-safe auth (P2):** `forgot-password` and `login` return an identical shape for known/unknown accounts; never reveal which emails exist.
- **Webhooks** return `200` only after the signature verifies and the event is durably handled; an invalid signature is `401` + logged to the admin alert feed.

### 3.3 Lists & pagination

List endpoints accept `?page=1&pageSize=20` (sensible caps) and return:

```json
{ "data": [...], "page": { "number": 1, "size": 20, "total": 143 } }
```

Filtered admin queries (A5) add typed filter params documented per endpoint.

### 3.4 Money & time

- **Money:** integer PKR-paisa in every request/response (never floats, never rupees). A fee of Rs 500 is represented as `50000`.
- **Time:** ISO-8601 UTC instants in all API fields; the client renders `Asia/Karachi`.

---

## 4. Endpoints

**Role legend:** `public` · `patient` · `doctor` · `admin` · `system` (worker/webhook, no session). `#n` references = PRD §3.3 invariant numbers.

---

### F01 / F15 — Auth & session (P2, DA1–DA6)

| Method · Path | Role | Purpose | Notes |
|---|---|---|---|
| `POST /api/auth/signup` | public | Patient sign-up + ToS consent → session | rate-limited; records `tosAcceptedAt`; patient role only |
| `POST /api/auth/login` | public | Shared login, routes by `role` (DA2) | rate-limited + lockout (`CONFIG.md`); audit-logged |
| `POST /api/auth/logout` | any | Destroy session | `204` |
| `GET /api/auth/me` | any | Bootstrap SPA: `{ id, role, fullName, mustChangePassword }` | drives client role-guards (convenience only) |
| `POST /api/auth/forgot-password` | public | Email reset token (1h, P2) | rate-limited; **enumeration-safe** |
| `POST /api/auth/reset-password` | public | Consume token + set password | token single-use |
| `POST /api/auth/change-password` | doctor/patient | Self change; clears `mustChangePassword` (DA3) | audit-logged |

---

### F02 / F10 — Doctors — discovery, onboarding & management (P1, P3, A1, A4, DA1, DA5, #8/#9)

| Method · Path | Role | Purpose | Notes |
|---|---|---|---|
| `GET /api/doctors` | public | Listing (active only) for Browse (P1) | paginated; never shows `isActive=false` |
| `GET /api/doctors/:id` | public | Public profile (P3) | active only |
| `POST /api/doctors` | admin | Onboard doctor + set initial password (A1/DA1) | creates User(role=doctor)+Doctor in one tx; `mustChangePassword=true` |
| `PATCH /api/doctors/:id` | admin | Edit editable fields (A4) | **rejects `pmcNumber`/`email` → 409 `IMMUTABLE_FIELD` (#8)** |
| `POST /api/doctors/:id/deactivate` | admin | `isActive=false` (A4/#9) | no cancel, no refund cascade; login still works |
| `POST /api/doctors/:id/reactivate` | admin | `isActive=true` | — |
| `POST /api/doctors/:id/reset-password` | admin | Manual recovery (DA5) | sets `mustChangePassword=true`; audit-logged |
| `POST /api/doctors/:id/photo` | admin | Upload/validate photo | `multipart/form-data`; type/size validated |

---

### F09 — Doctor weekly availability & slots (D1, P3, edge #14)

| Method · Path | Role | Purpose | Notes |
|---|---|---|---|
| `GET /api/doctors/:id/availability` | doctor(own)/admin | Read weekly grid | — |
| `PUT /api/availability` | doctor | Replace own weekly blocks (D1) | guard: blocks with existing bookings (edge #14) |
| `GET /api/doctors/:id/slots?date=YYYY-MM-DD` | public | **Generated** 30-min slots for a day | excludes booked (active-state) + lead-time-filtered (`minBookingLeadMinutes`) |

---

### F03 / F05 / F06 — Booking, appointments & video (P3, P5, P6, P8, P9, D2, D3, D5)

| Method · Path | Role | Purpose | Notes |
|---|---|---|---|
| `POST /api/appointments/lock` | patient | Create `slot_locked` (10-min hold) + "who-for" (P3/P8) | the partial unique index makes a 2nd lock fail → 409 `SLOT_TAKEN` (#1) |
| `POST /api/appointments/:id/pay` | patient | Create idempotent payment intent → PayFast handoff URL (P3) | idempotent on `(patient, slot)` (#7); 409 `LOCK_EXPIRED` if hold gone |
| `GET /api/appointments` | patient/doctor | Role-scoped list (P9 own / D2 today+history) | patient sees own; doctor sees assigned; never cross-tenant |
| `GET /api/appointments/:id` | patient/doctor/admin | Detail, ownership-checked | 404 (not 403) when not visible |
| `POST /api/appointments/:id/cancel` | patient/doctor | Cancel (P6/D5) → state transition + refund per policy | see §5 transition table for ≥2h vs <2h vs doctor |
| `POST /api/appointments/:id/dispute` | admin | Set/clear `disputed` flag (A5) | flag only — not a state transition; audit-logged |
| `GET /api/appointments/:id/video-token` | patient/doctor | Time-bound Daily token (P5/D3) | issued only within slot-start−10m … slot-end+5m |

---

### F04 — Payments & webhooks (§3.4, #6/#7/#10)

| Method · Path | Role | Purpose | Notes |
|---|---|---|---|
| `POST /api/webhooks/payfast` | system | `payment.success`/`failed` ingest | **signature-verified or 401 + alert**; success commits appointment+payment in one tx (#2), snapshots `feeAtBooking` (#6) |
| `POST /api/webhooks/daily` | system | Participant join/leave events → evaluation worker | feeds no-show resolution |
| `POST /api/webhooks/resend` | system | Bounce/complaint signal | flags email failures to A3 |

> Refunds have **no patient/doctor route** — they are a side-effect of cancel/no-show transitions, orchestrated by `refund.service` with the per-appointment idempotency key (#10), retried with backoff, admin-alerted on exhaustion. No in-app manual retry (admin acts in the gateway dashboard if needed).

---

### F08 — Prescriptions (D4, P7, #4/#5)

| Method · Path | Role | Purpose | Notes |
|---|---|---|---|
| `POST /api/appointments/:id/prescriptions` | doctor | Submit immutable prescription + items (D4) | only on `completed`/`prescription_issued`; snapshots doctor (#3) + items' price (#5) |
| `GET /api/appointments/:id/prescriptions` | patient/doctor/admin | Chronological list for the appointment (P7) | role-scoped |
| — *(no `PUT`/`DELETE`)* | — | **Immutability (#4)** — corrections are new linked rows | a 2nd submit appends, never edits |

---

### F11 — Medicines catalogue (A2, D4)

| Method · Path | Role | Purpose | Notes |
|---|---|---|---|
| `GET /api/medicines?q=` | doctor/admin | Search for the builder / manage | active filter for builder |
| `POST /api/medicines` | admin | Add catalogue entry (A2) | unit price in paisa |
| `PATCH /api/medicines/:id` | admin | Edit name/price/forms (A2) | does **not** affect existing prescriptions (#5) |
| `POST /api/medicines/:id/deactivate` | admin | Soft-disable | — |

---

### F12 / F13 / F14 — Admin: alerts, records, audit & settings (A3, A5, A6)

| Method · Path | Role | Purpose | Notes |
|---|---|---|---|
| `GET /api/admin/audit` | admin | Filtered audit query (A5) | filters: `appointmentId,userId,email,eventType,actorType,from,to`; **read-only, no write/delete route** |
| `GET /api/admin/records` | admin | Unified records view (A5) | rows + detail link to history + prescriptions |
| `GET /api/admin/alerts` | admin | Alert feed / system health (A3) | webhook-failure, refund-exhaustion, abuse escalations |
| `POST /api/admin/emails/:eventId/resend` | admin | Re-trigger a failed email (A3/A5) | audit-logged |
| `GET /api/admin/settings` | admin | Read platform settings (A6) | single row |
| `PUT /api/admin/settings` | admin | Update lead-time + fallback-fee model (A6) | `minBookingLeadMinutes` floor 30; audit-logged |

---

### Analytics (KPI #1/#3)

| Method · Path | Role | Purpose | Notes |
|---|---|---|---|
| `POST /api/analytics/events` | public/any | Ingest a telemetry event | `{ type, networkType?, meta? }`; see `INTEGRATIONS.md` catalog |

---

### F16 — Legal content

`/legal/terms` and `/legal/privacy` are static SPA routes (M4 content), not `/api` routes. Express serves `client/dist` and the SPA catch-all after all `/api` routes.

---

## 5. Appointment state-machine transition table

The **only** module that performs transitions is `appointmentState.service`. It validates `from → to` against the table below, writes the audit entry, then fires side-effects (refund, email, video token). Controllers and the three workers call it; none mutate `state` directly.

`slot_available` = **no row** (absence). Booking inserts at `slot_locked`.

| From | → To | Trigger (actor) | Side-effects |
|---|---|---|---|
| *(none)* | `slot_locked` | patient picks slot + Pay (patient) | set `lockExpiresAt=now+10m`; partial unique index guards #1 |
| `slot_locked` | `confirmed` | `payment.success` webhook (system) | **one tx**: snapshot `feeAtBooking` (#6) + write payment (#2); enqueue confirmation email |
| `slot_locked` | *(row removed / released)* | lock expiry or `payment.failed` (system) | slot becomes available again |
| `confirmed` | `cancelled_refunded` | patient cancels ≥2h before (patient) | refund net-of-fee (policy #5); slot released; refund email |
| `confirmed` | `cancelled_no_refund` | patient cancels <2h before (patient) | no refund; slot stays blocked |
| `confirmed` | `doctor_cancelled` | doctor cancels any time (doctor) | refund net-of-fee; **apology email**; slot released |
| `confirmed` | `in_progress` | slot-start arrives (system) | activate video room/tokens |
| `in_progress` | `completed` | both joined + call ends (system) | finalize at slot-end+5m; transient drops don't finalize (edge #22) |
| `in_progress` | `patient_no_show` | patient absent at slot+15m (system) | **no refund** |
| `in_progress` | `doctor_no_show` | doctor absent at slot+15m (system) | refund net-of-fee; apology email |
| `in_progress` | *(non-penalizing terminal)* | missing participant data (system) | resolve + admin alert; never leave `in_progress` past slot-end+5m |
| `completed` | `prescription_issued` | doctor submits prescription (doctor) | immutable write (#4); "prescription ready" email |
| `prescription_issued` | `prescription_issued` | additional prescription (doctor) | new linked row, chronological (#4) — state unchanged |

**Derived (not a stored state):** `awaiting_prescription` — a `completed` appointment with no prescription after 12h raises an A3 alert (`CONFIG.md`).

**Orthogonal flag:** `disputed` may attach to any terminal state without a transition.

---

## 6. Coverage checklists

### 6.1 Every PRD requirement ID is routed

| ID | Covered by |
|---|---|
| P1 browse | `GET /api/doctors`, `GET /api/doctors/:id` |
| P2 signup/login/reset/consent | `auth/*` (signup, login, forgot/reset-password); ToS at signup |
| P3 book slot | `slots`, `appointments/lock`, `appointments/:id/pay` |
| P4 reminders | notification worker (no route) — see `INTEGRATIONS.md` |
| P5 join call | `appointments/:id/video-token` |
| P6 cancel | `appointments/:id/cancel` |
| P7 view/download Rx | `GET .../prescriptions` + client PDF |
| P8 book for someone | `appointments/lock` (`forSelf`+subject fields) |
| P9 list own appts | `GET /api/appointments` (patient scope) |
| D1 availability | `PUT /api/availability`, `GET .../availability` |
| D2 today + history | `GET /api/appointments` (doctor scope) |
| D3 join call | `appointments/:id/video-token` |
| D4 build Rx | `POST .../prescriptions`, `GET /api/medicines` |
| D5 cancel | `appointments/:id/cancel` (doctor → `doctor_cancelled`) |
| A1 onboard doctor | `POST /api/doctors` |
| A2 medicines | `medicines/*` |
| A3 health/alerts | `GET /api/admin/alerts`, `emails/:id/resend` |
| A4 edit/deactivate | `PATCH /api/doctors/:id`, `deactivate`/`reactivate` |
| A5 records & audit | `GET /api/admin/records`, `GET /api/admin/audit`, `appointments/:id/dispute` |
| A6 settings | `GET`/`PUT /api/admin/settings` |
| DA1 doctor create+pw | `POST /api/doctors` |
| DA2 shared login+route | `POST /api/auth/login`, `GET /api/auth/me` |
| DA3 forced first change | `change-password` gated by `mustChangePassword` middleware |
| DA4 admin bootstrap | one-off script (no route) — runbook |
| DA5 doctor pw recovery | `POST /api/doctors/:id/reset-password` |
| DA6 role authz | `requireRole` middleware on every authenticated route |

### 6.2 Every §3.3 invariant has a mechanism

| # | Invariant | Mechanism |
|---|---|---|
| 1 | no double-booking | partial unique index `uniq_active_slot` (raw-SQL migration) → 409 `SLOT_TAKEN` |
| 2 | atomic book+pay | single Prisma `$transaction` in the `payfast` webhook path |
| 3 | durable doctor identity | no denormalized name on appointment; `Prescription.doctorSnapshot` |
| 4 | Rx immutable | no `PUT`/`DELETE` route or service method; corrections = new rows |
| 5 | price snapshot | `PrescriptionItem.price` captured at submit |
| 6 | fee snapshot | `Appointment.feeAtBooking` set on `→confirmed` |
| 7 | intent idempotency | `Payment @@unique([patientUserId, slotStart])` |
| 8 | PMC/email immutable | `PATCH /api/doctors/:id` rejects both → `IMMUTABLE_FIELD` |
| 9 | deactivation preserves | `isActive` flag gates listing/booking only; login + scoped routes intact |
| 10 | refund idempotency | `Payment.refundIdempotencyKey @unique` |

---

## Revision footer

| Date | Change | Why |
|---|---|---|
| 2026-06-01 | Initial creation | Faithful re-presentation of API.md |

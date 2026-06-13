# 05 — API Specification Document

| Field            | Value                         |
| ---------------- | ----------------------------- |
| Document ID      | 05-API_SPECIFICATION_DOCUMENT |
| Status           | Canonical                     |
| Version          | 1.10                          |
| Last updated     | 2026-06-13                    |
| Sources absorbed | `docs/engineering/API.md`     |
| Related docs     | 02, 03, 04, 08, 14            |

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

**`mustChangePassword` gate:** When a doctor account is created by an admin (or has its password manually reset via `POST /api/doctors/:id/reset-password`), the flag `mustChangePassword` is set to `true`. The middleware blocks all non-auth routes for that session until `POST /api/auth/change-password` is called, which clears the flag (DA3). Blocked requests return `403 MUST_CHANGE_PASSWORD`.

**Role-based access control (DA6):** Every authenticated route is guarded by the single `requireRole(...)` middleware. Roles are enforced server-side only — never re-checked in handler bodies, never only on the client. Valid roles are `patient`, `doctor`, `admin`, and `system` (worker/webhook, no session). The `GET /api/auth/me` bootstrap endpoint exposes the caller's role to the SPA for client-side UI guards (convenience only; it is not a security boundary).

**Enumeration safety (P2):** `POST /api/auth/forgot-password` and `POST /api/auth/login` return an identical shape for known and unknown accounts, so callers cannot determine whether an email address is registered.

---

## 2. Base URL & versioning

All routes are same-origin under the `/api` prefix. There is no version segment in v1 paths (e.g. `/api/v1/...`). The convention is:

```
/api/<resource>[/:id][/<sub-resource>]
```

File upload (doctor photo) uses `multipart/form-data` (field `"photo"`); all other routes use `Content-Type: application/json`.

Uploaded doctor photos are served at `GET /uploads/doctors/<id>.<ext>` via `express.static` (`X-Content-Type-Options: nosniff`, `index: false`) — outside the `/api` prefix.

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

| Status | When                                                         | Example `code`                                                        |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `200`  | OK                                                           | —                                                                     |
| `201`  | Resource created                                             | —                                                                     |
| `204`  | OK, no body (logout)                                         | —                                                                     |
| `400`  | Malformed / Zod validation fail                              | `VALIDATION_FAILED`, `INVALID_FILE` (photo upload — no file / bad magic bytes / >2MB) |
| `401`  | Not authenticated                                            | `UNAUTHENTICATED`                                                     |
| `403`  | Wrong role / not owner (DA6); or session must change password (DA3) | `FORBIDDEN`, `MUST_CHANGE_PASSWORD`                                                           |
| `404`  | Not found _or_ not visible to caller (avoid existence leaks) | `NOT_FOUND`                                                           |
| `409`  | State/uniqueness conflict                                    | `SLOT_TAKEN`, `LOCK_EXPIRED`, `IMMUTABLE_FIELD`, `INVALID_STATE`, `BLOCK_HAS_BOOKINGS`, `ACTIVE_LOCK_EXISTS`, `OVERLAP`, `INVALID_TRANSITION`, `PMC_TAKEN`, `EMAIL_TAKEN` (P2002 on doctor create) |
| `422`  | Well-formed but semantically rejected                        | `BOOKING_TOO_SOON`, `REFUND_INELIGIBLE`, `SLOT_NOT_BOOKABLE`, `VIDEO_WINDOW_CLOSED` |
| `429`  | Rate-limited / locked out                                    | `RATE_LIMITED`, `ACCOUNT_LOCKED`                                      |
| `500`  | Unexpected; logged to error tracking                         | `INTERNAL` — a non-`AppError`/non-`ZodError` 500 also writes a fire-and-forget `system.unhandled_exception` audit row (F12.01 alert source; `targetRef` = route path, `reason` = message ≤ 500 chars) |

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

| Method · Path                    | Role           | Purpose                                                     | Notes                                                    |
| -------------------------------- | -------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `POST /api/auth/signup`          | public         | Patient sign-up + ToS consent → session                     | rate-limited; records `tosAcceptedAt`; patient role only |
| `POST /api/auth/login`           | public         | Shared login, routes by `role` (DA2)                        | rate-limited + lockout (doc 15); audit-logged       |
| `POST /api/auth/logout`          | any            | Destroy session                                             | `204`                                                    |
| `GET /api/auth/me`               | any            | Bootstrap SPA: `{ id, role, fullName, mustChangePassword }` | drives client role-guards (convenience only)             |
| `POST /api/auth/forgot-password` | public         | Email reset token (1h, P2)                                  | rate-limited; **enumeration-safe**                       |
| `POST /api/auth/reset-password`  | public         | Consume token + set password                                | token single-use                                         |
| `POST /api/auth/change-password` | doctor/patient | Self change; clears `mustChangePassword` (DA3)              | audit-logged                                             |

---

### F02 / F10 — Doctors — discovery, onboarding & management (P1, P3, A1, A4, DA1, DA5, #8/#9)

| Method · Path                          | Role   | Purpose                                        | Notes                                                                 |
| -------------------------------------- | ------ | ---------------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/doctors`                     | public/admin | Listing (active only) for Browse (P1); admin all-doctors branch | default: paginated, never shows `isActive=false`. `?includeInactive=true` (admin only; non-admin → 403 `FORBIDDEN`) returns ALL doctors as a flat `{ data: [...] }` array (NO page envelope), each row adding `email`/`phone`/`pmcNumber`/`photoUrl`/`isActive`/`status`/`upcomingConfirmedCount` |
| `GET /api/doctors/:id`                 | public | Public profile (P3)                            | active only                                                           |
| `POST /api/doctors`                    | admin  | Onboard doctor + set initial password (A1/DA1) | creates User(role=doctor)+Doctor in one tx; `mustChangePassword=true`; new doctor starts `isActive=false`, `status=pending` (Pending-State Rule; first reactivation promotes `status→active`) |
| `PATCH /api/doctors/:id`               | admin  | Edit editable fields (A4)                      | **rejects `pmcNumber`/`email` → 409 `IMMUTABLE_FIELD` (#8)**          |
| `POST /api/doctors/:id/deactivate`     | admin  | `isActive=false` (A4/#9)                       | no cancel, no refund cascade; login still works                       |
| `POST /api/doctors/:id/reactivate`     | admin  | `isActive=true`                                | always sets `status→active` (covers both a pending doctor's first activation and a previously-deactivated doctor) |
| `POST /api/doctors/:id/reset-password` | admin  | Manual recovery (DA5)                          | sets `mustChangePassword=true`; audit-logged                          |
| `POST /api/doctors/:id/photo`          | admin  | Upload/validate photo                          | `multipart/form-data`; type/size validated                            |

---

### F09 — Doctor weekly availability & slots (D1, P3, edge #14)

| Method · Path                                | Role              | Purpose                              | Notes                                                                         |
| -------------------------------------------- | ----------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `GET /api/doctors/:id/availability`          | doctor(own)/admin | Read weekly grid                     | —                                                                             |
| `PUT /api/availability`                      | doctor            | Replace own weekly blocks (D1)       | guard: blocks with existing bookings (edge #14)                               |
| `PUT /api/doctors/:id/availability`          | admin             | Replace any doctor's weekly blocks   | same `AvailabilityReplaceSchema`; 409 `BLOCK_HAS_BOOKINGS`; `adminWriteLimiter` 60/15min keyed by session `userId`; audit `doctor.availability_updated` |
| `GET /api/doctors/:id/slots?date=YYYY-MM-DD` | public            | **Generated** 30-min slots for a day | excludes booked (active-state) + lead-time-filtered (`minBookingLeadMinutes`) |

---

### F03 / F05 / F06 — Booking, appointments & video (P3, P5, P6, P8, P9, D2, D3, D5)

| Method · Path                           | Role                 | Purpose                                                     | Notes                                                                  |
| --------------------------------------- | -------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/appointments/lock`           | patient              | Create `slot_locked` (10-min hold) + "who-for" (P3/P8)      | a concurrent 2nd lock fails via the partial unique index → 409 `SLOT_TAKEN` (#1); validation also returns 409 `ACTIVE_LOCK_EXISTS`/`OVERLAP` (single-lock / no-overlap) and 422 `SLOT_NOT_BOOKABLE` (non-bookable or expired-lock collision, ADR-23) |
| `POST /api/appointments/:id/pay`        | patient              | Create idempotent payment intent → PayFast handoff URL (P3) | idempotent on `(patient, slot)` (#7); 409 `LOCK_EXPIRED` if hold gone  |
| `GET /api/appointments`                 | patient/doctor       | Role-scoped list (P9 own / D2 today+history)                | patient sees own; doctor sees assigned; never cross-tenant; `?scope=history` returns terminal-state rows newest-first; list rows (both roles) include `hasPrescription` |
| `GET /api/appointments/:id`             | patient/doctor/admin | Detail, ownership-checked                                   | 404 (not 403) when not visible; detail adds `subjectAge`, `subjectRelation`, `patientName` |
| `POST /api/appointments/:id/cancel`     | patient/doctor       | Cancel (P6/D5) → state transition + refund per policy       | see §5 transition table for ≥2h vs <2h vs doctor                       |
| `POST /api/appointments/:id/dispute`    | admin                | Set/clear `disputed` flag (A5)                              | flag only — not a state transition; audit-logged                       |
| `GET /api/appointments/:id/video-token` | patient/doctor       | Time-bound Daily token (P5/D3)                              | issued only within slot-start−10m … slot-end+5m                        |

---

### F04 — Payments & webhooks (§3.4, #6/#7/#10)

| Method · Path                | Role   | Purpose                                           | Notes                                                                                                                    |
| ---------------------------- | ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/webhooks/payfast` | system | `payment.success`/`failed` ingest                 | **signature-verified or 401 + alert**; success commits appointment+payment in one tx (#2), snapshots `feeAtBooking` (#6) |
| `POST /api/webhooks/daily`   | system | Participant join/leave events → evaluation worker | feeds no-show resolution                                                                                                 |
| `POST /api/webhooks/resend`  | system | Bounce/complaint signal                           | flags email failures to A3                                                                                               |

> Refunds have **no patient/doctor route** — they are a side-effect of cancel/no-show transitions, orchestrated by the refund logic in `modules/appointment/service.js` with the per-appointment idempotency key (#10), retried with backoff, admin-alerted on exhaustion. No in-app manual retry (admin acts in the gateway dashboard if needed).

> **Dev-only, non-canonical:** when `PAYMENT_PROVIDER=mock`, the app mounts `GET /dev/checkout` + `POST /dev/payment/complete` to simulate PayFast's hosted page by emitting a real signed IPN to `/api/webhooks/payfast` (ADR-22, doc 14 §2). These `/dev/*` routes are not part of the canonical API surface and are never mounted in production.

> **Dev-only worker triggers (non-canonical):** When `NODE_ENV === 'development'`, the app additionally mounts three on-demand routes to trigger worker passes directly (never mounted in production). See the worker/cron section in doc 14 for the production schedule.
>
> | Method · Path                    | Returns        | Runs                                 |
> | -------------------------------- | -------------- | ------------------------------------ |
> | `POST /dev/worker/notifications` | `{ ok: true }` | Notification dispatch pass           |
> | `POST /dev/worker/refund-retry`  | `{ ok: true }` | Refund-retry pass                    |
> | `POST /dev/worker/reconcile`     | `{ ok: true }` | Payment-reconciliation pass (F04.03) |

> **Reconciliation worker (F04.03) — reuses the webhook confirm path:** The hourly payment-reconciliation worker, when the gateway reports a lost-IPN payment as paid, performs the **same** atomic `confirmPaidAppointment` transition as the `payment.success` webhook above: `slot_locked → confirmed`, snapshot `feeAtBooking`, write payment record, and enqueue confirmation email — all inside one Prisma `$transaction`. `appointmentState.transition` remains the only writer of `Appointment.state`; the worker never writes state directly. On edge #6a (gateway reports paid but the slot is no longer claimable), the worker issues a full gross refund instead of creating a second appointment.

---

### F08 — Prescriptions (D4, P7, #4/#5)

| Method · Path                              | Role                 | Purpose                                                 | Notes                                                                                |
| ------------------------------------------ | -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /api/appointments/:id/prescriptions` | doctor (owner)       | Submit immutable prescription + items (D4)              | 404-no-leak if not the owning doctor; state must be `completed`/`prescription_issued` else 409 `INVALID_STATE`; each item is `medicineId` XOR `medicineName` with dosage/duration/instructions, unknown `medicineId` → 400 `VALIDATION_FAILED`; one `$transaction`: create + items (server-side name/price snapshot #3/#5; free-text price `null`) → first-issue `completed→prescription_issued` transition → `prescription_ready` outbox enqueue (`dedupeKey` = prescription id) → `201` |
| `GET /api/appointments/:id/prescriptions`  | patient/doctor/admin | Chronological list for the appointment (P7)             | role-scoped (patient-owner / doctor-owner / admin); `{ data: [...] }` ordered `issuedAt` asc, items included |
| — _(no `PUT`/`DELETE`)_                    | —                    | **Immutability (#4)** — corrections are new linked rows | a 2nd submit appends a new row (+ a 2nd `prescription_ready` email) and leaves state unchanged, never edits |

---

### F11 — Medicines catalogue (A2, D4)

| Method · Path                        | Role         | Purpose                         | Notes                                           |
| ------------------------------------ | ------------ | ------------------------------- | ----------------------------------------------- |
| `GET /api/medicines?search=`         | doctor/admin | Search for the builder          | `{ data: [...] }` active-only, name-sorted; `search` matches `name` + `genericName`; admin may add `?includeInactive=true` to include inactive entries (non-admin with that param → 403 `FORBIDDEN`) |
| `POST /api/admin/medicines`          | admin        | Add catalogue entry (A2)        | unit price in paisa; `201`; audit `medicine.created`                    |
| `PATCH /api/admin/medicines/:id`     | admin        | Edit fields + `isActive` toggle (A2) | partial edit; **deactivate-only, no `DELETE`**; does **not** affect existing prescriptions (#5); unknown id → 404; audit `medicine.updated` (`meta.fields`) |

---

### F12 / F13 / F14 — Admin: alerts, records, audit & settings (A3, A5, A6)

| Method · Path                            | Role  | Purpose                                    | Notes                                                                                                   |
| ---------------------------------------- | ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/audit`                   | admin | Filtered audit query (A5)                  | filters: `appointmentId,userId,email,eventType,actorType,from,to` — `appointmentId` maps to `targetRef`, `email` resolves to `actorId` (an unknown email matches NOTHING via a sentinel); `pageSize` ≤ 100; newest-first page envelope; **read-only, no write/delete route** |
| `GET /api/admin/records`                 | admin | Unified records view (A5)                  | full filter set via `recordsQuerySchema`: `page`/`pageSize` (≤ 100), `patient` (email-or-phone contains, case-insensitive), `doctorName` (contains), `appointmentId`, `paymentRef` (exact match vs `providerRef` OR `refundRef`), `state` (`AppointmentState` enum), `from`/`to` (`YYYY-MM-DD` as Karachi day boundaries: `from`→00:00 PKT gte, `to`→exclusive next-midnight PKT). Response `{ data: [recordRow], page: { number, size, total } }`; money columns come from the payment with `status='success'` (enum is `pending`\|`success`\|`failed`, NOT "paid") |
| `GET /api/admin/records/:id`             | admin | Appointment detail (F13.02)                | `{ appointment, history, prescriptions, notificationJobs }` — transition history + prescriptions + email jobs; 404 if not found |
| `GET /api/admin/alerts`                  | admin | Alert feed / system health (A3)            | real 5 kinds: `payment.reconciliation_mismatch`, `payment.refund_exhausted`, `email.send_failed_final`, `system.unhandled_exception` (audit rows, cap 100), plus the derived `awaiting_prescription` (cap 100); email alerts carry `failedJobs[]`; response `{ data: [...] }` newest-first |
| `POST /api/admin/emails/:jobId/resend`   | admin | Re-trigger a failed email (A3/A5)          | `:jobId` = `notification_jobs.id`; only `failed` jobs accepted (any other status / lost race → 409 `INVALID_STATE`); atomic reset `attempts=0, nextAttemptAt=null, lastError=null`; 404 unknown; audit `admin.email_resend` |
| `GET /api/admin/settings`                | admin | Read platform settings (A6)                | returns shaped `{ minBookingLeadMinutes, fallbackFeePctBps, fallbackFeeFixed }`, or `null` if the singleton row is missing (unseeded DB) |
| `PUT /api/admin/settings`                | admin | Update lead-time + fallback-fee model (A6) | full replace of the 3 tunables — `minBookingLeadMinutes` 30–1440, `fallbackFeePctBps` 0–10000 bps, `fallbackFeeFixed` ≥ 0 paisa; returns the updated shaped object; audit `settings.updated` with before/after meta |

---

### Analytics (KPI #1/#3)

| Method · Path                | Role       | Purpose                  | Notes                                                          |
| ---------------------------- | ---------- | ------------------------ | -------------------------------------------------------------- |
| `POST /api/analytics/events` | public/any | Ingest a telemetry event | `{ type, networkType?, meta? }`; see doc 14 (analytics catalog) |

---

### F16 — Legal content

`/legal/terms` and `/legal/privacy` are static SPA routes (M4 content), not `/api` routes. Express serves `client/dist` and the SPA catch-all after all `/api` routes.

---

## 5. Appointment state-machine transition table

The **only** writer that performs transitions is the `transition()` function in `modules/appointment/service.js`. It validates `from → to` against the table below, writes the audit entry, then fires side-effects (refund, email, video token). Controllers and the three workers call it; none mutate `state` directly.

The write is **state-guarded**: the update is an `updateMany WHERE id = :id AND state = :from`, so a concurrent transition that already moved the row loses (matched-count 0 → 409 `INVALID_TRANSITION`) instead of silently double-applying. This closes the double-apply race (e.g. two concurrent first-issue prescription submits) — exactly one wins.

`slot_available` = **no row** (absence). Booking inserts at `slot_locked`.

| From                  | → To                        | Trigger (actor)                          | Side-effects                                                                              |
| --------------------- | --------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| _(none)_              | `slot_locked`               | patient picks slot + Pay (patient)       | set `lockExpiresAt=now+10m`; partial unique index guards #1                               |
| `slot_locked`         | `confirmed`                 | `payment.success` webhook (system)       | **one tx**: snapshot `feeAtBooking` (#6) + write payment (#2); enqueue confirmation email |
| `slot_locked`         | _(row removed / released)_  | lock expiry or `payment.failed` (system) | slot becomes available again                                                              |
| `confirmed`           | `cancelled_refunded`        | patient cancels ≥2h before (patient)     | refund net-of-fee (policy #5); slot released; refund email                                |
| `confirmed`           | `cancelled_no_refund`       | patient cancels <2h before (patient)     | no refund; slot stays blocked                                                             |
| `confirmed`           | `doctor_cancelled`          | doctor cancels any time (doctor)         | refund net-of-fee; **apology email**; slot released                                       |
| `confirmed`           | `in_progress`               | slot-start arrives (system)              | activate video room/tokens                                                                |
| `in_progress`         | `completed`                 | both joined + call ends (system)         | finalize at slot-end+5m; transient drops don't finalize (edge #22)                        |
| `in_progress`         | `patient_no_show`           | patient absent at slot+15m (system)      | **no refund**                                                                             |
| `in_progress`         | `doctor_no_show`            | doctor absent at slot+15m (system)       | refund net-of-fee; apology email                                                          |
| `in_progress`         | _(non-penalizing terminal)_ | missing participant data (system)        | resolve + admin alert; never leave `in_progress` past slot-end+5m                         |
| `completed`           | `prescription_issued`       | doctor submits prescription (doctor)     | immutable write (#4); "prescription ready" email                                          |
| `prescription_issued` | `prescription_issued`       | additional prescription (doctor)         | new linked row, chronological (#4) — state unchanged                                      |

**Derived (not a stored state):** `awaiting_prescription` — a `completed` appointment with no prescription after 12h raises an A3 alert (doc 15).

**Orthogonal flag:** `disputed` may be set OR cleared on an appointment in **any** state (the `setDisputed` service has no state check) via `POST /api/appointments/:id/dispute` (`{ disputed: boolean }`); it is never a state-machine transition; audits `appointment.disputed` / `appointment.dispute_cleared`.

---

## 6. Coverage checklists

### 6.1 Every PRD requirement ID is routed

| ID                            | Covered by                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------- |
| P1 browse                     | `GET /api/doctors`, `GET /api/doctors/:id`                                   |
| P2 signup/login/reset/consent | `auth/*` (signup, login, forgot/reset-password); ToS at signup               |
| P3 book slot                  | `slots`, `appointments/lock`, `appointments/:id/pay`                         |
| P4 reminders                  | notification worker (no route) — see doc 14                       |
| P5 join call                  | `appointments/:id/video-token`                                               |
| P6 cancel                     | `appointments/:id/cancel`                                                    |
| P7 view/download Rx           | `GET .../prescriptions` + client PDF                                         |
| P8 book for someone           | `appointments/lock` (`forSelf`+subject fields)                               |
| P9 list own appts             | `GET /api/appointments` (patient scope)                                      |
| D1 availability               | `PUT /api/availability`, `GET .../availability`                              |
| D2 today + history            | `GET /api/appointments` (doctor scope)                                       |
| D3 join call                  | `appointments/:id/video-token`                                               |
| D4 build Rx                   | `POST .../prescriptions`, `GET /api/medicines`                               |
| D5 cancel                     | `appointments/:id/cancel` (doctor → `doctor_cancelled`)                      |
| A1 onboard doctor             | `POST /api/doctors`                                                          |
| A2 medicines                  | `medicines/*`                                                                |
| A3 health/alerts              | `GET /api/admin/alerts`, `emails/:jobId/resend`                              |
| A4 edit/deactivate            | `PATCH /api/doctors/:id`, `deactivate`/`reactivate`                          |
| A5 records & audit            | `GET /api/admin/records`, `GET /api/admin/records/:id`, `GET /api/admin/audit`, `appointments/:id/dispute` |
| A6 settings                   | `GET`/`PUT /api/admin/settings`                                              |
| DA1 doctor create+pw          | `POST /api/doctors`                                                          |
| DA2 shared login+route        | `POST /api/auth/login`, `GET /api/auth/me`                                   |
| DA3 forced first change       | `change-password` gated by `mustChangePassword` middleware                   |
| DA4 admin bootstrap           | one-off script (no route) — runbook                                          |
| DA5 doctor pw recovery        | `POST /api/doctors/:id/reset-password`                                       |
| DA6 role authz                | `requireRole` middleware on every authenticated route                        |

### 6.2 Every §3.3 invariant has a mechanism

| #   | Invariant               | Mechanism                                                                      |
| --- | ----------------------- | ------------------------------------------------------------------------------ |
| 1   | no double-booking       | partial unique index `uniq_active_slot` (raw-SQL migration) → 409 `SLOT_TAKEN` |
| 2   | atomic book+pay         | single Prisma `$transaction` in the `payfast` webhook path                     |
| 3   | durable doctor identity | no denormalized name on appointment; `Prescription.doctorSnapshot`             |
| 4   | Rx immutable            | no `PUT`/`DELETE` route or service method; corrections = new rows              |
| 5   | price snapshot          | `PrescriptionItem.price` captured at submit                                    |
| 6   | fee snapshot            | `Appointment.feeAtBooking` set on `→confirmed`                                 |
| 7   | intent idempotency      | `Payment @@unique([patientUserId, slotStart])`                                 |
| 8   | PMC/email immutable     | `PATCH /api/doctors/:id` rejects both → `IMMUTABLE_FIELD`                      |
| 9   | deactivation preserves  | `isActive` flag gates listing/booking only; login + scoped routes intact       |
| 10  | refund idempotency      | `Payment.refundIdempotencyKey @unique`                                         |

---

## Revision footer

| Date       | Change           | Why                                |
| ---------- | ---------------- | ---------------------------------- |
| 2026-06-01 | Initial creation | Faithful re-presentation of API.md |
| 2026-06-03 | Added `MUST_CHANGE_PASSWORD` (§1, §3.2 status map) | Slice A DA3 gate response code |
| 2026-06-03 | Added `BLOCK_HAS_BOOKINGS` to §3.2 `409` examples | Slice B availability block-lock guard (F09/edge #14) |
| 2026-06-04 | Added `409` codes `ACTIVE_LOCK_EXISTS`/`OVERLAP`/`INVALID_TRANSITION` + `422` `SLOT_NOT_BOOKABLE`; noted dev-only `/dev/*` checkout routes | Slice C booking/payment (F03/F04) |
| 2026-06-05 | Added `VIDEO_WINDOW_CLOSED` to §3.2 `422` example codes | Slice D (F05 video & lifecycle) |
| 2026-06-09 | Completed the `POST /api/appointments/lock` Notes cell to list `ACTIVE_LOCK_EXISTS`/`OVERLAP`/`SLOT_NOT_BOOKABLE` (already in §3.2 status table) | Gap-analysis O2 — endpoint-note completeness |
| 2026-06-11 | Re-pointed the state-machine writer + refund-orchestration prose to the merged `modules/appointment/service.js` | Folder-structure restructure (ADR-26); behavior unchanged |
| 2026-06-11 | Repointed deprecated `CONFIG.md`/`INTEGRATIONS.md` refs to docs 15/14 | Deprecated-doc hygiene |
| 2026-06-11 | Added dev-only worker trigger routes (`POST /dev/worker/*`); added F04.03 reconciliation-reuses-webhook-confirm note | Slice E (F04.03 reconciliation + F07 workers); schema/feature cascade |
| 2026-06-12 | Aligned F08/F11 endpoint inventory to the built routes (prescription submit error codes incl. 409 `INVALID_STATE` + 400 `VALIDATION_FAILED`; medicine search `?search=`, admin `POST/PATCH /api/admin/medicines`, deactivate-only via `isActive`); added `?scope=history`/`hasPrescription` + detail `subjectAge`/`subjectRelation`/`patientName`; documented the state-guarded transition write (concurrent loser → 409); replaced the never-built `ALREADY_PRESCRIBED` 409 code with `INVALID_STATE` | Slice F (F08 prescriptions + F11 backend) |
| 2026-06-13 | Slice G admin as-built sweep: `GET /api/doctors?includeInactive` admin flat-list branch + `POST /api/doctors` pending-state + `reactivate` status→active; added `PUT /api/doctors/:id/availability` (admin) and `GET /api/admin/records/:id`; renamed email-resend route to `:jobId` (failed-only, 409 `INVALID_STATE`); corrected `GET /api/admin/alerts` to the real 5 kinds; documented records/audit/settings filters + shapes; added 409 `PMC_TAKEN`/`EMAIL_TAKEN`, 400 `INVALID_FILE`, 500 `system.unhandled_exception` audit bridge; medicines `?includeInactive`; `disputed` allowed in ANY state via `POST .../dispute`; §2 `/uploads/doctors/<id>.<ext>` static serve; §6.1 A3/A5 coverage rows | Slice G as-built sweep |

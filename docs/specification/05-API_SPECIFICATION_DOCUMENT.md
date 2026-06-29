# 05 — API Specification Document

| Field            | Value                         |
| ---------------- | ----------------------------- |
| Document ID      | 05-API_SPECIFICATION_DOCUMENT |
| Status           | Canonical                     |
| Version          | 1.19                         |
| Last updated     | 2026-06-28                    |
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

**Session established at login:** `POST /api/auth/login` accepts `{ email, password }` (a `role` field is also accepted for backward compatibility but is **non-authoritative and ignored** — the stored `User.role` decides routing, preserving enumeration-safety per F15.02), validates credentials, and — on success — sets the session cookie. The response includes `{ id, role, fullName, mustChangePassword }`.

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
| `409`  | State/uniqueness conflict                                    | `SLOT_TAKEN`, `IMMUTABLE_FIELD`, `INVALID_STATE`, `BLOCK_HAS_BOOKINGS`, `ACTIVE_LOCK_EXISTS`, `INVALID_TRANSITION`, `PMC_TAKEN`, `EMAIL_TAKEN` (P2002 on doctor create) |
| `422`  | Well-formed but semantically rejected                        | `BOOKING_TOO_SOON`, `SLOT_NOT_BOOKABLE`, `VIDEO_WINDOW_CLOSED` |
| `429`  | Rate-limited / locked out                                    | `RATE_LIMITED`, `ACCOUNT_LOCKED`                                      |
| `500`  | Unexpected; logged to error tracking                         | `INTERNAL` — a non-`AppError`/non-`ZodError` 500 also writes a fire-and-forget `system.unhandled_exception` audit row (F12.01 alert source; `targetRef` = route path, `reason` = message ≤ 500 chars) |

Additional rules:

- **Enumeration-safe auth (P2):** `forgot-password` and `login` return an identical shape for known/unknown accounts; never reveal which emails exist.

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
| `GET /api/auth/me`               | any            | Bootstrap SPA: `{ id, role, fullName, mustChangePassword }` | drives client role-guards (convenience only); **anonymous caller → `200` with `null` body** (not `401`), so public-page bootstrap emits no console error |
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
| `POST /api/appointments/lock`           | patient              | Create `pending` (locks the slot on click) + "who-for" (P3/P8) | snapshots `feeAtBooking` at lock (ADR-43); a concurrent 2nd lock fails via the partial unique index → 409 `SLOT_TAKEN` (#1); validation also returns 409 `ACTIVE_LOCK_EXISTS` (the patient already has an upcoming appointment — single-active cap, ADR-44) and 422 `SLOT_NOT_BOOKABLE` (past/lead-time). No 10-min auto-expiry — the slot frees only when a human cancels/rejects |
| `POST /api/appointments/:id/pay`        | patient              | Submit the offline bank-transfer reference (P3, ADR-43)     | body `{ reference }`; sets `paymentReference` + `paymentSubmittedAt`, stays `pending`, enqueues the admin alert + `payment_submitted_admin` email. **No gateway, no handoff URL** |
| `GET /api/appointments`                 | patient/doctor       | Role-scoped list (P9 own / D2 today+history)                | patient sees own; doctor sees assigned; never cross-tenant; `?scope=history` returns past/cancelled rows newest-first; list rows (both roles) include `hasPrescription`. Patient Upcoming = `pending` ∪ `confirmed` with `slotEnd ≥ now`; Past = `confirmed` with `slotEnd < now` ∪ `cancelled` (time-based, no `completed` state) |
| `GET /api/appointments/:id`             | patient/doctor/admin | Detail, ownership-checked                                   | 404 (not 403) when not visible; detail adds `subjectAge`, `subjectRelation`, `patientName`; for an owned **`pending`** appointment it also returns `paymentInstructions { amountDue, bankName, bankAccountName, bankAccountNumber, bankInstructions }` (amount + bank details from Settings, ADR-43) |
| `POST /api/appointments/:id/cancel`     | patient/doctor       | Cancel (P6/D5) → `→ cancelled` from `pending`/`confirmed`   | body `{ reason? }`; frees the slot; enqueues a `cancellation` email. **No refund** — money handled offline (ADR-43) |
| `GET /api/appointments/:id/video-token` | patient/doctor       | Time-bound Daily token (P5/D3)                              | **`confirmed`-only** (non-confirmed → 404); issued within slot-start−10m … slot-end+5m; Daily free tier (room + token, no join recording) |

---

### F04 — Manual payment & admin review (ADR-43, #6)

Payment is **offline bank transfer**, verified manually by the admin — there is no online gateway, no webhook, no `Payment` table, and no refund subsystem. The patient submits a bank reference via `POST /api/appointments/:id/pay` (F03 above), the admin reviews the `pending` queue, then accepts or rejects:

| Method · Path                                  | Role  | Purpose                                              | Notes                                                                                                  |
| ---------------------------------------------- | ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /api/admin/appointments/:id/accept`      | admin | Verify the payment → `pending → confirmed`           | enqueues the `booking_confirmation` email; fires the `booking_confirmed` analytics event (doc 14 §6). 409 `INVALID_TRANSITION` if not `pending` |
| `POST /api/admin/appointments/:id/reject`      | admin | Payment not received → `pending → cancelled`         | frees the slot; enqueues the `payment_not_received` email. 409 `INVALID_TRANSITION` if not `pending`    |

> The admin review **queue** is `GET /api/admin/records?state=pending` (F13 below) — there is no separate list endpoint. Bank-transfer details shown to the patient come from admin Settings (F14, `GET`/`PUT /api/admin/settings`).

> **No webhooks, no refunds, no reconciliation:** there is no `POST /api/webhooks/*` route, no `POST /api/payments/verify-return`, no `POST /api/appointments/:id/dispute`, and no refund/record-refund route. Cancelling forfeits; any money movement is handled offline by the admin (ADR-43).

> **Dev-only worker trigger (non-canonical):** When `NODE_ENV === 'development'`, the app mounts one on-demand route to run a worker pass directly (never mounted in production):
>
> | Method · Path                    | Returns        | Runs                       |
> | -------------------------------- | -------------- | -------------------------- |
> | `POST /dev/worker/notifications` | `{ ok: true }` | Notification dispatch pass |

---

### F08 — Prescriptions (D4, P7, #4/#5)

| Method · Path                              | Role                 | Purpose                                                 | Notes                                                                                |
| ------------------------------------------ | -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /api/appointments/:id/prescriptions` | doctor (owner)       | Submit immutable prescription + items (D4)              | 404-no-leak if not the owning doctor; appointment state must be **`confirmed`** else 409 `INVALID_STATE` (a doctor may prescribe any time after confirmation — no time gate, no `completed` state, ADR-43); each item is `medicineId` XOR `medicineName` with dosage/duration/instructions, unknown `medicineId` → 400 `VALIDATION_FAILED`; one `$transaction`: create + items (server-side name/price snapshot #3/#5; free-text price `null`) → `prescription_ready` outbox enqueue (`dedupeKey` = prescription id) → `201`. **Issuing does NOT change appointment state** — prescriptions are child records |
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
| `GET /api/admin/records`                 | admin | Unified records view + payment-review queue (A5) | full filter set: `page`/`pageSize` (≤ 100), `patient` (email-or-phone contains, case-insensitive), `doctorName` (contains), `appointmentId`, `paymentRef` (contains, case-insensitive, vs `paymentReference`), `state` (`AppointmentState` enum — `pending`\|`confirmed`\|`cancelled`; `?state=pending` is the admin review queue), `from`/`to` (`YYYY-MM-DD` as Karachi day boundaries: `from`→00:00 PKT gte, `to`→exclusive next-midnight PKT). Each `recordRow` carries `amountDue` (= `feeAtBooking`), `paymentReference`, `paymentSubmittedAt` (manual-payment, ADR-43). Response `{ data: [recordRow], page: { number, size, total } }` |
| `GET /api/admin/records/:id`             | admin | Appointment detail (F13.02)                | `{ appointment, history, prescriptions, notificationJobs }` — transition history + prescriptions + email jobs; 404 if not found |
| `GET /api/admin/alerts`                  | admin | Alert feed / system health (A3)            | audit-row kinds (cap 100): `payment.submitted` (a patient submitted a bank reference awaiting review, ADR-43), `email.send_failed_final`, `system.unhandled_exception`; plus the derived `awaiting_prescription` (cap 100, `confirmed` + no prescription + `slotEnd ≤ now−12h`); email alerts carry `failedJobs[]`; response `{ data: [...] }` newest-first |
| `POST /api/admin/emails/:jobId/resend`   | admin | Re-trigger a failed email (A3/A5)          | `:jobId` = `notification_jobs.id`; only `failed` jobs accepted (any other status / lost race → 409 `INVALID_STATE`); atomic reset `attempts=0, nextAttemptAt=null, lastError=null`; 404 unknown; audit `admin.email_resend` |
| `GET /api/admin/settings`                | admin | Read platform settings (A6)                | returns shaped `{ minBookingLeadMinutes, bankName, bankAccountName, bankAccountNumber, bankInstructions }`, or `null` if the singleton row is missing (unseeded DB) |
| `PUT /api/admin/settings`                | admin | Update lead-time + bank-transfer details (A6) | `minBookingLeadMinutes` (30–1440) + the four bank fields; returns the updated shaped object; audit `settings.updated` with before/after meta |

---

### Analytics (KPI #1/#3)

| Method · Path                | Role       | Purpose                  | Notes                                                          |
| ---------------------------- | ---------- | ------------------------ | -------------------------------------------------------------- |
| `POST /api/analytics/events` | public | Ingest a telemetry event | **Built (Slice H · S6).** Rate-limited 60/min/IP (limiter factory, keyed on `req.ip`). Body `{ type, networkType?, meta? }` validated against the **closed** doc 14 §6 catalog — unknown `type` → `400 VALIDATION_FAILED`. Success → `202 { ok: true }`. Best-effort writer (`analytics.record`) never throws into the request path; if a session exists, `userId` is folded into `meta`. Client caller: `lib/analytics/track.js` (ADR-34) POSTs `{ type, networkType, meta }` (`networkType` is a sibling of `meta`) fire-and-forget. See doc 14 §6 (analytics catalog) |

---

### F16 — Legal content

`/legal/terms` and `/legal/privacy` are static SPA routes (M4 content), not `/api` routes. Express serves `client/dist` and the SPA catch-all after all `/api` routes.

---

## 5. Appointment state-machine transition table

The **only** writer that performs transitions is the `transition()` function in `modules/appointment/service.js`. It validates `from → to` against the table below, writes the audit entry, then fires side-effects (email enqueue, slot release). Controllers call it; the state machine is the sole writer of `Appointment.state`. The manual-payment pivot (ADR-43) collapsed the prior 10-state machine to **three** states.

The write is **state-guarded**: the update is an `updateMany WHERE id = :id AND state = :from`, so a concurrent transition that already moved the row loses (matched-count 0 → 409 `INVALID_TRANSITION`) instead of silently double-applying.

`slot_available` = **no row** (absence). Booking inserts at `pending` (which also locks the slot and snapshots `feeAtBooking`).

| From        | → To        | Trigger (actor)                                              | Side-effects                                                                          |
| ----------- | ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| _(none)_    | `pending`   | patient picks slot + books (patient)                        | snapshot `feeAtBooking` (#6); partial unique index guards #1. `POST /:id/pay` later sets `paymentReference`/`paymentSubmittedAt` + enqueues `payment_submitted_admin` (no state change) |
| `pending`   | `confirmed` | admin accepts / verifies the bank reference (admin)         | enqueue `booking_confirmation`; fire `booking_confirmed` analytics                    |
| `pending`   | `cancelled` | admin rejects (admin), or patient/doctor/admin cancels      | frees slot; enqueue `payment_not_received` (admin reject) or `cancellation` (cancel)  |
| `confirmed` | `cancelled` | patient / doctor / admin cancels                            | frees slot; enqueue `cancellation`. **No refund** — money handled offline (ADR-43)    |

**Prescriptions do NOT transition state:** a doctor submits a prescription on a `confirmed` appointment (any time after confirm) — it is a child-record write (`prescription_ready` email), the appointment stays `confirmed` (#4). There is no `completed`/`prescription_issued` state.

**Derived (not a stored state):** `awaiting_prescription` — a `confirmed` appointment with no prescription `≥12h` after `slotEnd` raises an A3 alert.

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
| D5 cancel                     | `appointments/:id/cancel` (doctor → `cancelled`)                            |
| A1 onboard doctor             | `POST /api/doctors`                                                          |
| A2 medicines                  | `medicines/*`                                                                |
| A3 health/alerts              | `GET /api/admin/alerts`, `emails/:jobId/resend`                              |
| A4 edit/deactivate            | `PATCH /api/doctors/:id`, `deactivate`/`reactivate`                          |
| A5 records & audit            | `GET /api/admin/records`, `GET /api/admin/records/:id`, `GET /api/admin/audit`; payment review `POST /api/admin/appointments/:id/accept`/`reject` |
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
| 1   | no double-booking       | partial unique index `uniq_active_slot` (raw-SQL migration, over `pending`/`confirmed`) → 409 `SLOT_TAKEN` |
| 2   | atomic book+pay         | **Retired (ADR-43)** — payment is offline; booking atomically creates `pending`, admin accept → `confirmed` |
| 3   | durable doctor identity | no denormalized name on appointment; `Prescription.doctorSnapshot`             |
| 4   | Rx immutable            | no `PUT`/`DELETE` route or service method; corrections = new rows              |
| 5   | price snapshot          | `PrescriptionItem.price` captured at submit                                    |
| 6   | fee snapshot            | `Appointment.feeAtBooking` set at booking/lock (ADR-43)                        |
| 7   | intent idempotency      | **Retired (ADR-43)** — no `Payment` table / payment intent (offline payment)   |
| 8   | PMC/email immutable     | `PATCH /api/doctors/:id` rejects both → `IMMUTABLE_FIELD`                      |
| 9   | deactivation preserves  | `isActive` flag gates listing/booking only; login + scoped routes intact       |
| 10  | refund idempotency      | **Retired (ADR-43)** — no refunds (offline money movement)                      |

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
| 2026-06-13 | Slice H · S1: added `POST /api/payments/verify-return` (patient, dual-channel confirm) to F04 and `POST /api/admin/payments/:appointmentId/record-refund` (admin, manual refund → `payment.manual_refund_recorded`); registered the new alert kinds `payment.manual_review_required` + `payment.refund_manual_required` in the `GET /api/admin/alerts` row (now 7 kinds) | Slice H · S1 (PayFast Pakistan adapter; ADR-32) |
| 2026-06-13 | Slice G admin as-built sweep: `GET /api/doctors?includeInactive` admin flat-list branch + `POST /api/doctors` pending-state + `reactivate` status→active; added `PUT /api/doctors/:id/availability` (admin) and `GET /api/admin/records/:id`; renamed email-resend route to `:jobId` (failed-only, 409 `INVALID_STATE`); corrected `GET /api/admin/alerts` to the real 5 kinds; documented records/audit/settings filters + shapes; added 409 `PMC_TAKEN`/`EMAIL_TAKEN`, 400 `INVALID_FILE`, 500 `system.unhandled_exception` audit bridge; medicines `?includeInactive`; `disputed` allowed in ANY state via `POST .../dispute`; §2 `/uploads/doctors/<id>.<ext>` static serve; §6.1 A3/A5 coverage rows | Slice G as-built sweep |
| 2026-06-14 | `POST /api/webhooks/daily` row (F04) now documents HMAC raw-body signature verification → `401` + `video.webhook_rejected` audit on bad signature; verified joins record `doctorJoinedAt`/`patientJoinedAt` (doc 14 §3) | Slice H · S2 (Daily.co video adapter; ADR-33) |
| 2026-06-14 | Analytics-events row: noted that the **client caller** now exists (`lib/analytics/track.js`, ADR-34) POSTing `{ type, networkType, meta }` fire-and-forget; the route itself stays owned/defined by S6 (not yet built) | Slice H · S3 (video consultation UI; ADR-34) |
| 2026-06-14 | `POST /api/analytics/events` row → **Built (Slice H · S6)**: public, rate-limited 60/min/IP, body validated against the closed doc 14 §6 catalog (unknown `type` → `400 VALIDATION_FAILED`), success `202 { ok: true }`, best-effort writer | Slice H · S6 (launch foundation + hardening) |
| 2026-06-14 | `payment.failed` outcome corrected on the `POST /api/webhooks/payfast` row + the `slot_locked` state-machine row: marks the Payment `failed` + **releases the slot-lock (force-expire), no appointment delete** — was "row removed / released" (ADR-39) | Slice H · S7 (E2E QA + launch gate; ADR-39) |
| 2026-06-15 | Flow-audit fixes: `POST /api/auth/login` body `role` clarified as accepted-but-ignored/non-authoritative (ISSUE-12); `GET /api/auth/me` anonymous → `200 null` not `401` (ISSUE-13); `GET /api/appointments/:id` detail adds `lockExpiresAt` for the P-07 terminal-state fix (ISSUE-3) | Three-role flow-audit fix session |
| 2026-06-16 | GET /api/appointments active scope now also returns a live slot_locked hold (lockExpiresAt) | Pending-hold recovery feature (34f978d) |
| 2026-06-28 | Manual-payment pivot (ADR-43): `/:id/pay` repurposed to submit a bank reference; `/:id` returns `paymentInstructions` for a pending appt; added admin `accept`/`reject`; removed PayFast/Daily/Resend webhooks, `verify-return`, `dispute`, and `record-refund`; rewrote the state-machine table to 3 states (`pending`/`confirmed`/`cancelled`); prescription gate → `confirmed` (no state change on issue); admin records/alerts/settings re-shaped (bank fields, `state=pending` review queue, `payment.submitted` alert); retired invariants #2/#7/#10; pruned obsolete 409/422 codes and the dev `/dev/worker/*` set to `notifications` only | Manual-payment pivot — API as-built sync |
| 2026-06-30 | `/appointments/lock` validation now returns `ACTIVE_LOCK_EXISTS` (single-active-appointment cap) in place of `OVERLAP`; removed `OVERLAP` from and added `ACTIVE_LOCK_EXISTS` to the §3.2 `409` list (ADR-44) | Single-active-appointment limit |

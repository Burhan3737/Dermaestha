# 02 — Scope & Feature Document

| Field            | Value                                         |
| ---------------- | --------------------------------------------- |
| Document ID      | `02-SCOPE_FEATURE_DOCUMENT`                   |
| Status           | Canonical                                     |
| Version          | 1.10                                          |
| Last updated     | 2026-06-28                                    |
| Sources absorbed | `docs/product/PRD.md §2.2, §3.3–§3.6, §4, §6` |
| Related docs     | 01, 04, 05, 08, 12, 13                        |

---

## Index

1. [Feature ID map](#1-feature-id-map)
2. [Features](#2-features)
3. [Appointment state machine](#3-appointment-state-machine)
4. [Edge case catalogue](#4-edge-case-catalogue)
5. [Deferred — Medicine Ordering Module (NOT in v1 build)](#5-deferred--medicine-ordering-module-not-in-v1-build)

---

## Purpose

This is the numbered single-source-of-truth feature specification for Dermestha v1. It reorganises the PRD's user stories, data-integrity invariants, locked policies, state machine, and edge cases into a structured feature catalogue. Every requirement here is a faithful re-presentation of `docs/product/PRD.md` — no facts are invented, altered, or dropped — and every feature traces back to its source story or section.

---

## 1. Feature ID map

Each feature ID below maps to the PRD §2.2 user stories (and supporting §3.x sections) it absorbs.

| Feature ID | Feature name                                   | Source stories / sections |
| ---------- | ---------------------------------------------- | ------------------------- |
| `F01`      | Patient authentication & account               | P2, DA2                   |
| `F02`      | Doctor discovery (public listing & profile)    | P1                        |
| `F03`      | Slot booking & slot-lock                       | P3, P8, A6                |
| `F04`      | Payment                                        | P3, §3.4                  |
| `F05`      | Appointment lifecycle & video consultation     | P5, P9, D2, D3, §4.3      |
| `F06`      | Cancellation                                   | P6, D5                    |
| `F07`      | Reminders & notifications                      | P4, §3.4                  |
| `F08`      | Prescription                                   | P7, D4, §3.5              |
| `F09`      | Doctor weekly availability                     | D1                        |
| `F10`      | Admin: doctor onboarding, edit, (de)activation | A1, A4                    |
| `F11`      | Admin: medicine catalogue                      | A2                        |
| `F12`      | Admin: system-health alerts                    | A3                        |
| `F13`      | Admin: records & audit log (unified)           | A5                        |
| `F14`      | Admin: platform settings                       | A6                        |
| `F15`      | Doctor & admin authentication & roles          | DA1–DA6                   |
| `F16`      | Legal content (ToS / Privacy)                  | P2, §3.6                  |

---

## 2. Features

### **F01 - Patient authentication & account**

One-line: patient self sign-up, login, and password recovery with mandatory legal-consent capture; no email verification in v1.

- **F01.01 - Sign-up**
  - **Full name** (text, required, user input)
  - **Email** (text, required, user input)
  - **Phone** (text, required, user input)
  - **Password** (password, required, user input)
  - **ToS/Privacy acceptance** (checkbox, required, user input) — labelled "I agree to the Terms of Service and Privacy Policy", linking to `/legal/terms` and `/legal/privacy`.
  - **Consent Gate Rule**: sign-up cannot proceed without the acceptance checkbox; acceptance is recorded on the user record with a timestamp (`tos_accepted_at`). Policy versioning and re-prompt logic are deferred to v1.1 — v1 records a single acceptance at sign-up.
  - **Email Uniqueness Rule**: email uniqueness is enforced; duplicate registration returns a clear error.
- **F01.02 - Login**
  - **Email** (text, required, user input)
  - **Password** (password, required, user input)
  - **Session Rule**: login uses email + password; session persists across visits via a secure HTTP-only cookie (Secure, at minimum SameSite=Lax; §3.6).
  - Shared `/login` route routes by role (see F15.02).
- **F01.03 - Forgot password**
  - **Email** (text, required, user input)
  - **Enumeration-Safe Reset Rule**: the forgot-password flow sends a reset link via the transactional email provider; the link expires in 1 hour. The response is identical for known and unknown emails to prevent account enumeration.
- **F01.04 - Out of scope (v1)**: no email-verification flow in v1 (deferred — patients self-report email).

Abuse protection: login, forgot-password, and sign-up are rate-limited per source identity and per target account; repeated failed logins trigger a temporary backoff/lockout (audit-logged, §3.6). Uses the shared `Button`, `Card`, and form `Input` components (cross-reference doc 06).

### **F02 - Doctor discovery (public listing & profile)**

One-line: public, no-auth listing of active dermatologists with the data a patient needs to choose one.

- **F02.01 - Doctor listing page**
  - **No-Auth Rule**: no authentication is required to browse.
  - **Performance Rule**: the listing page loads in ≤2 seconds on 3G.
  - **Active-Only Rule**: doctors marked inactive by admin do not appear in the listing.
  - Card columns per doctor: **photo**, **name**, **specialization** (e.g., "Acne & Pigmentation"), **consultation fee in PKR**, **next-available slot**.
- **F02.02 - Doctor profile / booking entry**: selecting a card leads into slot booking (F03). Uses the shared `Card` and `Button` components (doc 06).

### **F03 - Slot booking & slot-lock**

One-line: patient picks a future 30-minute slot within a doctor's availability, optionally books for someone else, and locks it for payment.

- **F03.01 - Slot picker**
  - **Future-Slots-Only Rule**: the picker shows only future slots within the doctor's set weekly availability.
  - **Lead-Time Rule (A6)**: the minimum booking lead time is a platform-configurable value (admin-set; default 1 hour, supported down to 30 minutes per §4.1 #3). Slots whose start is within the configured lead time are not bookable. (The live-queue / on-demand flow that removes lead time entirely is v1.1.)
  - **Disabled-Slot Rule**: slots that are booked or in-flight (locked during another patient's payment) are visually disabled.
- **F03.02 - "Who is this consultation for?" (P8)**
  - **Recipient** (radio, required, user input): `Myself` (default) | `Someone else`.
  - If `Someone else`: the form expands to capture **patient name** (text, required), **age** (number, required), **relation** (text, required).
  - **Identity Snapshot Rule**: the actual-patient identity is stored on the appointment record and later auto-pulled by the doctor's prescription builder (F08) and the rendered PDF (§3.5) — the doctor never re-types it.
- **F03.03 - Slot-lock & payment handoff**
  - **Slot-Lock Rule**: on booking, the slot is immediately locked by creating a `pending` appointment (snapshotting `feeAtBooking`) and the patient is shown the bank-transfer payment instructions. There is **no 10-minute auto-expiry** (ADR-43): the `pending` appointment (and its slot lock) persists until a human acts — the patient/doctor cancels, or the admin rejects an unverified payment.
  - **Single-Active-Appointment Rule (ADR-44)**: a patient may hold at most one upcoming appointment at a time — any active state (`pending` or `confirmed`) whose `slotEnd` is still in the future. A second booking is refused (`ACTIVE_LOCK_EXISTS`, 409) and the patient is pointed to their existing appointment to pay or cancel it; once it is in the past (or cancelled) they may book again. This subsumes the former No-Overlap Rule.
  - **Recoverable-Hold Rule**: a `pending` appointment awaiting payment is recoverable rather than an invisible dead-end — it surfaces in the patient's appointments as a "Payment pending" card linking to the payment instructions, where the patient submits/updates their bank transaction reference, or cancels the hold. The Single-Active-Appointment Rule above still applies; the hold does not expire on a timer — it ends only when cancelled or rejected.
  - **Double-Booking Rule (#1)**: slot double-booking is impossible at the storage layer; a second attempt to book the same `(doctor, slot-time)` fails at write time (§3.3 #1).
  - On confirm, the patient is taken to the booking's payment-instructions view (F04) showing the bank-transfer details and amount due.
  - **KPI #1 telemetry (landing → booking conversion funnel)**: the client emits `landing_view` on the public landing (P-01) mount (`{ referrer? }`) and `booking_started` on a successful slot-lock (`{ doctorId }`), through the fire-and-forget client seam `lib/analytics/track.js` → `POST /api/analytics/events` (doc 14 §6; ADR-35). The emit is best-effort and no-ops until the analytics route ships (S6). The funnel's terminal `booking_confirmed` event is emitted server-side post-confirmation and remains S6.

Uses the shared `Button`, `Card`, confirmation `Modal`, and slot-grid components (doc 06).

### **F04 - Payment** (manual offline bank transfer + admin review — ADR-43)

One-line: the patient pays by offline bank transfer against displayed bank details, submits the bank reference in-app, and an admin reviews and accepts/rejects the booking (manual offline model — ADR-43 supersedes the hosted-aggregator design).

- **F04.01 - Payment instructions & bank-reference submission (P3, §3.4)**
  - **Manual-Payment Rule (#1 policy)**: the patient pays at booking by offline bank transfer; the slot is held as `pending` from slot-lock (F03.03) and is only ever confirmed after an admin accepts the payment.
  - **feeAtBooking Snapshot (#6)**: the consultation fee is snapshotted on the appointment at slot-lock (`feeAtBooking`); later changes to the doctor's `consultationFee` never affect the existing appointment's billed amount or revenue accounting (§3.3 #6).
  - **Payment-Instructions Rule**: `GET /api/appointments/:id` returns `paymentInstructions {amountDue, bankName, bankAccountName, bankAccountNumber, bankInstructions}` for an owned `pending` appointment. The bank details come from admin platform settings (F14).
  - **Reference-Submission Rule**: the patient submits the bank-transfer reference via `POST /api/appointments/:id/pay` with body `{reference}`. This records `paymentReference` + `paymentSubmittedAt`, leaves the appointment in `pending`, and enqueues the `payment_submitted_admin` email plus an admin alert for review.
- **F04.02 - Admin payment review**
  - **Admin-Review Rule**: the admin lists awaiting-review bookings via `GET /api/admin/records?state=pending` and either accepts (`POST /api/admin/appointments/:id/accept` → `confirmed`, sends `booking_confirmation`, fires the `booking_confirmed` analytics event) or rejects (`POST /api/admin/appointments/:id/reject` → `cancelled`, sends `payment_not_received`, frees the slot).
  - The platform never handles card numbers or wallet credentials — payment is settled entirely offline (§3.6).
- **F04.03 - RETIRED (ADR-43)**: the hosted-aggregator reconciliation safety net is removed together with the payment gateway. There is no signed webhook, no idempotent payment intent, no `Payment` table, and no reconciliation worker in the manual model. *(superseded — formerly the hourly reconciliation query and edge #6a auto-refund)*

### **F05 - Appointment lifecycle & video consultation**

One-line: the confirmed appointment progresses through the §4.3 state machine; patient and doctor join an appointment-scoped browser video room.

- **F05.01 - Patient upcoming view (P9)**
  - "Upcoming" section is time-based: it lists every `pending` appointment plus every `confirmed` appointment whose slot end is still in the future (`slotEnd ≥ now`), sorted by slot time ascending.
  - Row columns: **doctor name + photo**, **slot date/time** in `Asia/Karachi`, **"for: [actual patient]"** line if booked-for-someone-else (P8), **consultation fee**, a **"Join Call" button** (F05.03, on `confirmed` rows only), and a **"Cancel" link** (F06) on `pending` and `confirmed` rows. A `pending` row also surfaces the **"Complete payment"** action (F03.03 / F04.01).
  - Once the slot end has passed, a `confirmed` appointment moves out of "Upcoming" into the "Past appointments" view (F08.01).
  - **Empty-State Rule**: shows "No upcoming appointments — Browse doctors" linking to the public doctor listing (F02).
- **F05.02 - Doctor today view (D2)**
  - Doctor dashboard default view shows today's appointments sorted by slot time; past appointments are shown under an in-page "History" tab on the same D-02 page (route `/doctor/history`), beside the "Today" tab — mirroring the patient Upcoming/Past page (ADR-42).
  - Row columns: **slot time**, **patient name** (and **"for: [actual patient]"** if booked-for-someone-else), **reason/notes if any**, **"Join Call" button**.
- **F05.03 - Video consultation (P5, D3)**
  - **Join-Activation Rule**: the "Join Call" button activates 10 minutes before slot start (matching P5, D2, and P9). It opens the video room in the current browser tab — no app install.
  - Tested on Chrome (Android 10+) and Safari (iOS 14+) over 3G; doctor side tested on desktop Chrome/Firefox/Safari and Android Chrome.
  - Pre-call lighting prompt (patient): "Find a well-lit area; sit facing a window or lamp if possible".
  - If the patient joins before the doctor: waiting screen "Doctor will be with you shortly".
  - If the doctor joins before the patient: waiting screen "Waiting for the patient to join…".
  - **Room-Isolation Rule**: room identity is appointment-scoped — patient and doctor share the same room ID and cannot join the wrong room (§3.4); tokens are time-bound (slot-start − 10 min through slot-end + 5 min) and are issued only for `confirmed` appointments. Daily is used on the free tier as room + token only (no participant webhook).
  - **Hard-Cutoff Rule**: the session has a hard cutoff at slot-end + 5 minutes (room expires); a soft warning is shown to the doctor at 5 minutes remaining.
  - **KPI #3 telemetry (video-join success by network type)**: the client emits `video_join_attempt` on the "Join Call" click (patient upcoming P9 + doctor today D2) and `video_join_success` on the Daily `joined-meeting` event once media is up (patient video room P5, doctor video room D3), through the fire-and-forget client seam `lib/analytics/track.js` → `POST /api/analytics/events` (doc 14 §6; ADR-34). The emit is best-effort and no-ops until the analytics route ships (S6); `networkType` rides the envelope (sibling of `meta`) and backs the 3G-success KPI.
- **F05.04 - State machine ownership**: in the 3-state model every transition is actor-driven — admin accept/reject (F04.02) and patient/doctor cancel (F06). There is no appointment-evaluation worker and no automated no-show / completion transition (ADR-43); joining the video room does not change the appointment state. See §3.

### **F06 - Cancellation**

One-line: in-app-only cancellation from `pending` or `confirmed`; the slot is freed and a cancellation email is sent. No refunds in the manual offline-payment model (ADR-43).

- **F06.01 - Patient cancel (P6)**
  - **In-App-Only Rule**: the cancellation channel is in-app only (no phone or email cancellations); the Cancel button is visible on `pending` and `confirmed` bookings in the patient dashboard.
  - **Cancel Rule**: `POST /api/appointments/:id/cancel` moves the appointment to `cancelled` (from `pending` or `confirmed`), releases the slot, and sends a `cancellation` email. There is no time-window and no refund — payment is offline bank transfer settled out-of-band (ADR-43).
- **F06.02 - Doctor cancel (D5)**
  - **Reason** (text, required, internal — shown to admin only).
  - **No-Window Rule**: doctor cancellation has no time-window restriction.
  - On submit: appointment marked `cancelled`, the slot is released, and a `cancellation` email is sent to the patient. No refund.
- **F06.03 - RETIRED (ADR-43)**: refund mechanics (idempotency key, net-of-fee refund, fallback-fee source) are removed with the payment gateway. There are no in-app refunds and no `Payment` table in the manual model. *(superseded — formerly the refund idempotency and fee-source rules)*

Uses the shared confirmation `Modal`, `Button`, and `Card` components (doc 06).

### **F07 - Reminders & notifications**

One-line: email-only confirmation and reminder cadence in `Asia/Karachi`, with retry/backoff and reminder invalidation.

- **F07.01 - Triggers (§3.4 — seven types)**: `payment_submitted_admin` (admin alert on bank-reference submission), `booking_confirmation` (on admin accept), `payment_not_received` (on admin reject), 24-hour reminder, 1-hour reminder, `prescription_ready`, and `cancellation`. *(refund-confirmation and doctor-cancel apology emails are removed with the gateway — ADR-43)*
- **F07.02 - Reminder cadence (P4)**
  - Booking confirmation email sent immediately after the `confirmed` state.
  - Reminder email sent 24 hours before slot start.
  - Reminder email sent 1 hour before slot start.
  - **Timezone Rule**: all times in `Asia/Karachi`, formatted clearly in the email body.
  - **Short-Lead Skip Rule**: if confirmed <24h before slot start, the 24-hour reminder is skipped; if confirmed <1h before slot start, the 1-hour reminder is skipped (reachable because the minimum lead time is configurable down to 30 minutes — P3).
- **F07.03 - Reliability & invalidation**
  - **Retry Rule**: on send failure, the system retries 3× with exponential backoff; the admin is alerted on final failure.
  - **Reminder-Invalidation Rule**: when an appointment leaves `confirmed` (i.e. is cancelled), undispatched 24h/1h reminders must be suppressed; the notification worker re-checks appointment state immediately before dispatch and never delivers a reminder for an appointment no longer in `confirmed` at send time.
- **F07.04 - Out of scope (v1)**: no PDF attachments — the prescription-ready email contains a dashboard link, not an attachment. No SMS/WhatsApp in v1.

### **F08 - Prescription**

One-line: doctor builds an immutable, itemised prescription with a read-only patient-ID header; patient downloads a client-rendered PDF indefinitely.

- **F08.01 - Patient prescription view & download (P7)**
  - The patient dashboard "Past appointments" view is time-based — it holds `confirmed` appointments whose slot has ended plus all `cancelled` appointments — and labels each: a past `confirmed` appointment → "Completed" (with Download Prescription where a prescription exists); a `cancelled` appointment → "Cancelled". The underlying state is the source of truth.
  - A **"Download Prescription"** button is shown for any past `confirmed` appointment that has at least one linked prescription.
  - **Client-Render Rule**: clicking renders a PDF client-side from stored prescription JSON and triggers a browser download (§3.5). The rendering is isolated behind a single replaceable boundary for a future server-side move.
  - **Itemised-Total Rule**: each catalogue medicine shows its admin-configured price and the prescription shows a computed total. Free-text medicines not in the catalogue are shown as "not priced", excluded from the total, with an "N item(s) not priced" note.
  - **Chronological Corrections Rule (policy #9)**: if the doctor issues additional prescriptions for the same appointment, all are visible chronologically and each is downloadable separately.
  - **Indefinite-Retention Rule**: the prescription remains downloadable indefinitely (no expiry); v1 has no patient-initiated account-deletion flow (deferred to v1.1).
- **F08.02 - Doctor prescription builder (D4)**
  - **Confirmed-Gate Rule**: the builder is accessible from the appointment row once the appointment is `confirmed` (any time after confirmation); issuing a prescription does not change the appointment state — it stays `confirmed` (ADR-43).
  - **Read-Only Patient-ID Header (P8)**: above the medicine list, a read-only header shows the actual patient identity (account holder name if "Myself"; otherwise the captured name + age + relation). The doctor confirms identity by reading the header and does not type the patient name — it is auto-pulled from the appointment record (§3.5).
  - Form fields:
    - **Add medicine** (search/select from medicine catalogue, with free-text fallback for medicines not in the catalogue).
    - **Dosage** (text, required per medicine, user input).
    - **Duration** (text, required per medicine, user input).
    - **Instructions** (text, required per medicine, user input) — e.g., "1 tablet twice daily, after meals, for 7 days".
    - **General notes** (text, optional, user input).
    - **Follow-up date** (date, optional, user input).
  - **Running-Total Rule**: the builder shows a running total computed from each catalogue medicine's admin-set price (F11); free-text medicines carry no price, are flagged "not priced", and are excluded from the total.
  - **Immutability Rule (#4)**: submit creates an immutable prescription record linked to the appointment; no update or delete path is exposed to doctor, admin, or any internal API. To fix an error the doctor issues a new prescription (§3.3 #4, policy #9).
  - **Medicine Snapshot Rule (#5)**: medicine name, dosage, and price are snapshotted on the prescription at issue-time; later catalogue renames, price changes, or deactivations do not change an existing prescription or its total (§3.3 #5).
  - On submit: the patient sees the prescription within 60 seconds; a "Prescription ready" email is sent with a dashboard link (no PDF attached in v1).

Uses the shared `Button`, `Card`, search/select `Autocomplete`, and form `Input` components (doc 06).

### **F09 - Doctor weekly availability**

One-line: doctor sets a recurring weekly schedule that auto-generates 30-minute bookable slots.

- **F09.01 - Availability grid (D1)**
  - Weekly grid (Sun–Sat × hours); the doctor selects time blocks per day (e.g., Mon/Wed/Fri 6pm–9pm).
  - **Recurring Rule**: saved availability is recurring (applies every week until changed).
  - **Slot-Generation Rule**: slots are auto-generated in 30-minute increments within each block; back-to-back allowed, no inter-slot buffer in v1 (§4.2).
  - **Block-Lock Rule**: if the doctor tries to delete or modify a block containing confirmed future bookings, a warning is shown and each booking must be cancelled individually before the block can be removed.

Uses the shared grid and `Button` components (doc 06).

### **F10 - Admin: doctor onboarding, edit, (de)activation**

One-line: admin adds doctors with an initial password, edits most fields, and deactivates/reactivates while honouring existing appointments.

- **F10.01 - Add doctor (A1)**
  - **Full name** (text, required, admin input)
  - **PMC number** (text, required, admin input)
  - **Email** (text, required, admin input)
  - **Phone** (text, required, admin input)
  - **Profile photo** (file: JPEG/PNG/WebP ≤2MB, required, admin upload) — SVG and other formats rejected at upload.
  - **Bio** (text, required, admin input)
  - **Specialization** (text, required, admin input)
  - **Consultation fee** (number PKR, required, admin input)
  - **Weekly availability template** (schedule, optional, admin input)
  - **Initial password** (password, required, admin input) — set by admin and shared with the doctor out-of-band per DA1.
  - **Pending-State Rule**: a new doctor is created with two orthogonal fields — `Doctor.status` (`pending` → `active` on first activation) and `Doctor.isActive` (listing visibility only). The doctor starts in `pending` status until admin manually activates; once active the doctor appears in the public listing immediately. Deactivate/reactivate (F10.03) flips `isActive` without changing `status`.
  - **Initial-Credentials Rule (DA1)**: creation atomically sets the linked `User.mustChangePassword = true`, forcing the first-login password change (F15.03).
- **F10.02 - Edit doctor (A4)**
  - Editable fields: **full name**, **phone**, **profile photo** (same JPEG/PNG/WebP ≤2MB constraints), **bio**, **specialization**, **consultation fee**, **weekly availability template**.
  - **PMC/Email Immutability (#8)**: PMC number and email are immutable post-creation — neither can be updated through any API (§3.3 #8). Their presence in a PATCH body is rejected with `409 IMMUTABLE_FIELD` (not silently stripped).
  - **Availability Route Rule**: a doctor's weekly availability is set by the admin via the separate route `PUT /api/doctors/:id/availability`, which reuses the `BLOCK_HAS_BOOKINGS` guard from F09 — it is not bundled into the doctor PATCH body.
  - **feeAtBooking Snapshot (#6)**: consultation-fee changes never affect existing appointments; the edit page shows a one-line note confirming this (§3.3 #6).
  - **Rename Durability Rule (#3)**: renaming a doctor never alters historical appointments or prescriptions (§3.3 #3).
- **F10.03 - Deactivate / reactivate (A4, #9)**
  - **Deactivation-Preserves-Appointments Rule (#9)**: deactivate sets `active=false`, removes the doctor from the public listing immediately, and blocks all new bookings; existing `confirmed` future appointments are kept and honoured — not cancelled, no refunds, no cascade (§3.3 #9). Login and panel access are not revoked — a deactivated doctor can still view those appointments (F05.02), join calls (F05.03), and submit prescriptions (F08.02).
  - **Deactivation-Warning Rule**: the confirmation modal shows a warning with the count of upcoming `confirmed` appointments that will remain on the doctor's calendar.
  - The doctor's photo + bio remain visible in upcoming- and past-appointment views for patients with appointments or prescription history under that doctor.
  - If the doctor genuinely cannot serve (e.g., PMC license revoked), the admin cancels each appointment individually via the doctor-cancel flow (F06.02) — each moves to `cancelled` with a `cancellation` email and no refund (ADR-43).
  - Reactivate restores the doctor to the public listing using their saved availability template.

Uses the shared `Button`, `Card`, confirmation `Modal`, file-upload `Input`, and form `Input` components (doc 06).

### **F11 - Admin: medicine catalogue**

One-line: admin manages the priced medicine catalogue that powers the prescription builder (and the deferred ordering module).

- **F11.01 - Medicine list (A2)**: a searchable list on the admin "Medicines" page. `GET /api/medicines?includeInactive=true` is restricted to the admin role (a non-admin request carrying the flag → `403`); the A-02 view passes this flag to list deactivated medicines alongside active ones.
- **F11.02 - Add medicine**
  - **Name** (text, required, admin input)
  - **Generic name** (text, optional, admin input)
  - **Common dosage forms** (multi-select: tablet, cream, syrup, etc., required, admin input)
  - **Unit price in PKR** (number, required, admin input) — used to compute the prescription total (F08) and the order total (Medicine Ordering Module, §5/§6).
- **F11.03 - Edit / deactivate / reactivate**
  - **Propagation Rule**: edits (including renames and price changes) propagate to the doctor's prescription-builder view but do not affect existing prescriptions, which are immutable and store a snapshot of medicine name, dosage, and price at issue-time (§3.3 #5).
  - **Deactivate Rule**: deactivating a medicine removes it from the prescription-builder dropdown but does not affect existing prescriptions.
  - **Reactivate Rule**: reactivating sets `isActive=true` and the medicine reappears in the prescription-builder dropdown. The A-02 admin catalogue view lists deactivated medicines too (so an admin can reactivate them).

Uses the shared `Button`, `Card`, and form `Input` components (doc 06).

### **F12 - Admin: system-health alerts**

One-line: an admin alert feed surfaces payment-review, email, prescription-SLA, and exception items with manual email re-trigger only.

- **F12.01 - Alert feed (A3)**: shows alerts for —
  - Bank-transfer reference submitted by a patient — a `pending` booking awaiting admin accept/reject (F04.01).
  - Transactional-email send failures (after retry exhaustion).
  - Appointments in `confirmed` state with no linked prescription whose `slotEnd ≤ now − 12h` (slot-end is the reference point; see §3).
  - Unhandled application exceptions — written to the audit log directly by the Express error-handler bridge as `system.unhandled_exception` (route path + message only; NO stack trace, NO PII). No external error-tracking SDK feeds this alert.
  - Each alert links to the relevant appointment record.
  - *(retired with the gateway — ADR-43: payment-webhook reconciliation mismatches, refund-API failures, and the PayFast `payment.manual_review_required` / `payment.refund_manual_required` sources.)*
- **F12.02 - Remediation**
  - **Email-Only Re-Trigger Rule**: the admin can manually re-trigger emails only — and only a `failed` job may be re-triggered (its status is set atomically back to `pending`). A non-failed or already-queued job returns `409 INVALID_STATE`. Each successful re-trigger writes an `admin.email_resend` audit entry.
  - *(retired — ADR-43: the No-Manual-Refund remediation rule is removed; there are no in-app refunds in the manual model.)*

Uses the shared alert `Card` / feed and `Button` components (doc 06).

### **F13 - Admin: records & audit log (unified)**

One-line: a single read-only admin page to look up appointments, payments, and the full audit trail, with detail view, dispute flagging, and email re-trigger.

- **F13.01 - Unified Records & Audit Log page (A5)**
  - **Single-Surface Rule**: this page replaces the separate appointment/payment-search and audit-log views; overlapping information lives in one place with a superset of filters.
  - Filters: patient email or phone, doctor name, appointment ID, payment reference number, user (patient or doctor) ID or email, event type, actor type (`patient` | `doctor` | `admin` | `system`), appointment `state` (the `AppointmentState` enum), and a date range whose `from`/`to` are interpreted as `Asia/Karachi` day boundaries. Results are paginated, newest-first.
  - **Intentional UI gap**: the server supports the audit-tab filters (`eventType` / `actorType` / `userId` / `email`) and this records `state` filter, but the corresponding admin-UI filter controls are deferred to a later slice — A-03/A-04 currently expose pagination only for the audit tab.
  - Record row columns: **appointment ID**, **slot date/time**, **patient name** (and **"for: [actual patient]"** if applicable), **doctor name**, **current state**, **amount**, **payment reference** (the patient's submitted bank-transfer reference). *(refund reference removed with the gateway — ADR-43)*
  - Audit entry columns: **timestamp** in `Asia/Karachi`, **event type**, **actor type**, **actor identity**, **target record reference**, **optional reason**. Event coverage matches §3.6 (appointment state transitions, auth events, payment-submission and admin accept/reject events).
- **F13.02 - Detail view**
  - Clicking a row opens an appointment detail view showing the full state-transition history (from the §3.6 audit log), any linked prescriptions, and the linked **email jobs** (`notification_jobs` for that appointment, each with its status + attempt count).
  - Action buttons: **Re-trigger email** (emails only, per F12) and **Set / clear `disputed` flag** (per §4.4 #10 / §3.6) — the flag is both set AND cleared as explicit admin actions, each audited (`appointment.disputed` / `appointment.dispute_cleared`).
- **F13.03 - Read-only & access**
  - **Read-Only Rule**: the view is read-only with respect to records (append-only convention, §3.6); no update or delete UI is exposed. The mutations it does allow (email re-trigger, mark disputed) are themselves recorded as admin-actor audit entries.
  - **Admin-Only Route Rule**: the route is reachable only by the admin role per DA6; no patient or doctor surface exposes this view.

Uses the shared table/list, filter bar, `Card`, `Button`, and confirmation `Modal` components (doc 06).

### **F14 - Admin: platform settings**

One-line: admin tunes booking parameters and the bank-transfer payment details without a code change; every change is audit-logged.

- **F14.01 - Minimum booking lead time (A6)**
  - **Minimum booking lead time** (duration, required, admin input) — default 1 hour, allowed range 30–1440 minutes (floor 30 min per §4.1 #3 and the glossary entry "Minimum booking lead time"; ceiling 1440 min / 24h).
  - **Future-Only Rule**: changes apply to future booking attempts only; existing `confirmed` appointments are unaffected.
- **F14.02 - Bank-transfer payment details (ADR-43)**
  - **Bank name** (text, required, admin input)
  - **Bank account name** (text, required, admin input)
  - **Bank account number** (text, required, admin input)
  - **Bank instructions** (text, optional, admin input)
  - **Payment-Instructions Source Rule**: these four fields populate the `paymentInstructions {bankName, bankAccountName, bankAccountNumber, bankInstructions}` returned to a patient on a `pending` appointment (F04.01). Changing them affects only future payment instructions. *(retired — ADR-43: the fallback transaction-fee model (`fallbackFee*`) is removed with the gateway.)*
- **F14.03 - Audit**: each settings change is recorded in the audit log as an admin-actor `settings.updated` entry (§3.6), whose metadata includes `before` and `after` snapshots of the tunables (minimum lead time and the bank-transfer details).

Uses the shared form `Input`, `Button`, and `Card` components (doc 06).

### **F15 - Doctor & admin authentication & roles**

One-line: minimal shared-login auth for doctors and admin with admin-set initial passwords, forced first-login change, admin bootstrap, manual reset, and single role middleware.

- **F15.01 - Doctor account creation by admin (DA1)**: when admin creates a doctor (F10.01), the admin sets an initial password in the same form and shares it out-of-band (WhatsApp, phone, in person). v1 has no email-token "set your password" flow for doctors.
- **F15.02 - Shared login surface & role routing (DA2)**: patients, doctors, and the admin all log in at the same `/login` route. The user record carries a `role` field (`patient` | `doctor` | `admin`); on success the system routes `patient` → patient dashboard, `doctor` → doctor panel, `admin` → admin panel.
- **F15.03 - Forced first-login change (DA3)**: on a doctor's first successful login, the doctor must change the password before reaching the doctor panel; tracked via `mustChangePassword: true`, cleared on successful change.
- **F15.04 - Admin bootstrap (DA4)**: a single admin account is created via a one-off bootstrap script run against production on first deploy (path/usage in the deploy runbook). No additional admins in v1 — no admin self-signup and no "admin creates admin" UI.
- **F15.05 - Doctor password recovery, manual (DA5)**: no self-service reset for doctors in v1. A doctor who forgets the password contacts the admin out-of-band; the admin resets it from the doctor edit page (F10.02) and shares the new one out-of-band. After reset, `mustChangePassword` is set to true.
- **F15.06 - Role-based authorization (DA6)**
  - **Single-Middleware Rule**: every authenticated server route checks the session's `role` and rejects requests outside the allowed roles. The §3.6 authorization rules (patient PII access, doctor schedule access, admin-only routes) are enforced through this single mechanism, not duplicated in route bodies; frontend role-routing is convenience only and the server is the enforcement boundary.

### **F16 - Legal content (ToS / Privacy)**

One-line: hosted Terms of Service and Privacy Policy pages linked from sign-up; acceptance captured at sign-up.

- **F16.01 - Legal pages**: `/legal/terms` and `/legal/privacy` are public/unauthenticated pages linked from the sign-up consent checkbox (F01.01) and the landing footer (P-01). Built as a **structured DRAFT** (Slice H · S4): both render through one reusable `LegalPage` template (brand topnav, title, "last updated", a persistent **DRAFT banner**, and structured sections; ADR-35) with explicit placeholder copy. **Final lawyer-reviewed copy is a pre-launch gate** — it replaces the DRAFT content behind the same template before launch.
- **F16.02 - Consent record (§3.6)**: a mandatory acceptance is recorded at sign-up with a timestamp. Versioning and re-prompt-on-update are deferred to v1.1.

---

## 3. Appointment state machine

The §4.3 appointment state machine, reproduced faithfully.

```text
slot_available
    │ (patient picks + clicks Confirm & Pay → POST /api/appointments/lock)
    ▼
pending  (slot reserved; feeAtBooking snapshotted at lock; patient submits bank-transfer reference via POST /:id/pay)
    │
    ├─ admin accepts payment ────────► confirmed   (booking_confirmation email; booking_confirmed analytics)
    │
    ├─ admin rejects payment ────────► cancelled   (payment_not_received email; slot released)
    │
    └─ patient / doctor cancels ─────► cancelled   (cancellation email; slot released)


confirmed
    │
    ├─ patient / doctor cancels ─────► cancelled   (cancellation email; slot released)
    │
    │ (slot time arrives — patient + doctor join the appointment-scoped video room; NO state change)
    │
    └─ doctor issues prescription(s) ─► linked to the appointment, chronological (state stays confirmed)
```

The model is exactly three states: `pending` → `confirmed`, plus `cancelled` (reachable from `pending` or `confirmed`). There is no `in_progress`, `completed`, `prescription_issued`, `*_no_show`, `cancelled_refunded`, `cancelled_no_refund`, or `doctor_cancelled` state (ADR-43).

**Transition triggers & owning components.** Every transition is actor-driven — there is no appointment-evaluation worker:

- `pending → confirmed`: admin accepts the submitted payment (`POST /api/admin/appointments/:id/accept`); sends `booking_confirmation` and fires the `booking_confirmed` analytics event (F04.02).
- `pending → cancelled`: admin rejects the payment (`POST /api/admin/appointments/:id/reject`, sends `payment_not_received`) **or** the patient/doctor cancels (F06); the slot is released.
- `confirmed → cancelled`: patient or doctor cancels (`POST /api/appointments/:id/cancel`, F06); the slot is released and a `cancellation` email is sent. No refund.
- Joining the video room at slot time does **not** change the appointment state, and issuing a prescription does **not** change it either — the appointment stays `confirmed` (F08).

**Refunds.** None. The manual offline-payment model issues no refunds (ADR-43); a cancelled booking simply frees the slot, and any money already transferred is settled out-of-band.

**`disputed` flag (orthogonal).** A `disputed` boolean flag (set via F13/A5) is orthogonal to this state machine — it can attach to any terminal state and does not alter transitions (see the Disputed-marker bullet in §3.6).

**`awaiting_prescription` (derived condition, not a state).** `awaiting_prescription` is **not** a distinct appointment state — it is a derived condition: a `confirmed` appointment with no linked prescription whose `slotEnd ≤ now − 12h` (the 12-hour clock runs from slot-end). It drives the F12/A3 alert and dashboard reminder but does not appear as a state transition in the audit log; the appointment remains `confirmed` whether or not a prescription is ever submitted.

**Slice G audit event types.** The admin panel (F10–F14) introduces twelve new audit event types recorded through the append-only audit log (§3.6): `doctor.created`, `doctor.updated`, `doctor.deactivated`, `doctor.reactivated`, `doctor.password_reset`, `doctor.availability_updated`, `doctor.photo_updated`, `appointment.disputed`, `appointment.dispute_cleared`, `admin.email_resend`, `settings.updated`, and `system.unhandled_exception`.

---

## 4. Edge case catalogue

All 40 edge cases from §4.4, grouped by the PRD's 7 categories, each keeping its number, case, tag, and v1 handling. Tags: **(A)** Architecturally handled, **(P)** Policy-handled, **(K)** Known gap, manual handling in v1.

### Booking flow (before payment)

| #   | Edge case                                                  | Tag | v1 handling                                                                                                |
| --- | ---------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Two patients click "book" on the same slot simultaneously  | A   | Storage-layer uniqueness on slot identity (§3.3 #1). Second click fails fast with "slot just taken" error. |
| 2   | Patient starts booking, abandons mid-flow                  | P   | The `pending` appointment holds the slot (no timed expiry, ADR-43); the admin rejects the unpaid hold (or the patient cancels) to free the slot.        |
| 3   | Patient on slow 3G — submits the bank reference late       | P   | No payment timer to race: the `pending` hold persists until the admin accepts the verified payment or rejects it.                                       |
| 4   | Doctor adds a new slot while patient is browsing           | A   | Frontend refreshes on focus; stale-data shows brief "slot no longer available" error. Acceptable friction. |

### Payment flow

| #   | Edge case                                                                                                                               | Tag | v1 handling                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | Patient double-clicks "Pay" — two payment attempts                                                                                      | A   | `POST /:id/pay` overwrites `paymentReference`/`paymentSubmittedAt` on the same `pending` appointment; the admin reviews it once (F04, ADR-43).                                                                                                                                                                                                                                                                   |
| 6   | Payment succeeds but webhook never reaches server                                                                                       | A   | RETIRED (ADR-43): no webhook or reconciliation in the manual model. A booking with no submitted reference stays `pending` until an admin accepts or rejects it (F04.02).                                                                                                                                                                                                                                       |
| 6a  | Payment succeeds (late webhook or reconciliation) but the slot's lock had expired and the slot was already confirmed to another patient | A   | RETIRED (ADR-43): the gateway late-webhook / reconciliation race and its auto-refund no longer exist — there is no webhook, no reconciliation, and no refunds in the manual offline-payment model. |
| 7   | Payment fails — patient retries inside lock window                                                                                      | A   | The patient can resubmit the bank reference via `POST /:id/pay` (overwrites the prior value) while the booking is `pending`; the admin reviews the latest reference (ADR-43).                                                                                                                                                                                                                                                                                           |
| 8   | Patient closes browser during payment redirect                                                                                          | A   | The `pending` booking and its `paymentInstructions` remain on `GET /:id`; the patient returns via the "Payment pending / Complete payment" card (F03.03/F04.01).                                                                                                                                                                                                                                               |
| 9   | Patient pays twice (e.g., refreshes success page)                                                                                       | A   | RETIRED (ADR-43): no in-app payment capture; a duplicate bank transfer is an out-of-band banking matter resolved manually.                                                                                                                                                                                                                                                                                                                           |
| 10  | Chargeback weeks later                                                                                                                  | K   | Admin tool marks appointment as `disputed` via A5 detail view. No automated handling in v1.                                                                                                                                                                                                                                                                                       |

### Pre-consultation (after confirmed, before call)

| #   | Edge case                                                  | Tag | v1 handling                                                                                                                                              |
| --- | ---------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | Patient cancels inside cancel window                       | P   | Appointment → `cancelled`; slot released; `cancellation` email. No 2-hour window and no refund in the manual model (ADR-43).                                                                               |
| 12  | Patient cancels outside cancel window                      | P   | RETIRED (ADR-43): the free-cancel window and the `cancelled_no_refund` distinction are gone; every cancellation resolves to `cancelled` with the slot released and no refund (see #11). |
| 13  | Doctor cancels a confirmed appointment                     | P   | Appointment → `cancelled`; slot released; `cancellation` email to the patient. No refund or apology email (ADR-43).                                                             |
| 14  | Doctor wants to change availability with existing bookings | A   | UI prevents deleting a window containing confirmed bookings; doctor must cancel each booking first.                                                      |
| 15  | Reminder email fails to send                               | A   | Provider retries with exponential backoff (3×); admin alerted on final failure.                                                                          |
| 16  | Patient wants to reschedule                                | P   | Cancel + rebook (policy #6).                                                                                                                             |

### During consultation

| #   | Edge case                                           | Tag | v1 handling                                                                                                                      |
| --- | --------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------- |
| 17  | Patient joins early                                 | A   | "Doctor will be with you shortly" waiting screen until slot start.                                                               |
| 18  | Patient joins late (within grace)                   | A   | Can join any time until slot end; consultation length effectively shortened.                                                     |
| 19  | Doctor joins late (within grace)                    | A   | Patient sees a "doctor running late" message and can rejoin until the token window closes. No no-show automation or refund in v1 (ADR-43).                                             |
| 20  | Patient absent at slot+15                           | P   | No automated no-show detection (ADR-43); the appointment stays `confirmed` and is handled out-of-band. No refund.                                                                                 |
| 21  | Doctor absent at slot+15                            | P   | No automated no-show detection (ADR-43); the appointment stays `confirmed`. If the doctor cannot serve, the doctor/admin cancels it (F06 → `cancelled`). No refund.                                            |
| 22  | Call drops mid-consultation (network issue)         | A   | Video session persists for slot duration + 5 min; either party can rejoin the same room.                                         |
| 23  | Consultation runs over slot end                     | A   | Hard cutoff at slot-end + 5 min; soft warning to doctor at 5 min remaining.                                                      |
| 24  | Audio/video doesn't work for one party              | K   | Manual support fallback (admin uses the A5 records & audit-log view). No automated recovery in v1.                               |
| 25  | Patient and doctor join different rooms by accident | A   | Impossible — room identity is appointment-scoped and access-gated (§3.4).                                                        |
| 25a | Neither patient nor doctor joins by slot+15         | P   | No automated no-show resolution (ADR-43); the appointment stays `confirmed` and is handled out-of-band. No refund. |

### Post-consultation

| #   | Edge case                                          | Tag | v1 handling                                                                             |
| --- | -------------------------------------------------- | --- | --------------------------------------------------------------------------------------- |
| 26  | Doctor doesn't submit prescription within 12 hours | A   | Admin alert; appointment status `awaiting_prescription`; doctor reminded via dashboard. |
| 27  | Doctor wants to edit prescription after submit     | P   | Issues a new prescription; original immutable; patient sees both (policy #9).           |
| 28  | Patient claims consultation didn't happen          | K   | Manual support resolution; admin investigates via A5. No automated dispute flow in v1.  |
| 29  | Patient loses prescription PDF                     | A   | Always re-downloadable from dashboard; PDF rendered on demand from stored data.         |

### Refunds

| #   | Edge case                                                  | Tag | v1 handling                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30  | Refund API call fails                                      | A   | RETIRED (ADR-43): no in-app refunds, refund API, retry worker, or reconciliation in the manual offline-payment model. |
| 31  | Refund takes 5–7 days to reflect                           | A   | RETIRED (ADR-43): no refunds, so no refund-status timeline.                                                                                                                                                                                 |
| 32  | Patient cancels + immediately rebooks inside cancel window | A   | No penalty; two independent operations (cancel frees the slot, rebook is the standard flow). No refund involved (ADR-43).                                                                                                                                                                                                       |

### System-level

| #   | Edge case                                            | Tag | v1 handling                                                                                      |
| --- | ---------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------ |
| 33  | Video provider outage during peak consultation hours | K   | Status banner shown; patients/doctors offered reschedule + apology. No automatic fallback in v1. |
| 34  | Payment aggregator outage                            | A   | RETIRED (ADR-43): no payment aggregator — payment is offline bank transfer, so there is no gateway outage that blocks bookings.                        |
| 35  | Email provider outage                                | A   | Reminders delayed; queue processed when service returns; admin alerted.                          |
| 36  | Timezone confusion                                   | A   | All UI in `Asia/Karachi`; storage in UTC. Pakistan doesn't observe DST.                          |

### Privacy / safety

| #   | Edge case                                                     | Tag | v1 handling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 37  | Booking for someone else (parent for child, child for parent) | P   | "Who is this consultation for?" field captures actual patient name (policy #10). Prescription auto-pulls the actual patient name onto the PDF (§3.5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 38  | Patient is a minor                                            | K   | Doctor uses clinical judgment; no platform enforcement in v1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 39  | Doctor's PMC license revoked / admin deactivates a doctor     | P   | Past appointments untouched. **Existing `confirmed` future appointments are kept and honored — not auto-cancelled** (client decision). Future bookings are blocked and the doctor is removed from the public listing; photo + bio remain visible in upcoming- and past-appointment views for patients with appointments or prescription history under that doctor. The deactivate modal warns the admin with the count of upcoming appointments first. If the doctor genuinely cannot serve, the admin cancels each appointment individually via the doctor-cancel flow (D5/F06) — the appointment moves to `cancelled` with a `cancellation` email and no refund (ADR-43). Triggered from A4. |
| 40  | Patient under another patient's account                       | A   | Account-level auth; no cross-account access.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 5. Deferred — Medicine Ordering Module (NOT in v1 build)

> **Scope banner (§6).** This module is documented here to lock the product decisions, but it is **not part of the v1 8-week / ~160-hour MVP**. It is a distinct module to be costed, timelined, and scheduled in a separate planning discussion. v1 ships only the prescription-side prerequisites: admin-set medicine prices (F11), the computed prescription total (F08), and the itemised, self-pay PDF (F08).

### 5.1 Summary (§6.1)

Patients can order the medicines on an issued prescription for home delivery, paying by **card** (via the existing payment aggregator) or **cash on delivery (COD)**. Dermestha calculates the order total from admin-configured medicine prices. **Fulfilment is operational:** Dermestha staff arrange delivery through a courier (Leopards, TCS, or equivalent) and update order status manually. No courier API integration is required in this module's first cut.

### 5.2 Features (§6.2)

#### **F-MO1 - Order medicines from a prescription (patient)**

One-line: a patient orders the priced medicines on an issued prescription for delivery, paying by card or COD.

- **F-MO1.01 - Order entry**
  - **Order-Availability Rule**: an "Order medicines" action appears on any `prescription_issued` prescription that has at least one priced (catalogue) medicine.
  - The order screen lists the prescription's catalogue medicines, each with an **editable quantity** (number, required, user input). This module's v1 does **not** parse free-text dosage/duration into a quantity; the quantity defaults to a safe value (1, or blank requiring entry) and is always patient-editable.
  - **Free-Text Exclusion Rule**: free-text (non-catalogue) medicines cannot be ordered in-app; they are shown with a "buy at a pharmacy" note.
  - The **unit price** (snapshotted per §6.4) and a computed **subtotal + delivery fee + total** update as quantities change.
- **F-MO1.02 - Delivery & payment**
  - **Delivery address** (text, required, user input) and **contact phone** (text, required, user input).
  - Payment options: **card** (aggregator hosted checkout, same as booking) or **COD**.
  - **Confirm-Before-Charge Rule**: admin confirms stock and final pricing before charge/dispatch (F-MO2); for COD this confirmation precedes dispatch, for card it precedes capture.
  - On card-payment success (verified webhook) or COD confirmation, the order is placed and an order-confirmation email is sent. The order is linked to the originating prescription and the patient account.

#### **F-MO2 - Manage and fulfil orders (admin)**

One-line: admin views, prices/confirms, dispatches, and reconciles medicine orders manually.

- **F-MO2.01 - Orders list**: the admin "Orders" page lists orders with columns: **order ID**, **patient**, **linked prescription**, **items**, **total**, **payment method** (card/COD), **payment status**, **order status**.
- **F-MO2.02 - Fulfilment**
  - Admin confirms stock/price, marks the order `dispatched` (records **courier name** + **tracking reference**, entered manually), then `delivered`.
  - **Pre-Dispatch Cancel Rule**: admin can cancel an order before dispatch; card orders are refunded via the existing refund path (idempotent, net-of-gateway-fee policy reused per §4.1 #5); COD orders simply close.
  - **COD Reconciliation Rule**: COD collection is reconciled manually by admin when the courier remits cash.

### 5.3 Order state machine (§6.3, proposed)

```text
placed
  ├─ card: awaiting_payment ─► paid ─► confirmed
  └─ cod: ───────────────────────────► confirmed

confirmed ─► dispatched (courier + tracking ref) ─► delivered

confirmed / paid ─► cancelled   (card → refund initiated; cod → closed)
```

### 5.4 Pricing & data notes (§6.4)

- Order line prices are snapshotted from the catalogue at order-placement time (same snapshot discipline as prescriptions, §3.3 #5) so later catalogue edits never change a placed order.
- Delivery fee is an admin-configured flat value in this module's v1 (per-zone pricing deferred).
- Orders, order items, and payment/refund references are audit-logged through the same append-only log (§3.6).

### 5.5 Integrations (§6.5)

- **Payment:** reuses the existing aggregator (hosted checkout, signed webhooks, refund API) — no new payment vendor.
- **COD:** offline; no integration; reconciled manually.
- **Courier:** operational/manual in the first cut (staff book Leopards/TCS and paste a tracking reference); a courier-API integration is a later enhancement.

---

## Revision footer

| Date       | Change           | Why                                                     |
| ---------- | ---------------- | ------------------------------------------------------- |
| 2026-06-01 | Initial creation | Faithful re-presentation of PRD.md §2.2/§3.3–§3.6/§4/§6 |
| 2026-06-13 | F10–F14 admin as-built: status/isActive split + mustChangePassword, 409 IMMUTABLE_FIELD, availability route, medicine reactivate + includeInactive (admin), exception→audit bridge, slot-end+12h predicate, email-resend status guard, F13 state/Karachi filters + email jobs + dispute set/clear, lead-time 30–1440, basis-points fees, settings.updated snapshots, 12 new audit event types | Slice G as-built sweep |
| 2026-06-13 | Added two PayFast-Pakistan alert sources to the F12.01 alert-feed enumeration: `payment.manual_review_required` (no gateway status-query API) + `payment.refund_manual_required` (no gateway refund API) | Slice H · S1 (PayFast Pakistan adapter; ADR-32) |
| 2026-06-14 | F05.03: noted the KPI #3 emit points — `video_join_attempt` on the Join Call click (P9 + D2) and `video_join_success` on Daily `joined-meeting` (P5/D3) via the fire-and-forget client `lib/analytics/track.js` seam (doc 14 §6; ADR-34) | Slice H · S3 (video consultation UI; ADR-34) |
| 2026-06-14 | F16.01: legal pages built as a banner-marked structured DRAFT via the reusable `LegalPage` template (final lawyer copy = pre-launch gate); F03.03: noted the KPI #1 emit points — `landing_view` on P-01 mount + `booking_started` on slot-lock via the shared `lib/analytics/track.js` seam (`booking_confirmed` remains S6/server) | Slice H · S4 (public surface — landing + legal; ADR-35) |
| 2026-06-16 | Noted that an abandoned slot-lock hold is recoverable from patient appointments (Payment-pending / Complete payment); Single-Lock Rule unchanged | Pending-hold recovery feature (34f978d) |
| 2026-06-21 | F05.03: added the doctor-first waiting copy ("Waiting for the patient to join…") alongside the existing patient-first copy | Role-aware video waiting-screen copy |
| 2026-06-22 | F05.02: doctor today/history is sidebar-only — past appointments are a separate History view at `/doctor/history` (no in-page tabs; ADR-41) | Doctor History sidebar-link desync bug fix |
| 2026-06-22 | F05.02: doctor past appointments are an in-page "History" tab on D-02 (mirrors patient Upcoming/Past; ADR-42, supersedes ADR-41) | Doctor appointments page redesign (in-page tabs) |
| 2026-06-28 | F04 → manual offline bank transfer + admin accept/reject (paymentInstructions, `/pay {reference}`, F04.03 reconciliation retired); F05 → 3-state model (no in_progress/completed/no-show), F05.04 evaluation worker removed, video-token confirmed-only on Daily free tier; F06 renamed Cancellation, all refund/window/`doctor_cancelled` rules retired; F07 trigger set re-listed (payment_submitted_admin/booking_confirmation/payment_not_received/cancellation + reminders; refund/apology removed); F08 prescription gate `completed`→`confirmed` (issuing does not change state); F12/F13 gateway/refund/PayFast sources retired; F14.02 fallback-fee → bank-transfer fields; §3 state machine + §4 edge handlings synced | Manual-payment pivot — as-built sync |
| 2026-06-30 | F03.03: replaced the Single-Lock + No-Overlap Rules with one Single-Active-Appointment Rule — at most one upcoming appointment (`pending`/`confirmed`) per patient (`ACTIVE_LOCK_EXISTS`, 409); Recoverable-Hold note adds patient self-cancel of a pending hold (ADR-44) | Single-active-appointment limit |

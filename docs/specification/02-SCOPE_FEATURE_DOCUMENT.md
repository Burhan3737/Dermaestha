# 02 — Scope & Feature Document

| Field | Value |
|---|---|
| Document ID | `02-SCOPE_FEATURE_DOCUMENT` |
| Status | Canonical |
| Version | 1.0 |
| Last updated | 2026-06-01 |
| Sources absorbed | `docs/product/PRD.md §2.2, §3.3–§3.6, §4, §6` |
| Related docs | 01, 04, 05, 08, 12, 13 |

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

| Feature ID | Feature name | Source stories / sections |
|---|---|---|
| `F01` | Patient authentication & account | P2, DA2 |
| `F02` | Doctor discovery (public listing & profile) | P1 |
| `F03` | Slot booking & slot-lock | P3, P8, A6 |
| `F04` | Payment | P3, §3.4 |
| `F05` | Appointment lifecycle & video consultation | P5, P9, D2, D3, §4.3 |
| `F06` | Cancellation & refund | P6, D5 |
| `F07` | Reminders & notifications | P4, §3.4 |
| `F08` | Prescription | P7, D4, §3.5 |
| `F09` | Doctor weekly availability | D1 |
| `F10` | Admin: doctor onboarding, edit, (de)activation | A1, A4 |
| `F11` | Admin: medicine catalogue | A2 |
| `F12` | Admin: system-health alerts | A3 |
| `F13` | Admin: records & audit log (unified) | A5 |
| `F14` | Admin: platform settings | A6 |
| `F15` | Doctor & admin authentication & roles | DA1–DA6 |
| `F16` | Legal content (ToS / Privacy) | P2, §3.6 |

---

## 2. Features

### __F01 - Patient authentication & account__

One-line: patient self sign-up, login, and password recovery with mandatory legal-consent capture; no email verification in v1.

* __F01.01 - Sign-up__
  * **Full name** (text, required, user input)
  * **Email** (text, required, user input)
  * **Phone** (text, required, user input)
  * **Password** (password, required, user input)
  * **ToS/Privacy acceptance** (checkbox, required, user input) — labelled "I agree to the Terms of Service and Privacy Policy", linking to `/legal/terms` and `/legal/privacy`.
  * __Consent Gate Rule__: sign-up cannot proceed without the acceptance checkbox; acceptance is recorded on the user record with a timestamp (`tos_accepted_at`). Policy versioning and re-prompt logic are deferred to v1.1 — v1 records a single acceptance at sign-up.
  * __Email Uniqueness Rule__: email uniqueness is enforced; duplicate registration returns a clear error.
* __F01.02 - Login__
  * **Email** (text, required, user input)
  * **Password** (password, required, user input)
  * __Session Rule__: login uses email + password; session persists across visits via a secure HTTP-only cookie (Secure, at minimum SameSite=Lax; §3.6).
  * Shared `/login` route routes by role (see F15.02).
* __F01.03 - Forgot password__
  * **Email** (text, required, user input)
  * __Enumeration-Safe Reset Rule__: the forgot-password flow sends a reset link via the transactional email provider; the link expires in 1 hour. The response is identical for known and unknown emails to prevent account enumeration.
* __F01.04 - Out of scope (v1)__: no email-verification flow in v1 (deferred — patients self-report email).

Abuse protection: login, forgot-password, and sign-up are rate-limited per source identity and per target account; repeated failed logins trigger a temporary backoff/lockout (audit-logged, §3.6). Uses the shared `Button`, `Card`, and form `Input` components (cross-reference doc 06).

### __F02 - Doctor discovery (public listing & profile)__

One-line: public, no-auth listing of active dermatologists with the data a patient needs to choose one.

* __F02.01 - Doctor listing page__
  * __No-Auth Rule__: no authentication is required to browse.
  * __Performance Rule__: the listing page loads in ≤2 seconds on 3G.
  * __Active-Only Rule__: doctors marked inactive by admin do not appear in the listing.
  * Card columns per doctor: **photo**, **name**, **specialization** (e.g., "Acne & Pigmentation"), **consultation fee in PKR**, **next-available slot**.
* __F02.02 - Doctor profile / booking entry__: selecting a card leads into slot booking (F03). Uses the shared `Card` and `Button` components (doc 06).

### __F03 - Slot booking & slot-lock__

One-line: patient picks a future 30-minute slot within a doctor's availability, optionally books for someone else, and locks it for payment.

* __F03.01 - Slot picker__
  * __Future-Slots-Only Rule__: the picker shows only future slots within the doctor's set weekly availability.
  * __Lead-Time Rule (A6)__: the minimum booking lead time is a platform-configurable value (admin-set; default 1 hour, supported down to 30 minutes per §4.1 #3). Slots whose start is within the configured lead time are not bookable. (The live-queue / on-demand flow that removes lead time entirely is v1.1.)
  * __Disabled-Slot Rule__: slots that are booked or in-flight (locked during another patient's payment) are visually disabled.
* __F03.02 - "Who is this consultation for?" (P8)__
  * **Recipient** (radio, required, user input): `Myself` (default) | `Someone else`.
  * If `Someone else`: the form expands to capture **patient name** (text, required), **age** (number, required), **relation** (text, required).
  * __Identity Snapshot Rule__: the actual-patient identity is stored on the appointment record and later auto-pulled by the doctor's prescription builder (F08) and the rendered PDF (§3.5) — the doctor never re-types it.
* __F03.03 - Slot-lock & checkout handoff__
  * __Slot-Lock Rule__: on "Confirm & Pay", the slot is locked for 10 minutes while the patient completes the payment flow (policy #2). On payment failure or 10-minute lock expiry, the slot is released and no booking record persists.
  * __Single-Lock Rule__: a patient cannot hold multiple slot locks simultaneously.
  * __No-Overlap Rule__: a patient cannot book overlapping slots with the same or different doctors.
  * __Double-Booking Rule (#1)__: slot double-booking is impossible at the storage layer; a second attempt to book the same `(doctor, slot-time)` fails at write time (§3.3 #1).
  * On confirm, the patient is redirected to the payment aggregator's hosted page (F04).

Uses the shared `Button`, `Card`, confirmation `Modal`, and slot-grid components (doc 06).

### __F04 - Payment__

One-line: hosted-checkout payment at booking via a Pakistan-compatible aggregator, confirmed by signed webhook with reconciliation safety net.

* __F04.01 - Hosted checkout (P3, §3.4)__
  * __Payment-at-Booking Rule (#1 policy)__: the patient pays at booking; on payment success the slot is confirmed and a confirmation email is sent.
  * Methods: **cards**, **JazzCash**, **Easypaisa**, **bank transfer** via the aggregator's hosted page. The platform never sees card numbers or wallet credentials (§3.6).
  * __feeAtBooking Snapshot (#6)__: the consultation fee is snapshotted on the appointment at confirmation; later changes to the doctor's `consultationFee` never affect the existing appointment's billed amount, refund amount, or revenue accounting (§3.3 #6).
* __F04.02 - Confirmation & idempotency__
  * __Webhook-Truth Rule__: on a signature-verified `payment.success` webhook, the slot is marked `confirmed`, the confirmation email is sent within 60 seconds, and the patient is redirected to the dashboard. The verified webhook is the source of truth regardless of browser state.
  * __Atomic-Commit Rule (#2)__: booking confirmation and the corresponding payment record commit atomically — either both persist or neither does (§3.3 #2).
  * __Idempotent-Intent Rule (#7)__: payment-intent creation is idempotent on `(patient, slot)` so double-submits/retries cannot produce two parallel intents (§3.3 #7); rate-limited per patient (§3.6).
  * __Webhook-Auth Rule__: any webhook with a missing, invalid, or expired signature is rejected and logged to the admin alert feed (§3.4, §3.6).
* __F04.03 - Reconciliation safety net__: an hourly worker queries the aggregator for unconfirmed payments over the last 24h and completes the same atomic commit as the webhook path, alerting the admin on mismatch (§3.1, edge #6). If the slot was already confirmed to another patient, no second appointment is created and the paying patient is auto-refunded in full (edge #6a).

### __F05 - Appointment lifecycle & video consultation__

One-line: the confirmed appointment progresses through the §4.3 state machine; patient and doctor join an appointment-scoped browser video room.

* __F05.01 - Patient upcoming view (P9)__
  * "Upcoming" section lists all appointments in `confirmed` or `in_progress` state, sorted by slot time ascending.
  * Row columns: **doctor name + photo**, **slot date/time** in `Asia/Karachi`, **"for: [actual patient]"** line if booked-for-someone-else (P8), **consultation fee paid**, **"Join Call" button** (F05.03), and — **for `confirmed` appointments only** — a **"Cancel" link** (F06). Once `in_progress`, the Cancel link is not shown (no cancellation path from `in_progress`).
  * After slot completion the appointment moves out of "Upcoming" into the "Past appointments" view (F08.01).
  * __Empty-State Rule__: shows "No upcoming appointments — Browse doctors" linking to the public doctor listing (F02).
* __F05.02 - Doctor today view (D2)__
  * Doctor dashboard default view shows today's appointments sorted by slot time; past appointments live under a separate "History" tab.
  * Row columns: **slot time**, **patient name** (and **"for: [actual patient]"** if booked-for-someone-else), **reason/notes if any**, **"Join Call" button**.
* __F05.03 - Video consultation (P5, D3)__
  * __Join-Activation Rule__: the "Join Call" button activates 10 minutes before slot start (matching P5, D2, and P9). It opens the video room in the current browser tab — no app install.
  * Tested on Chrome (Android 10+) and Safari (iOS 14+) over 3G; doctor side tested on desktop Chrome/Firefox/Safari and Android Chrome.
  * Pre-call lighting prompt (patient): "Find a well-lit area; sit facing a window or lamp if possible".
  * If the patient joins before the doctor: waiting screen "Doctor will be with you shortly".
  * __Room-Isolation Rule__: room identity is appointment-scoped — patient and doctor share the same room ID and cannot join the wrong room (§3.4); tokens are time-bound (slot-start − 10 min through slot-end + 5 min).
  * __Hard-Cutoff Rule__: the session has a hard cutoff at slot-end + 5 minutes (room expires); a soft warning is shown to the doctor at 5 minutes remaining.
  * __No-Show Grace Rule (policy #7)__: if neither party has joined by slot-start + 15 minutes, the appointment is marked `patient_no_show` or `doctor_no_show` (whichever absent — see §3 state machine, with doctor-absence precedence).
* __F05.04 - State machine ownership__: non-payment transitions are driven by the appointment-evaluation worker (`system` actor). See §3.

### __F06 - Cancellation & refund__

One-line: in-app-only cancellation with a 2-hour free-cancel window; refunds are net of gateway fee; doctor cancels have no time restriction.

* __F06.01 - Patient cancel (P6)__
  * __In-App-Only Rule__: the cancellation channel is in-app only (no phone or email cancellations); the Cancel button is visible on `confirmed` bookings in the patient dashboard.
  * __Free-Cancel Window Rule (policy #4)__: if cancelled ≥2 hours before slot start → refund initiated to the original payment method; UI shows "Refund initiated, expected within 5–7 working days"; appointment marked `cancelled_refunded` and the slot is released.
  * __Late-Cancel Rule (policy #4)__: if cancelled <2 hours before slot start → confirmation modal "No refund available for late cancellations — proceed anyway?"; on confirm the appointment is marked `cancelled_no_refund`, the slot stays blocked on the doctor's calendar, and no refund is issued.
  * __Net-of-Fee Refund Rule (policy #5)__: refund amount = amount paid at booking minus the payment-gateway transaction fee. The cancellation modal explicitly shows the expected refund amount and the line "Refund excludes the payment-gateway fee charged at booking." The refund-status view in the dashboard shows the **same** breakdown (identical number across modal and dashboard).
  * Refund status is visible in the dashboard with timestamp and gateway reference number.
* __F06.02 - Doctor cancel (D5)__
  * **Reason** (text, required, internal — shown to admin only).
  * __No-Window Rule__: doctor cancellation has no time-window restriction (can cancel even <2hr before).
  * On submit: appointment marked `doctor_cancelled`, refund automatically initiated to the patient's original payment method (net of gateway fee per F06.01), apology email sent with an offer to rebook.
* __F06.03 - Refund mechanics__
  * __Refund Idempotency Rule (#10)__: each appointment carries a single refund idempotency key so an automatic retry, the reconciliation path, or an admin's out-of-band gateway action can never settle a refund twice (§3.3 #10).
  * __Fee-Source Rule (policy #5)__: the gateway fee used in the refund is the fee/net-settlement figure the aggregator reports for the original payment; if the aggregator does not report a per-transaction fee, the admin-configured fallback fee model (F14) applies. The reported figure always wins when present.

Uses the shared confirmation `Modal`, `Button`, and `Card` components (doc 06).

### __F07 - Reminders & notifications__

One-line: email-only confirmation and reminder cadence in `Asia/Karachi`, with retry/backoff and reminder invalidation.

* __F07.01 - Triggers (§3.4 — six types)__: booking confirmation, 24-hour reminder, 1-hour reminder, prescription-ready notification, refund confirmation, cancellation apology (doctor-initiated cancel).
* __F07.02 - Reminder cadence (P4)__
  * Booking confirmation email sent immediately after the `confirmed` state.
  * Reminder email sent 24 hours before slot start.
  * Reminder email sent 1 hour before slot start.
  * __Timezone Rule__: all times in `Asia/Karachi`, formatted clearly in the email body.
  * __Short-Lead Skip Rule__: if confirmed <24h before slot start, the 24-hour reminder is skipped; if confirmed <1h before slot start, the 1-hour reminder is skipped (reachable because the minimum lead time is configurable down to 30 minutes — P3).
* __F07.03 - Reliability & invalidation__
  * __Retry Rule__: on send failure, the system retries 3× with exponential backoff; the admin is alerted on final failure.
  * __Reminder-Invalidation Rule__: when an appointment leaves `confirmed` (any cancellation or terminal no-show), undispatched 24h/1h reminders must be suppressed; the notification worker re-checks appointment state immediately before dispatch and never delivers a reminder for an appointment no longer in `confirmed`/`in_progress` at send time.
* __F07.04 - Out of scope (v1)__: no PDF attachments — the prescription-ready email contains a dashboard link, not an attachment. No SMS/WhatsApp in v1.

### __F08 - Prescription__

One-line: doctor builds an immutable, itemised prescription with a read-only patient-ID header; patient downloads a client-rendered PDF indefinitely.

* __F08.01 - Patient prescription view & download (P7)__
  * The patient dashboard "Past appointments" view shows all past appointments with their terminal state via patient-facing labels: `completed`/`prescription_issued` → "Completed" (with Download Prescription where applicable); `patient_no_show` → "Missed (no-show)"; `doctor_no_show`/`doctor_cancelled` → "Cancelled by doctor — refund issued"; `cancelled_refunded` → "Cancelled — refunded"; `cancelled_no_refund` → "Cancelled — no refund". The underlying state is the source of truth.
  * For appointments in `prescription_issued` state, a **"Download Prescription"** button is shown.
  * __Client-Render Rule__: clicking renders a PDF client-side from stored prescription JSON and triggers a browser download (§3.5). The rendering is isolated behind a single replaceable boundary for a future server-side move.
  * __Itemised-Total Rule__: each catalogue medicine shows its admin-configured price and the prescription shows a computed total. Free-text medicines not in the catalogue are shown as "not priced", excluded from the total, with an "N item(s) not priced" note.
  * __Chronological Corrections Rule (policy #9)__: if the doctor issues additional prescriptions for the same appointment, all are visible chronologically and each is downloadable separately.
  * __Indefinite-Retention Rule__: the prescription remains downloadable indefinitely (no expiry); v1 has no patient-initiated account-deletion flow (deferred to v1.1).
* __F08.02 - Doctor prescription builder (D4)__
  * __Completed-Gate Rule__: the builder is accessible from the appointment row after the consultation is marked `completed`.
  * __Read-Only Patient-ID Header (P8)__: above the medicine list, a read-only header shows the actual patient identity (account holder name if "Myself"; otherwise the captured name + age + relation). The doctor confirms identity by reading the header and does not type the patient name — it is auto-pulled from the appointment record (§3.5).
  * Form fields:
    * **Add medicine** (search/select from medicine catalogue, with free-text fallback for medicines not in the catalogue).
    * **Dosage** (text, required per medicine, user input).
    * **Duration** (text, required per medicine, user input).
    * **Instructions** (text, required per medicine, user input) — e.g., "1 tablet twice daily, after meals, for 7 days".
    * **General notes** (text, optional, user input).
    * **Follow-up date** (date, optional, user input).
  * __Running-Total Rule__: the builder shows a running total computed from each catalogue medicine's admin-set price (F11); free-text medicines carry no price, are flagged "not priced", and are excluded from the total.
  * __Immutability Rule (#4)__: submit creates an immutable prescription record linked to the appointment; no update or delete path is exposed to doctor, admin, or any internal API. To fix an error the doctor issues a new prescription (§3.3 #4, policy #9).
  * __Medicine Snapshot Rule (#5)__: medicine name, dosage, and price are snapshotted on the prescription at issue-time; later catalogue renames, price changes, or deactivations do not change an existing prescription or its total (§3.3 #5).
  * On submit: the patient sees the prescription within 60 seconds; a "Prescription ready" email is sent with a dashboard link (no PDF attached in v1).

Uses the shared `Button`, `Card`, search/select `Autocomplete`, and form `Input` components (doc 06).

### __F09 - Doctor weekly availability__

One-line: doctor sets a recurring weekly schedule that auto-generates 30-minute bookable slots.

* __F09.01 - Availability grid (D1)__
  * Weekly grid (Sun–Sat × hours); the doctor selects time blocks per day (e.g., Mon/Wed/Fri 6pm–9pm).
  * __Recurring Rule__: saved availability is recurring (applies every week until changed).
  * __Slot-Generation Rule__: slots are auto-generated in 30-minute increments within each block; back-to-back allowed, no inter-slot buffer in v1 (§4.2).
  * __Block-Lock Rule__: if the doctor tries to delete or modify a block containing confirmed future bookings, a warning is shown and each booking must be cancelled individually before the block can be removed.

Uses the shared grid and `Button` components (doc 06).

### __F10 - Admin: doctor onboarding, edit, (de)activation__

One-line: admin adds doctors with an initial password, edits most fields, and deactivates/reactivates while honouring existing appointments.

* __F10.01 - Add doctor (A1)__
  * **Full name** (text, required, admin input)
  * **PMC number** (text, required, admin input)
  * **Email** (text, required, admin input)
  * **Phone** (text, required, admin input)
  * **Profile photo** (file: JPEG/PNG/WebP ≤2MB, required, admin upload) — SVG and other formats rejected at upload.
  * **Bio** (text, required, admin input)
  * **Specialization** (text, required, admin input)
  * **Consultation fee** (number PKR, required, admin input)
  * **Weekly availability template** (schedule, optional, admin input)
  * **Initial password** (password, required, admin input) — set by admin and shared with the doctor out-of-band per DA1.
  * __Pending-State Rule__: a new doctor is created in `pending` state until admin manually toggles to `active`; active doctors appear in the public listing immediately.
* __F10.02 - Edit doctor (A4)__
  * Editable fields: **full name**, **phone**, **profile photo** (same JPEG/PNG/WebP ≤2MB constraints), **bio**, **specialization**, **consultation fee**, **weekly availability template**.
  * __PMC/Email Immutability (#8)__: PMC number and email are immutable post-creation — neither can be updated through any API (§3.3 #8).
  * __feeAtBooking Snapshot (#6)__: consultation-fee changes never affect existing appointments; the edit page shows a one-line note confirming this (§3.3 #6).
  * __Rename Durability Rule (#3)__: renaming a doctor never alters historical appointments or prescriptions (§3.3 #3).
* __F10.03 - Deactivate / reactivate (A4, #9)__
  * __Deactivation-Preserves-Appointments Rule (#9)__: deactivate sets `active=false`, removes the doctor from the public listing immediately, and blocks all new bookings; existing `confirmed` future appointments are kept and honoured — not cancelled, no refunds, no cascade (§3.3 #9). Login and panel access are not revoked — a deactivated doctor can still view those appointments (F05.02), join calls (F05.03), and submit prescriptions (F08.02).
  * __Deactivation-Warning Rule__: the confirmation modal shows a warning with the count of upcoming `confirmed` appointments that will remain on the doctor's calendar.
  * The doctor's photo + bio remain visible in upcoming- and past-appointment views for patients with appointments or prescription history under that doctor.
  * If the doctor genuinely cannot serve (e.g., PMC license revoked), the admin cancels each appointment individually via the doctor-cancel flow (F06.02) — each refund net of gateway fee + apology email per policy #5.
  * Reactivate restores the doctor to the public listing using their saved availability template.

Uses the shared `Button`, `Card`, confirmation `Modal`, file-upload `Input`, and form `Input` components (doc 06).

### __F11 - Admin: medicine catalogue__

One-line: admin manages the priced medicine catalogue that powers the prescription builder (and the deferred ordering module).

* __F11.01 - Medicine list (A2)__: a searchable list on the admin "Medicines" page.
* __F11.02 - Add medicine__
  * **Name** (text, required, admin input)
  * **Generic name** (text, optional, admin input)
  * **Common dosage forms** (multi-select: tablet, cream, syrup, etc., required, admin input)
  * **Unit price in PKR** (number, required, admin input) — used to compute the prescription total (F08) and the order total (Medicine Ordering Module, §5/§6).
* __F11.03 - Edit / deactivate__
  * __Propagation Rule__: edits (including renames and price changes) propagate to the doctor's prescription-builder view but do not affect existing prescriptions, which are immutable and store a snapshot of medicine name, dosage, and price at issue-time (§3.3 #5).
  * __Deactivate Rule__: deactivating a medicine removes it from the prescription-builder dropdown but does not affect existing prescriptions.

Uses the shared `Button`, `Card`, and form `Input` components (doc 06).

### __F12 - Admin: system-health alerts__

One-line: an admin alert feed surfaces payment, refund, email, prescription-SLA, and exception failures with manual email re-trigger only.

* __F12.01 - Alert feed (A3)__: shows alerts for —
  * Payment-webhook reconciliation mismatches.
  * Refund API failures.
  * Transactional-email send failures (after retry exhaustion).
  * Appointments in `awaiting_prescription` state >12 hours.
  * Unhandled application exceptions (sourced from the error-tracking tool named in §3.6).
  * Each alert links to the relevant appointment/payment record.
* __F12.02 - Remediation__
  * __Email-Only Re-Trigger Rule__: the admin can manually re-trigger emails only.
  * __No-Manual-Refund Rule__: refunds are not re-triggered from the app; on a refund-API failure the platform auto-retries with exponential backoff and, after exhaustion, raises this alert. The admin then resolves the refund out-of-band in the aggregator's dashboard and the platform reconciles the final status; idempotency (§3.3 #10) makes out-of-band resolution safe.

Uses the shared alert `Card` / feed and `Button` components (doc 06).

### __F13 - Admin: records & audit log (unified)__

One-line: a single read-only admin page to look up appointments, payments, and the full audit trail, with detail view, dispute flagging, and email re-trigger.

* __F13.01 - Unified Records & Audit Log page (A5)__
  * __Single-Surface Rule__: this page replaces the separate appointment/payment-search and audit-log views; overlapping information lives in one place with a superset of filters.
  * Filters: patient email or phone, doctor name, appointment ID, payment reference number, user (patient or doctor) ID or email, event type, actor type (`patient` | `doctor` | `admin` | `system`), and date range.
  * Record row columns: **appointment ID**, **slot date/time**, **patient name** (and **"for: [actual patient]"** if applicable), **doctor name**, **current state**, **amount paid**, **payment reference**, **refund reference** (if any).
  * Audit entry columns: **timestamp** in `Asia/Karachi`, **event type**, **actor type**, **actor identity**, **target record reference**, **optional reason**. Event coverage matches §3.6 (appointment state transitions, auth events, payment events, refund events).
* __F13.02 - Detail view__
  * Clicking a row opens an appointment detail view showing the full state-transition history (from the §3.6 audit log) and any linked prescriptions.
  * Action buttons: **Re-trigger email** (emails only, per F12) and **Mark `disputed`** (per §4.4 #10 / §3.6).
* __F13.03 - Read-only & access__
  * __Read-Only Rule__: the view is read-only with respect to records (append-only convention, §3.6); no update or delete UI is exposed. The mutations it does allow (email re-trigger, mark disputed) are themselves recorded as admin-actor audit entries. Refunds are never re-triggered in-app (§3.3 #10).
  * __Admin-Only Route Rule__: the route is reachable only by the admin role per DA6; no patient or doctor surface exposes this view.

Uses the shared table/list, filter bar, `Card`, `Button`, and confirmation `Modal` components (doc 06).

### __F14 - Admin: platform settings__

One-line: admin tunes booking parameters and the fallback fee model without a code change; every change is audit-logged.

* __F14.01 - Minimum booking lead time (A6)__
  * **Minimum booking lead time** (duration, required, admin input) — default 1 hour, allowed range down to 30 minutes (per §4.1 #3 and the glossary entry "Minimum booking lead time").
  * __Future-Only Rule__: changes apply to future booking attempts only; existing `confirmed` appointments are unaffected.
* __F14.02 - Fallback transaction-fee model__
  * **Fallback fee percentage** (number %, configurable, admin input) **and/or** **fixed PKR amount** (number, configurable, admin input) — with a documented default and validated bounds.
  * __Fallback-Fee Rule (policy #5)__: used only when the aggregator does not report a per-transaction fee for a payment; when the aggregator does report a fee, that reported figure always wins. This figure feeds the refund amount, the cancellation-modal estimate, and the dashboard refund breakdown (F06) identically.
* __F14.03 - Audit__: each settings change is recorded in the audit log as an admin-actor entry (§3.6).

Uses the shared form `Input`, `Button`, and `Card` components (doc 06).

### __F15 - Doctor & admin authentication & roles__

One-line: minimal shared-login auth for doctors and admin with admin-set initial passwords, forced first-login change, admin bootstrap, manual reset, and single role middleware.

* __F15.01 - Doctor account creation by admin (DA1)__: when admin creates a doctor (F10.01), the admin sets an initial password in the same form and shares it out-of-band (WhatsApp, phone, in person). v1 has no email-token "set your password" flow for doctors.
* __F15.02 - Shared login surface & role routing (DA2)__: patients, doctors, and the admin all log in at the same `/login` route. The user record carries a `role` field (`patient` | `doctor` | `admin`); on success the system routes `patient` → patient dashboard, `doctor` → doctor panel, `admin` → admin panel.
* __F15.03 - Forced first-login change (DA3)__: on a doctor's first successful login, the doctor must change the password before reaching the doctor panel; tracked via `mustChangePassword: true`, cleared on successful change.
* __F15.04 - Admin bootstrap (DA4)__: a single admin account is created via a one-off bootstrap script run against production on first deploy (path/usage in the deploy runbook). No additional admins in v1 — no admin self-signup and no "admin creates admin" UI.
* __F15.05 - Doctor password recovery, manual (DA5)__: no self-service reset for doctors in v1. A doctor who forgets the password contacts the admin out-of-band; the admin resets it from the doctor edit page (F10.02) and shares the new one out-of-band. After reset, `mustChangePassword` is set to true.
* __F15.06 - Role-based authorization (DA6)__
  * __Single-Middleware Rule__: every authenticated server route checks the session's `role` and rejects requests outside the allowed roles. The §3.6 authorization rules (patient PII access, doctor schedule access, admin-only routes) are enforced through this single mechanism, not duplicated in route bodies; frontend role-routing is convenience only and the server is the enforcement boundary.

### __F16 - Legal content (ToS / Privacy)__

One-line: hosted Terms of Service and Privacy Policy pages linked from sign-up; acceptance captured at sign-up.

* __F16.01 - Legal pages__: `/legal/terms` and `/legal/privacy` page contents (M4 deliverables) are linked from the sign-up consent checkbox (F01.01).
* __F16.02 - Consent record (§3.6)__: a mandatory acceptance is recorded at sign-up with a timestamp. Versioning and re-prompt-on-update are deferred to v1.1.

---

## 3. Appointment state machine

The §4.3 appointment state machine, reproduced faithfully.

```text
slot_available
    │ (patient picks + clicks Pay)
    ▼
slot_locked  (10-min reservation during payment flow)
    │
    ├─ payment webhook: success ─────► confirmed
    │
    └─ lock expires / payment fails ─► slot_available  (released)


confirmed
    │
    ├─ patient cancels ≥2hr before ──► cancelled_refunded  (refund initiated, slot released)
    │
    ├─ patient cancels <2hr before ──► cancelled_no_refund  (slot stays blocked, no refund)
    │
    ├─ doctor cancels (any time) ────► doctor_cancelled  (refund initiated, apology email, slot released)
    │
    │ (slot-start time arrives)
    ▼
in_progress  (video room active; grace window = slot-start + 15min)
    │
    ├─ both join + call ends normally ──► completed
    │       │
    │       ├─ doctor submits prescription ──► prescription_issued  (immutable)
    │       │       │
    │       │       └─ doctor issues additional prescription(s) ──► all linked to appointment, chronological
    │       │
    │       └─ no prescription submitted within 12hr ──► alert raised (status: awaiting_prescription)
    │
    ├─ patient absent at slot+15 ──► patient_no_show  (no refund)
    │
    └─ doctor absent at slot+15 ──► doctor_no_show  (refund initiated, apology email)
```

**Transition triggers & owning components.** Each non-payment transition has a defined trigger and owning component:

- `confirmed → in_progress`: at slot-start time, set by a scheduled **appointment-evaluation job** (the same component that owns the grace-window check below).
- `in_progress → completed`: finalised at **slot-end + 5 min** once both parties have joined at least once. A transient mid-call disconnect does **not** finalise completion — either party may rejoin the same room until slot-end + 5 min (edge #22). Earlier finalisation on "both parties left" is permitted only on an explicit end-of-call action by both parties, not a dropped connection; absent that signal, completion waits for the slot-end + 5 min cutoff. Join/leave facts come from the video provider's participant events (§3.4). The doctor never manually marks completion in v1.
- `in_progress → patient_no_show` / `doctor_no_show`: at slot-start + 15 min the job inspects recorded join events. **If the doctor never joined (whether or not the patient joined) → `doctor_no_show`** (refund net of gateway fee + apology email). If the doctor joined but the patient never joined → `patient_no_show` (no refund). If both joined, the no-show path is not taken. Doctor-absence takes precedence because the platform failed to deliver the contracted doctor; the patient is not penalised for an appointment the doctor also missed.
- **Missing participant data at evaluation**: if the video provider's participant events are unavailable/unreadable when the job runs at slot-end + 5 min, the job must still move the appointment out of `in_progress` — it resolves to a **non-penalising terminal state** (treated as `doctor_no_show` for refund purposes so the patient is not charged for an unverifiable consultation) **and** raises an admin alert (F12) flagging that the resolution was made without join data, so the admin can adjudicate via F13. The appointment must never remain `in_progress` past slot-end + 5 min.
- The appointment-evaluation job is a new `system` component (alongside the reconciliation and notification workers in §3.1); its audit-log actor type is `system`. The hard requirement is that no appointment can remain in `in_progress` past slot-end + 5 min without resolving to a terminal state.

**Refunds.** Refund amounts on `cancelled_refunded`, `doctor_cancelled`, and `doctor_no_show` are net of the payment-gateway transaction fee per policy #5.

**`disputed` flag (orthogonal).** A `disputed` boolean flag (set via F13/A5) is orthogonal to this state machine — it can attach to any terminal state and does not alter transitions (see the Disputed-marker bullet in §3.6).

**`awaiting_prescription` (derived condition, not a state).** `awaiting_prescription` is **not** a distinct appointment state — it is a derived condition: an appointment in `completed` with no linked prescription and more than 12 hours elapsed since completion. It drives the F12/A3 alert and dashboard reminder but does not appear as a state transition in the audit log; the appointment remains `completed` until a prescription is submitted (`prescription_issued`).

---

## 4. Edge case catalogue

All 40 edge cases from §4.4, grouped by the PRD's 7 categories, each keeping its number, case, tag, and v1 handling. Tags: **(A)** Architecturally handled, **(P)** Policy-handled, **(K)** Known gap, manual handling in v1.

### Booking flow (before payment)

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 1 | Two patients click "book" on the same slot simultaneously | A | Storage-layer uniqueness on slot identity (§3.3 #1). Second click fails fast with "slot just taken" error. |
| 2 | Patient starts booking, abandons mid-flow | P | Slot lock expires after 10 min (policy #2) and is released. |
| 3 | Patient on slow 3G — slot expires before payment completes | P | Same as #2. 10-min lock chosen to accommodate this. |
| 4 | Doctor adds a new slot while patient is browsing | A | Frontend refreshes on focus; stale-data shows brief "slot no longer available" error. Acceptable friction. |

### Payment flow

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 5 | Patient double-clicks "Pay" — two payment attempts | A | Idempotent payment-intent creation on `(patient, slot)` (§3.3 #7); aggregator also handles duplicate detection. |
| 6 | Payment succeeds but webhook never reaches server | A | Hourly reconciliation query against the aggregator for unconfirmed payments in the past 24h; reconciles state and alerts admin on mismatch. |
| 6a | Payment succeeds (late webhook or reconciliation) but the slot's lock had expired and the slot was already confirmed to another patient | A | No second appointment is created (storage uniqueness, §3.3 #1). The platform auto-initiates a **full refund** to the paying patient (platform-caused, not a cancellation — net-of-gateway-fee policy #5 does **not** apply), raises an admin alert, and emails the patient that the slot could not be secured and a refund is on the way. Refund is idempotency-keyed (§3.3 #10). |
| 7 | Payment fails — patient retries inside lock window | A | Same locked slot held; patient retries; second attempt triggers a fresh payment intent. |
| 8 | Patient closes browser during payment redirect | A | The verified webhook is the source of truth — if it fires success, booking is confirmed and email sent regardless of browser state. |
| 9 | Patient pays twice (e.g., refreshes success page) | A | Idempotency at intent + aggregator duplicate detection. |
| 10 | Chargeback weeks later | K | Admin tool marks appointment as `disputed` via A5 detail view. No automated handling in v1. |

### Pre-consultation (after confirmed, before call)

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 11 | Patient cancels inside cancel window | P | Auto-refund initiated to original payment, net of gateway fee (policy #5). |
| 12 | Patient cancels outside cancel window | P | Confirmation modal; on confirm, appointment marked `cancelled_no_refund`. **Slot stays blocked on the doctor's calendar; no refund issued** (policy #4). |
| 13 | Doctor cancels a confirmed appointment | P | Refund initiated (net of gateway fee); apology email to patient (policy #5 + state machine). |
| 14 | Doctor wants to change availability with existing bookings | A | UI prevents deleting a window containing confirmed bookings; doctor must cancel each booking first. |
| 15 | Reminder email fails to send | A | Provider retries with exponential backoff (3×); admin alerted on final failure. |
| 16 | Patient wants to reschedule | P | Cancel + rebook (policy #6). |

### During consultation

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 17 | Patient joins early | A | "Doctor will be with you shortly" waiting screen until slot start. |
| 18 | Patient joins late (within grace) | A | Can join any time until slot end; consultation length effectively shortened. |
| 19 | Doctor joins late (within grace) | A | Patient sees "doctor running late" message; no automatic refund unless full no-show. |
| 20 | Patient absent at slot+15 | P | Marked `patient_no_show`; no refund (policy #7). |
| 21 | Doctor absent at slot+15 | P | Marked `doctor_no_show`; refund initiated (net of gateway fee) + apology (policy #7). |
| 22 | Call drops mid-consultation (network issue) | A | Video session persists for slot duration + 5 min; either party can rejoin the same room. |
| 23 | Consultation runs over slot end | A | Hard cutoff at slot-end + 5 min; soft warning to doctor at 5 min remaining. |
| 24 | Audio/video doesn't work for one party | K | Manual support fallback (admin uses the A5 records & audit-log view). No automated recovery in v1. |
| 25 | Patient and doctor join different rooms by accident | A | Impossible — room identity is appointment-scoped and access-gated (§3.4). |
| 25a | Neither patient nor doctor joins by slot+15 | P | Resolves to `doctor_no_show` (doctor-absence precedence); refund initiated net of gateway fee + apology email (policy #7, §4.3). |

### Post-consultation

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 26 | Doctor doesn't submit prescription within 12 hours | A | Admin alert; appointment status `awaiting_prescription`; doctor reminded via dashboard. |
| 27 | Doctor wants to edit prescription after submit | P | Issues a new prescription; original immutable; patient sees both (policy #9). |
| 28 | Patient claims consultation didn't happen | K | Manual support resolution; admin investigates via A5. No automated dispute flow in v1. |
| 29 | Patient loses prescription PDF | A | Always re-downloadable from dashboard; PDF rendered on demand from stored data. |

### Refunds

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 30 | Refund API call fails | A | Transient failures auto-retry with exponential backoff (idempotency-keyed, §3.3 #10). On retry exhaustion: admin alert; admin resolves the refund out-of-band in the payment aggregator's dashboard; platform reconciles the final status. Patient notified of delay via email. No manual in-app refund retry. |
| 31 | Refund takes 5–7 days to reflect | A | Patient dashboard shows transparent status ("refund initiated 2 days ago, expected within 7 days") + gateway reference number. |
| 32 | Patient cancels + immediately rebooks inside cancel window | A | No penalty; treated as two independent operations (first cancel refunded, second booking standard flow). |

### System-level

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 33 | Video provider outage during peak consultation hours | K | Status banner shown; patients/doctors offered reschedule + apology. No automatic fallback in v1. |
| 34 | Payment aggregator outage | A | New bookings blocked with banner; existing confirmed bookings unaffected. |
| 35 | Email provider outage | A | Reminders delayed; queue processed when service returns; admin alerted. |
| 36 | Timezone confusion | A | All UI in `Asia/Karachi`; storage in UTC. Pakistan doesn't observe DST. |

### Privacy / safety

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 37 | Booking for someone else (parent for child, child for parent) | P | "Who is this consultation for?" field captures actual patient name (policy #10). Prescription auto-pulls the actual patient name onto the PDF (§3.5). |
| 38 | Patient is a minor | K | Doctor uses clinical judgment; no platform enforcement in v1. |
| 39 | Doctor's PMC license revoked / admin deactivates a doctor | P | Past appointments untouched. **Existing `confirmed` future appointments are kept and honored — not auto-cancelled** (client decision). Future bookings are blocked and the doctor is removed from the public listing; photo + bio remain visible in upcoming- and past-appointment views for patients with appointments or prescription history under that doctor. The deactivate modal warns the admin with the count of upcoming appointments first. If the doctor genuinely cannot serve, the admin cancels each appointment individually via the `doctor_cancelled` flow (D5) — refund net of gateway fee + apology email. Triggered from A4. |
| 40 | Patient under another patient's account | A | Account-level auth; no cross-account access. |

---

## 5. Deferred — Medicine Ordering Module (NOT in v1 build)

> **Scope banner (§6).** This module is documented here to lock the product decisions, but it is **not part of the v1 8-week / ~160-hour MVP**. It is a distinct module to be costed, timelined, and scheduled in a separate planning discussion. v1 ships only the prescription-side prerequisites: admin-set medicine prices (F11), the computed prescription total (F08), and the itemised, self-pay PDF (F08).

### 5.1 Summary (§6.1)

Patients can order the medicines on an issued prescription for home delivery, paying by **card** (via the existing payment aggregator) or **cash on delivery (COD)**. Dermestha calculates the order total from admin-configured medicine prices. **Fulfilment is operational:** Dermestha staff arrange delivery through a courier (Leopards, TCS, or equivalent) and update order status manually. No courier API integration is required in this module's first cut.

### 5.2 Features (§6.2)

#### __F-MO1 - Order medicines from a prescription (patient)__

One-line: a patient orders the priced medicines on an issued prescription for delivery, paying by card or COD.

* __F-MO1.01 - Order entry__
  * __Order-Availability Rule__: an "Order medicines" action appears on any `prescription_issued` prescription that has at least one priced (catalogue) medicine.
  * The order screen lists the prescription's catalogue medicines, each with an **editable quantity** (number, required, user input). This module's v1 does **not** parse free-text dosage/duration into a quantity; the quantity defaults to a safe value (1, or blank requiring entry) and is always patient-editable.
  * __Free-Text Exclusion Rule__: free-text (non-catalogue) medicines cannot be ordered in-app; they are shown with a "buy at a pharmacy" note.
  * The **unit price** (snapshotted per §6.4) and a computed **subtotal + delivery fee + total** update as quantities change.
* __F-MO1.02 - Delivery & payment__
  * **Delivery address** (text, required, user input) and **contact phone** (text, required, user input).
  * Payment options: **card** (aggregator hosted checkout, same as booking) or **COD**.
  * __Confirm-Before-Charge Rule__: admin confirms stock and final pricing before charge/dispatch (F-MO2); for COD this confirmation precedes dispatch, for card it precedes capture.
  * On card-payment success (verified webhook) or COD confirmation, the order is placed and an order-confirmation email is sent. The order is linked to the originating prescription and the patient account.

#### __F-MO2 - Manage and fulfil orders (admin)__

One-line: admin views, prices/confirms, dispatches, and reconciles medicine orders manually.

* __F-MO2.01 - Orders list__: the admin "Orders" page lists orders with columns: **order ID**, **patient**, **linked prescription**, **items**, **total**, **payment method** (card/COD), **payment status**, **order status**.
* __F-MO2.02 - Fulfilment__
  * Admin confirms stock/price, marks the order `dispatched` (records **courier name** + **tracking reference**, entered manually), then `delivered`.
  * __Pre-Dispatch Cancel Rule__: admin can cancel an order before dispatch; card orders are refunded via the existing refund path (idempotent, net-of-gateway-fee policy reused per §4.1 #5); COD orders simply close.
  * __COD Reconciliation Rule__: COD collection is reconciled manually by admin when the courier remits cash.

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

| Date | Change | Why |
|---|---|---|
| 2026-06-01 | Initial creation | Faithful re-presentation of PRD.md §2.2/§3.3–§3.6/§4/§6 |

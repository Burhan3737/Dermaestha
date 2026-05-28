# Dermestha — Product Requirements Document (v2)

**Document type:** Product Requirements Document
**Audience:** Development team, technical stakeholders (PRD is the input to the architecture skill)
**Status:** Draft (v2.1) — incorporates client review comments: medicine pricing + a separately-scoped ordering module (§6), flexible booking lead time, deactivation that honors existing appointments, refund auto-retry, and a merged records/audit view
**Date:** 2026-05-28

---

## 1. Executive Summary

### Problem Statement

Pakistani dermatology patients have no specialty-focused telemedicine platform. The dominant players (Ola Doc, Marham, Sehat Kahani, Shifa4U, Healthwire) are generalist marketplaces where skin care is one tab among 100–200 specialties. The booking flow, prescription format, and consultation UX are designed for the average specialty, not for skin examination. Patients searching for a dermatologist filter through thousands of unrelated doctors, and the prescription experience is a generic upload rather than a structured, skin-treatment-aware document.

### Proposed Solution

A purpose-built specialty-boutique telederm platform for Pakistan. v1 ships a single end-to-end loop: patient discovers a curated dermatologist → books a paid slot → joins live video consultation → receives a structured digital prescription downloadable as PDF. Every UX choice — discovery, booking, consultation interface, prescription builder — is tuned for skin care. No general-purpose pivots, no irrelevant specialties. The downloadable prescription is itemised with admin-configured medicine prices and a computed total, so a patient can pay and source the medicines independently; a separately-scoped Medicine Ordering Module (see §6) will additionally let patients order prescribed medicines for home delivery.

### Success Criteria (measurable KPIs)

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | Landing → booking conversion | ≥30% | Web analytics: unique visitors / completed bookings |
| 2 | Booking → completion rate | ≥70% | Confirmed bookings / consultations marked `completed` |
| 3 | Video call join success on 3G | ≥95% | In-app video-join telemetry, segmented by network type |
| 4 | Payment success rate (all 4 methods) | ≥90% | Successful payment webhooks / payment intents created |
| 5 | Prescription availability after doctor submit | ≤60s end-to-end | Time from doctor submit to first patient-side download availability |
| 6 | Slot double-booking rate | 0 (zero) | Enforced at storage layer; verified by audit log |
| 7 | Refund initiation latency (eligible cancellations) | ≤1 hour | Cancellation timestamp → refund-API call timestamp |
| 8 | First-page Time-to-First-Byte (Karachi mobile, 3G) | ≤2s | Lighthouse + real-user metrics post-launch |


---

## 2. User Experience & Functionality

### 2.1 User Personas

| Persona | Description | Primary device | Key goals |
|---|---|---|---|
| **Patient** | Pakistani adult with a skin concern; arrives from social media; mobile-first; pays via JazzCash/Easypaisa/card/bank transfer | Mobile browser (Chrome on Android, Safari on iOS) | Quickly book a qualified dermatologist, attend the call without friction, get a usable prescription itemised with medicine prices; optionally order the prescribed medicines for home delivery (separate module, §6) |
| **Dermatologist** | Practicing PMC-verified dermatologist; 3–5 at launch; sets weekly availability; conducts consultations between clinic hours | Desktop browser (primary), mobile (occasional) | See today's appointments at a glance, join calls without manual setup, build prescriptions quickly using familiar medicine names |
| **Admin** | Internal Dermestha staff; manages doctor onboarding and the medicine catalogue; handles refund failures and dispute escalations | Desktop browser | Onboard new doctors, keep medicine list current, monitor system health, resolve manual edge cases |

### 2.2 User Stories & Acceptance Criteria

#### Patient stories

**P1. Browse dermatologists**
> *As a patient, I want to see all available dermatologists with their fee, specialization, and availability so I can pick the right one.*

- The doctor listing page loads in ≤2 seconds on 3G
- Each card displays: photo, name, specialization (e.g., "Acne & Pigmentation"), consultation fee in PKR, and next-available slot
- Doctors marked inactive by admin do not appear in the listing
- No authentication required to browse

**P2. Sign up and log in**
> *As a patient, I want to create an account with my email so my bookings and prescriptions are saved.*

- Sign-up requires: full name, email, phone, password
- Sign-up form includes a mandatory checkbox: "I agree to the Terms of Service and Privacy Policy", linking to `/legal/terms` and `/legal/privacy`. Sign-up cannot proceed without it. Acceptance is recorded on the user record with timestamp. (Policy versioning and re-prompt logic deferred to v1.1; v1 records a single acceptance at sign-up.)
- Email uniqueness enforced; duplicate registration returns a clear error
- Login uses email + password; session persists across visits via a secure HTTP-only cookie
- Forgot-password flow sends a reset link via the transactional email provider; link expires in 1 hour. Response is identical for known and unknown emails to prevent account enumeration.
- No email-verification flow in v1 (deferred — patients self-report email)


**P3. Book a consultation slot**
> *As a patient, I want to pick a doctor, choose a 30-minute slot, and pay so my appointment is confirmed.*

- Slot picker shows only future slots within the doctor's set weekly availability
- Slots booked or in-flight (locked during another patient's payment) are visually disabled
- Minimum booking lead time is a **platform-configurable value** (admin-set; default 1 hour, supported down to 30 minutes). Slots whose start is within the configured lead time are not bookable. (The live-queue / on-demand flow that removes lead time entirely is still v1.1.)
- On "Confirm & Pay", slot is **locked for 10 minutes** while patient completes the payment flow
- Patient is redirected to the payment aggregator's hosted page (cards / JazzCash / Easypaisa / bank transfer)
- On payment success (verified webhook), slot is marked `confirmed`, confirmation email sent within 60 seconds, patient redirected to dashboard
- On payment failure or 10-minute lock expiry, slot is released; no booking record persists
- Patient cannot hold multiple slot locks simultaneously
- Patient cannot book overlapping slots with the same or different doctors

**P4. Receive reminders**
> *As a patient, I want reminders before my appointment so I don't miss it.*

- Booking confirmation email sent immediately after `confirmed` state
- Reminder email sent 24 hours before slot start
- Reminder email sent 1 hour before slot start
- All times in `Asia/Karachi` timezone, formatted clearly in the email body
- If email send fails, system retries 3× with exponential backoff; admin alerted on final failure
- **Short-lead booking behavior:** if the booking is confirmed less than 24 hours before slot start, the 24-hour reminder is skipped (the confirmation email serves the same purpose). If the booking is confirmed less than 1 hour before slot start, the 1-hour reminder is skipped (reachable in v1 because the minimum booking lead time is configurable down to 30 minutes — see P3).

**P5. Join the video consultation**
> *As a patient, I want to join the call from my phone browser without downloading an app.*

- "Join Call" button activates 10 minutes before slot start
- Click opens the video room in the current browser tab (no app install)
- Tested working on Chrome (Android 10+) and Safari (iOS 14+) over 3G
- Pre-call lighting prompt: "Find a well-lit area; sit facing a window or lamp if possible"
- If patient joins before doctor: waiting screen "Doctor will be with you shortly"
- If neither party has joined by slot start + 15 minutes: appointment marked `patient_no_show` or `doctor_no_show` (whichever absent — see §4)

**P6. Cancel a booking**
> *As a patient, I want to cancel my booking and get a refund if I cancel in time.*

- Cancellation button visible on confirmed bookings in patient dashboard
- If cancelled ≥2 hours before slot start: refund initiated to original payment method; UI shows "Refund initiated, expected within 5–7 working days"
- **Refund amount = amount paid at booking minus the payment-gateway transaction fee.** The cancellation modal explicitly shows the patient the expected refund amount and the line "Refund excludes the payment-gateway fee charged at booking." The refund-status view in the dashboard shows the same breakdown.
- If cancelled <2 hours before slot start: confirmation modal "No refund available for late cancellations — proceed anyway?"; on confirm, the appointment is marked `cancelled_no_refund`. **The slot stays blocked on the doctor's calendar** (doctor's time is committed; this is the bite of the late-cancellation policy). No refund is issued.
- Refund status visible in dashboard with timestamp and gateway reference number
- Cancellation channel is **in-app only** (no phone or email cancellations supported)

**P7. View and download prescription**
> *As a patient, I want to see my prescription after the consultation and download it as a PDF.*

- Patient dashboard shows all past appointments with status (`completed`, `no_show`, `cancelled`)
- For appointments in `prescription_issued` state, a "Download Prescription" button is shown
- Click renders a PDF client-side from stored prescription JSON; triggers browser download
- The PDF is itemised: each catalogue medicine shows its admin-configured price and the prescription shows a computed total. Free-text medicines not in the catalogue are shown as "not priced" and excluded from the total, with an "N item(s) not priced" note. The patient can use this to source the medicines and pay independently, or order them in-app via the Medicine Ordering Module (§6, separate scope)
- If doctor issues additional prescriptions for the same appointment (corrections), all are visible chronologically, each downloadable separately
- Prescription remains downloadable indefinitely (no expiry). v1 has no patient-initiated account-deletion flow — patient PII and prescriptions are retained indefinitely. Deletion path is a v1.1 deferred feature (see §5.1).

**P8. Book for someone else**
> *As a patient, I want to book a consultation for a family member using my account.*

- During booking, a "Who is this consultation for?" field is shown with options: `Myself` (default) | `Someone else`
- If `Someone else` selected: form expands to capture patient name, age, relation
- Doctor view shows both account holder name and actual patient name distinctly
- The prescription PDF is issued in the actual patient's name (account holder name when "Myself"; the captured name + age + relation when "Someone else"). See §3.5 for the rendering rule; the doctor's prescription builder does not re-enter this — it is auto-pulled from the appointment record.

**P9. View upcoming appointments**
> *As a patient, I want to see my confirmed upcoming appointments in one place so I can prepare and join the call on time.*

- Patient dashboard has an "Upcoming" section listing all appointments in `confirmed` or `in_progress` state, sorted by slot time ascending
- Each row shows: doctor name + photo, slot date/time in `Asia/Karachi`, "for: [actual patient]" line if booked-for-someone-else (per P8), consultation fee paid, "Join Call" button (per P5), and a "Cancel" link (per P6)
- "Join Call" button is disabled until 10 minutes before slot start, matching the activation rule in P5 and D2
- After slot completion, the appointment moves out of "Upcoming" into the "Past appointments" view referenced in P7 (visible there with its terminal state — `completed`, `prescription_issued`, `patient_no_show`, etc.)
- Empty state shows "No upcoming appointments — Browse doctors" with the link routing to the public doctor listing (P1)



#### Dermatologist stories

**D1. Set weekly availability**
> *As a doctor, I want to set my recurring weekly schedule so patients can only book when I'm available.*

- Doctor panel has an "Availability" page with a weekly grid (Sun–Sat × hours)
- Doctor selects time blocks per day (e.g., Mon/Wed/Fri 6pm–9pm)
- Saved availability is recurring (applies every week until changed)
- Slots are auto-generated in 30-minute increments within each block
- If doctor tries to delete or modify a block that contains confirmed future bookings: warning shown, must cancel each booking individually before block can be removed

**D2. View today's appointments**
> *As a doctor, I want to see today's appointments in one view with patient names and join links.*

- Doctor dashboard default view shows today's appointments sorted by slot time
- Each row displays: slot time, patient name (and "for: [actual patient]" if booked-for-someone-else), reason/notes if any, "Join Call" button
- "Join Call" activates 10 minutes before slot start; opens the video room
- Past appointments visible under a separate "History" tab

**D3. Join the consultation**
> *As a doctor, I want to join the call with one click without dialing in.*

- "Join Call" button opens the video room in the browser
- Same room ID as the patient (appointment-scoped — impossible to join the wrong room)
- Tested on desktop Chrome/Firefox/Safari and Android Chrome
- If patient is already in the room, doctor joins immediately
- Session has a hard cutoff at slot end + 5 minutes (room expires); soft warning shown to doctor at 5 minutes remaining

**D4. Build a prescription**
> *As a doctor, I want to build a structured prescription after the call so the patient can download it as a PDF.*

- Prescription builder accessible from the appointment row after consultation marked `completed`
- The builder displays a **read-only patient identification header** above the medicine list: actual patient name (account holder name if booking is for self; otherwise the "Someone else" name + age + relation captured in P8). The doctor confirms the patient identity by reading this header before submitting; the doctor does not type the patient name.
- Form structure:
  - Add medicine: search/select from medicine catalogue (with free-text fallback for medicines not in catalogue). The builder shows a **running total** computed from each catalogue medicine's admin-set price (§A2); free-text medicines carry no price, are flagged "not priced", and are excluded from the total
  - Per medicine: dosage, duration, instructions (e.g., "1 tablet twice daily, after meals, for 7 days")
  - General notes (free-text, optional)
  - Follow-up date (optional)
- Submit creates an immutable prescription record linked to the appointment
- Patient sees the prescription in their dashboard within 60 seconds of submit
- "Prescription ready" email sent to patient with link to dashboard (no PDF attached in v1)
- If doctor needs to fix an error: issues a **new prescription** for the same appointment (no edit to the original); patient sees all prescriptions chronologically

**D5. Cancel a confirmed appointment**
> *As a doctor, I want to cancel an appointment when I can't make it.*

- Cancellation button on each confirmed appointment in doctor panel
- Reason field required (free-text, internal — shown to admin only)
- On submit: appointment marked `doctor_cancelled`, refund automatically initiated to patient's original payment method (refund amount = amount paid minus the payment-gateway transaction fee, per P6), apology email sent to patient with offer to rebook
- Doctor cancellation has no time-window restriction (can cancel even <2hr before)

#### Admin stories

**A1. Onboard a new doctor**
> *As an admin, I want to add new dermatologists to the platform.*

- Admin panel "Doctors" page with "Add Doctor" form
- Form fields: full name, PMC number, email, phone, profile photo, bio, specialization, consultation fee, weekly availability template (optional starting schedule), **initial password** (set by admin and shared with the doctor out-of-band per DA1 below)
- **Profile photo constraints:** JPEG / PNG / WebP only; max 2 MB; SVG and other formats rejected at upload. (Storage location, processing, and serving are architecture decisions.)
- New doctor is created in `pending` state until admin manually toggles to `active`
- Active doctors appear in the public listing immediately
- Admin can deactivate a doctor at any time (see §4.4 row 39: existing confirmed appointments are honored, future bookings are blocked)

**A2. Manage medicine catalogue**
> *As an admin, I want to add, edit, and deactivate medicines that appear in the prescription builder.*

- Admin panel "Medicines" page with searchable list
- Add medicine: name, generic name (optional), common dosage forms (tablet, cream, syrup, etc.), and **unit price in PKR** (admin-configured; used to compute the prescription total in D4 and the order total in the Medicine Ordering Module, §6)
- Edit existing medicines, including price (renames and price changes propagate to the doctor's prescription-builder view; do not affect existing prescriptions, which are immutable and store a snapshot of the medicine name, dosage, and price at issue-time per §3.3 #5)
- Deactivate a medicine: removes from the prescription-builder dropdown but does not affect existing prescriptions

**A3. Monitor system health**
> *As an admin, I want to see when payments, refunds, or emails fail so I can intervene.*

- Admin dashboard shows alert feed for:
  - Payment-webhook reconciliation mismatches
  - Refund API failures
  - Transactional-email send failures (after retry exhaustion)
  - Appointments in `awaiting_prescription` state >12 hours
  - Unhandled application exceptions (sourced from the error-tracking tool named in §3.6)
- Each alert links to the relevant appointment/payment record
- Admin can manually re-trigger **emails only**. Refunds are **not** manually re-triggered from the app: on a refund-API failure the platform auto-retries with exponential backoff and, after retries are exhausted, raises an admin alert; the admin then resolves the refund out-of-band in the payment aggregator's own dashboard, and the platform reconciles the final status. Idempotency (§3.3 #10) makes out-of-band resolution safe

**A4. Edit, deactivate, and reactivate a doctor**
> *As an admin, I want to edit a doctor's profile and toggle their active status so I can keep listings current and offboard cleanly when needed.*

- Doctor edit page exposes the same fields as A1's add form **except** PMC number and email, which are immutable post-creation
- Editable: full name, phone, profile photo (same JPEG/PNG/WebP, max 2 MB constraints as A1), bio, specialization, consultation fee, weekly availability template
- **Consultation-fee changes never affect existing appointments.** The `feeAtBooking` snapshot rule from §3.3 #6 governs; the edit page shows a one-line note confirming this
- Renaming a doctor never alters historical appointments or prescriptions per §3.3 #3
- Deactivate action removes the doctor from the public listing immediately and blocks all new bookings; **existing `confirmed` future appointments are kept and honored — they are not cancelled** (client decision: bookings already made must stand). The doctor's photo + bio remain visible in upcoming- and past-appointment views for patients who have appointments or prescription history under that doctor
- Deactivate confirmation modal shows a **warning with the count of upcoming `confirmed` appointments that will remain on the doctor's calendar**, so the admin can decide whether to proceed. Deactivation itself cancels nothing and issues no refunds
- If the doctor genuinely cannot serve those appointments (e.g., PMC license revoked), the admin cancels them individually via the doctor-cancel flow (D5) — each issuing a refund net of gateway fee + apology email per policy #5
- Reactivate restores the doctor to the public listing using their saved availability template

**A5. Search records & audit log (unified)**
> *As an admin, I want one place to look up appointments, payments, and the full audit trail — by patient, doctor, or reference — so I can resolve support cases with a reliable record of what happened.*

- A single admin "Records & Audit Log" page replaces the separate appointment/payment-search and audit-log views; the overlapping information lives in one place with a superset of filters
- Filters: patient email or phone, doctor name, appointment ID, payment reference number, user (patient or doctor) ID or email, event type, actor type (`patient` | `doctor` | `admin` | `system`), and date range
- Record rows show: appointment ID, slot date/time, patient name (and "for: [actual patient]" if applicable), doctor name, current state, amount paid, payment reference, refund reference (if any)
- Each audit entry shows: timestamp in `Asia/Karachi`, event type, actor type, actor identity, target record reference, and optional reason
- Event coverage matches §3.6 (appointment state transitions, auth events, payment events, refund events)
- Clicking a row opens an appointment detail view showing the full state-transition history (sourced from the §3.6 audit log) and any linked prescriptions
- From the detail view, admin can manually re-trigger **emails only** (per A3) and mark an appointment as `disputed` (per §4.4 #10); refunds are never re-triggered in-app (§A3, §3.3 #10)
- The view is **read-only** with respect to records — consistent with §3.6's append-only convention; no update or delete UI is exposed. Mutations (email re-trigger, mark disputed) are themselves recorded as admin-actor entries in the audit log
- Route is reachable only by the admin role per DA6; no patient or doctor surface exposes this view

#### Doctor and admin authentication (v1 — minimal, shared login)

**DA1. Doctor account creation by admin.** When admin creates a doctor via A1, the admin sets an initial password in the same form. The admin shares the password with the doctor out-of-band (WhatsApp, phone, or in person). v1 has no email-token "set your password" flow for doctors.

**DA2. Shared login surface.** Patients, doctors, and the admin all log in at the same `/login` route. The user record carries a `role` field with values `patient` | `doctor` | `admin`. On successful login, the system routes by role: `patient` → patient dashboard, `doctor` → doctor panel, `admin` → admin panel.

**DA3. Forced first-login password change for doctors.** On a doctor's first successful login, the doctor must change the password before reaching the doctor panel. Tracked via a `mustChangePassword: true` flag on the user record, cleared on successful change.

**DA4. Admin bootstrap.** A single admin account is created via a one-off bootstrap script run against production on first deploy. The script's path and usage is documented in the deploy runbook. No additional admins can be created in v1; there is no admin self-signup and no "admin creates admin" UI.

**DA5. Doctor password recovery (manual).** No self-service reset for doctors in v1. If a doctor forgets the password, the doctor contacts the admin out-of-band; the admin resets the password from the doctor edit page (A1 panel) and shares the new password out-of-band. After reset, `mustChangePassword` is set to true so the doctor changes it on next login.

**DA6. Role-based authorization.** Every authenticated server route checks the session's `role` and rejects requests outside the allowed roles. The §3.6 authorization rules (patient PII access, doctor schedule access, admin-only routes) are enforced through this single mechanism, not duplicated in route bodies.

### 2.3 Non-Goals (explicitly NOT in v1)

| Not in v1 | Why deferred |
|---|---|
| SMS / WhatsApp reminders | Email-only is sufficient to validate the launch hypothesis |
| Lab test booking | Requires third-party lab integrations; not part of core consultation loop |
| Medical records history | Valuable but not needed for first booking validation |
| iOS / Android native app | Mobile-responsive web is sufficient for v1 |
| Urdu language | High value but significant scope; deferred to v1.2 |
| AI skin diagnosis | Future capability; requires regulatory consideration |
| Instant / on-demand calls (live queue) | Requires real-time infrastructure; added in v1.1 |
| Multi-city / multi-specialty | Dermestha is dermatology-only by design |
| Pre-consultation photo upload | Deferred to v1.1 — scope/cost trade-off for v1 |
| DRAP/PMDC regulatory compliance layer | Out of scope; flagged as risk |
| Dermestha wallet / loyalty | Refunds go to original payment in v1; wallet considered v1.2+ |
| Family profiles (sub-accounts) | "Who is this for?" field covers ~95% of cases in v1 |
| Patient account deletion / data-export flow | No in-app deletion path in v1; PII retained indefinitely. Privacy and operational risk acknowledged; resolved in v1.1. |
| ToS / Privacy versioning and re-prompt-on-update | v1 records a single sign-up acceptance only. Re-prompting users on policy version bumps is a v1.1 deferred feature. |
| Doctor email-verified password setup, doctor self-service reset | Out-of-band admin-mediated flow is sufficient for 3–5 launch doctors. |
| In-app medicine ordering, payment & delivery | Specified as a separate module (§6), scoped/costed/timelined separately from the v1 build. v1 ships only medicine prices + prescription total + self-pay PDF. |

---

## 3. Technical Specifications

This section describes what the platform must do, the data invariants it must preserve, the responsibilities of each external integration, and the security/privacy posture. It does **not** prescribe the technology stack, deployment topology, schema design, or module layout — those are the architecture skill's outputs.

### 3.1 Architecture Overview (logical)

This is a stack-agnostic component-and-flow sketch. The `architecture` skill is responsible for technology selection, deployment topology, schema design, and module layout (see §3 preamble).

**Logical components**

- **Patient surface** — mobile-browser web app: discovery, booking, payment redirect handoff, video join, dashboard (upcoming + past appointments), prescription download.
- **Doctor surface** — desktop-first web app: availability grid, today's appointments, video join, prescription builder, cancellation.
- **Admin surface** — desktop web app: doctor onboarding (A1) + edit/deactivate (A4), medicine catalogue (A2), alert feed (A3), unified records & audit-log search (A5).
- **Application core** — owns the appointment state machine (§4.3), the data integrity invariants (§3.3), idempotent payment-intent creation, slot-lock lifecycle, refund orchestration, prescription immutability, role-based authorization (DA6), and the append-only audit log.
- **External integrations** — payment aggregator (hosted checkout + signed webhooks + refund API + reconciliation query), video provider (per-appointment isolated rooms + time-bound participant tokens), transactional email provider (six trigger types).

- **Reconciliation worker** — hourly job that queries the aggregator for unconfirmed payments over the last 24h and reconciles missed webhooks (§4.4 #6).
- **Notification worker** — schedules and dispatches the six email trigger types with exponential-backoff retry and admin alert on final failure (§3.4 row 3).


**Primary data flows**

1. **Booking → payment → confirmation.** Patient picks slot → app core locks slot for 10 min → redirect to aggregator hosted checkout → patient pays → signed `payment.success` webhook → app core verifies signature → appointment + payment record commit atomically (§3.3 #2) → confirmation email enqueued.
2. **Reconciliation safety net.** Hourly worker → aggregator reconciliation query → for each unconfirmed payment with a successful aggregator status, app core completes the same atomic commit as the webhook path → admin alert on mismatch.
3. **Consultation → prescription.** Slot start − 10 min → patient/doctor `Join Call` activates → video provider issues time-bound participant tokens scoped to the slot window → call completes → doctor opens prescription builder → submit creates immutable prescription record linked to the appointment (§3.3 #4) → "prescription ready" email enqueued → patient downloads PDF rendered client-side from stored JSON (§3.5).
4. **Cancellation → refund.** Patient or doctor cancels → app core determines refund eligibility and amount (net of gateway fee, policy #5) → idempotent refund-API call to aggregator → reference number stored on the appointment → patient dashboard shows status → on transient failure the call auto-retries with backoff; after retries are exhausted an admin alert is raised and the refund is resolved out-of-band in the gateway dashboard (§3.3 #10, edge case #30).
5. **Deactivation.** Admin deactivates doctor (A4) → app core sets `active=false` → doctor is removed from the public listing and new bookings are blocked → **existing `confirmed` appointments are left intact and honored** (no cascade, no refunds; §3.3 #9). To offboard a doctor who cannot serve, the admin cancels each affected appointment individually via the `doctor_cancelled` flow (D5).

**Cross-cutting concerns**

- **Authorization** — a single role-based middleware (DA6) gates every authenticated route; frontend role-routing is convenience only and the server is the enforcement boundary.
- **Audit log** — every state transition and operational action flows through the same append-only log (§3.6); an admin-only query API backs A5.
- **Timezone** — all UI in `Asia/Karachi`; storage in UTC; Pakistan does not observe DST.
- **Same-origin** — patient, doctor, and admin surfaces share one domain; frontend and backend are same-origin (§3.2).

### 3.2 Platform constraints

The platform must satisfy the following constraints. Architecture decisions are bounded by these.

- **Patient surface runs in a mobile browser without an app install.** Must work on Chrome (Android 10+) and Safari (iOS 14+) over Pakistani 3G.
- **Payment coverage:** must accept cards, JazzCash, Easypaisa, and bank transfer through a Pakistan-compatible payment aggregator that supports (a) hosted checkout, (b) signed inbound webhooks for success/failure, (c) refund initiation via API, and (d) a reconciliation query for unconfirmed-payment status over the last 24 hours.
- **Video:** must use a browser-based WebRTC provider with isolated rooms per appointment, time-bound participant tokens, and tested performance on Pakistani 3G.
- **Email:** must use a transactional email provider with retry/backoff and bounce/failure signal.
- **Single domain.** Patient, doctor, and admin surfaces all live on the same domain. The frontend and backend are same-origin (no CORS).
- **Solo-dev MVP economics:** keep total monthly infrastructure cost at launch under roughly USD 50 at the planned 100 consultations/week scale. This rules out per-component multi-region setups, dedicated databases, or per-environment paid tiers.

### 3.3 Data integrity requirements

These invariants are non-negotiable regardless of the chosen storage technology. Architecture picks the mechanism (uniqueness constraints, transactions, schema validation, snapshotting).

1. **Slot double-booking is impossible at the storage layer.** Application-level check-then-write is explicitly insufficient. A second attempt to book the same `(doctor, slot-time)` must fail at write time, not at validation time.
2. **Booking confirmation and the corresponding payment record commit atomically.** Either both persist or neither does.
3. **Doctor identity on past appointments is durable across renames.** Renaming a doctor must not corrupt or alter any historical appointment or prescription record. Architecture must not denormalize the doctor name into the appointment record.
4. **Submitted prescriptions are immutable.** After a prescription is submitted, no update or delete path is exposed to the doctor, the admin, or any internal API. Corrections are issued as new prescriptions linked to the same appointment.
5. **Medicine name, dosage, and price are snapshotted on the prescription at issue-time.** Later renames, price changes, or deactivations in the catalogue do not change what an existing prescription shows or the total it displays.
6. **Consultation fee is snapshotted on the appointment at confirmation.** `feeAtBooking` is captured when the appointment moves to `confirmed`; later changes to the doctor's `consultationFee` never affect the existing appointment's billed amount, refund amount, or revenue accounting.
7. **Payment-intent creation is idempotent** on `(patient, slot)` so double-submits or retries cannot produce two parallel payment intents for the same booking attempt.
8. **Doctor PMC number and email are immutable post-creation.** Once a doctor record is created via A1, neither field can be updated through any API — admin, doctor, or internal. Other doctor fields (name, phone, photo, bio, specialization, fee, availability) remain editable per A4.
9. **Deactivation preserves existing appointments.** When admin deactivates a doctor (A4), the system sets the doctor's `active=false` flag — which removes them from the public listing and blocks all new bookings — and **leaves every existing `confirmed` appointment untouched and honored**. Deactivation performs no cancellation and no refund orchestration; there is no cascade, and therefore no half-deactivated state to recover from. A doctor who genuinely cannot serve is offboarded by the admin cancelling each affected appointment individually via the `doctor_cancelled` flow (D5), each refund net of gateway fee per policy #5.
10. **Refund initiation is idempotent.** Each appointment carries a single refund idempotency key, so an automatic retry, the reconciliation path, or a manual refund issued by an admin in the gateway dashboard can never produce a second settlement for the same refund.

### 3.4 Integration responsibilities

The platform integrates with three external services. The PRD specifies what each integration must do; architecture picks the vendor and the endpoint shapes.

| Integration | Responsibility |
|---|---|
| **Payment aggregator** | Accept payments via cards + JazzCash + Easypaisa + bank transfer through a hosted checkout. Deliver signed webhooks on `payment.success` and `payment.failed`; the platform must reject any webhook whose signature is missing, invalid, or expired. Support refund initiation via API with the response containing a reference number returned to the patient dashboard; refund calls are idempotency-keyed and retried with exponential backoff on transient failure, with an admin alert raised after retries are exhausted (see §3.3 #10, §A3, edge case #30). Support a reconciliation query that lists unconfirmed payments over the last 24 hours; the platform runs this hourly to catch missed webhooks. |
| **Video provider** | Per-appointment isolated rooms (room identity tied to the appointment so participants cannot join the wrong call). Time-bound participant access tokens scoped to the slot window (valid from slot-start − 10 min to slot-end + 5 min). Hard cutoff at slot-end + 5 min. Browser-only join. |
| **Transactional email** | Six trigger types: booking confirmation, 24-hour reminder, 1-hour reminder, prescription-ready notification, refund confirmation, cancellation apology (doctor-initiated cancel). Retry with exponential backoff on transient failure, admin alert on final failure. **No PDF attachments in v1** — the prescription-ready email contains a link to the dashboard. |

### 3.5 Prescription handling

- **Source of truth:** structured prescription data, keyed to the appointment, containing the medicine list, per-medicine dosage, instructions, and **price snapshot at issue-time plus a computed prescription total** (free-text medicines not in the catalogue carry no price and are excluded from the total), optional general notes, optional follow-up date, doctor metadata at issue-time, and the patient identification snapshot (see below).
- **API:** the platform exposes a read endpoint returning this structured prescription as JSON; updates and deletes are not exposed.
- **Patient identification on the rendered PDF.** The PDF auto-pulls patient identification from the appointment record at render time: the account holder's name when the booking was for self, or the "Someone else" name + age + relation captured at booking time (P8). The prescription builder (D4) shows this block as a read-only header so the doctor confirms identity before submit. The doctor never re-types the patient's name.
- **Rendering in v1:** the patient's browser renders a PDF from the JSON when the patient clicks Download — itemised with per-medicine prices and the computed total. The "prescription ready" email contains a dashboard link, not a PDF attachment.
- **Architectural seam:** rendering must remain isolated behind a single replaceable boundary so the future move to server-side rendering (v1.2+) does not require changes to the prescription data model, the read API contract, or any business logic.

### 3.6 Security & Privacy

- **HTTPS everywhere.**
- **Authentication:** session cookies must be HTTP-only, Secure, and at minimum SameSite=Lax. Passwords are hashed; plaintext storage is forbidden.
- **Authorization (single mechanism):**
  - Patient PII (name, email, phone, prescription content) is accessible only to the patient account owner, the doctor assigned to the relevant appointment, and admin. A patient can list their own `confirmed` and `in_progress` appointments (P9) and read details of any appointment where they are the account holder; the assigned doctor can read the appointments scheduled to them (D2); admin can read any appointment (A5).
  - Doctor schedule and contact info is accessible only to that doctor and admin.
  - Admin-only routes and doctor-scoped routes are enforced server-side through the role middleware described in DA6 — not duplicated in individual route handlers, and not enforced only on the frontend.
- **Payment data isolation:** the platform never sees card numbers or wallet credentials. All sensitive payment data is handled by the payment aggregator's hosted checkout.
- **Video access:** participant tokens are appointment-scoped and time-bound (slot-start − 10 min through slot-end + 5 min).
- **Audit log:** every appointment state transition (`confirmed`, `cancelled_refunded`, `cancelled_no_refund`, `doctor_cancelled`, `completed`, `prescription_issued`, `patient_no_show`, `doctor_no_show`) is logged with timestamp, actor type (patient/doctor/admin/system), actor identity, and an optional reason. Auth events (successful login, password change, password reset by admin), payment events (intent created, success, failure), refund events (initiated, retried, settled, failed), and admin operational actions (doctor edits and deactivate/reactivate via A4; manual email re-trigger via A3/A5; `disputed` flag set/clear via A5) flow through the same log. Retention in v1: indefinite. Access: admin-only. Append-only by application convention — no update or delete path is exposed. A filtered query API (filters: appointment ID, user ID/email, event type, actor type, date range) exposes entries to the admin role per DA6 to back A5; no write or delete API is exposed. Schema is an architecture decision.
- **Disputed marker:** an appointment can be flagged `disputed=true` by admin via A5 when a chargeback (§4.4 #10) or unresolved patient claim (§4.4 #28) is recorded. This is a **flag on the appointment record, not a state transition** — the §4.3 state machine is unchanged, and a `disputed` flag can attach to any terminal state (`completed`, `prescription_issued`, `patient_no_show`, `cancelled_refunded`, etc.). Setting and clearing the flag are admin-only actions, audit-logged per the audit-log bullet above. No automated behavior is triggered by the flag in v1; it exists solely as a support-workflow marker.
- **Patient PII retention and deletion:** v1 retains all patient PII and prescription content indefinitely. There is no in-app account-deletion flow in v1 (deferred to v1.1, see §5.1). Privacy and regulatory implications are flagged in §5.2.
- **Consent at sign-up:** per P2, a mandatory acceptance of Terms of Service and Privacy Policy is recorded at sign-up with timestamp. The `/legal/terms` and `/legal/privacy` page contents are M4 deliverables. Versioning and re-prompt-on-update are deferred to v1.1.
- **Webhook authentication:** every inbound payment webhook is signature-verified; missing or invalid-signature payloads are rejected and logged to the admin alert feed.
- **DRAP/PMDC compliance:** explicitly out of scope per §2.3 and §5.2. v1 is positioned as an MVP for hypothesis validation, not a regulated medical service.

---

## 4. Appointment Loop — Locked Policies

The appointment loop is the single most load-bearing module in v1. All policies were locked after competitive research across Ola Doc, Marham, Sehat Kahani, Practo, Teladoc, MDLive, and Apostrophe.

### 4.1 Policy decisions

| # | Policy | Decision | Source / rationale |
|---|---|---|---|
| 1 | **Payment timing** | At booking. Patient pays → on payment success, slot is confirmed and confirmation email sent. | Universal pattern across all researched platforms. Minimises no-shows; aligns Pakistani patient expectations from Ola Doc/Marham. |
| 2 | **Slot lock during payment** | 10 minutes. Slot reserved while patient is in the payment flow; released if no success webhook within the window. | Accommodates JazzCash/Easypaisa OTP flows on 3G. Tighter risks legitimate failures; looser causes visible "unavailable" gaps. |
| 3 | **Booking minimum lead time** | Platform-configurable (admin-set; default 1 hour, supported down to 30 minutes). The live-queue flow that removes lead time entirely is still v1.1. | Flexibility requested for v1; gives the doctor some prep time without forcing a long wait. When the configured lead time is under 1 hour, the 1-hour reminder is simply skipped (P4 short-lead rule). Client expects a live-booking pattern long-term — already on roadmap. |
| 4 | **Cancellation policy** | Free cancel ≥2 hours before slot start. No refund inside the 2-hour window. Slot stays blocked on `cancelled_no_refund` (doctor's calendar remains committed). | Matches Marham and Practo exactly. Stricter (24hr) too punishing for Pakistani audience; looser (Ola Doc's 1hr) hard to refill. Keeping the slot blocked is what gives the policy its bite. |
| 5 | **Refund destination and amount** | Original payment method via the payment aggregator's refund API. Processing 5–7 working days. Status visible in dashboard. **Refund amount = amount paid at booking minus the payment-gateway transaction fee** — the patient does not receive the gateway fee back. This is shown explicitly in the cancellation modal and the refund-status view. | Matches Practo, Teladoc, MDLive, Apostrophe on flow. The "net of gateway fee" choice keeps unit economics intact at the cost of a small patient-facing explanation. Wallet considered v1.2+. |
| 6 | **Reschedule** | Cancel and rebook (Practo model). No separate reschedule flow in v1. | Simplest to build, simplest to explain. Eliminates edge cases around cross-doctor reschedules, partial refunds, etc. |
| 7 | **No-show grace** | 15 minutes after slot start. Patient absent at slot+15 → `patient_no_show` (no refund). Doctor absent at slot+15 → `doctor_no_show` (full refund minus gateway fee + apology email). | Industry standard in telemedicine. |
| 8 | **Pre-consultation photo upload** | Deferred to v1.1+. v1 satisfies "visual examination" via good-lighting prompts + live video. | Image storage + PII handling adds ~3–5 days dev; not load-bearing for hypothesis validation. |
| 9 | **Prescription edit policy** | Never editable after submit. Doctor issues a **new prescription** for the same appointment if a change is needed. Patient sees all prescriptions linked to the appointment, chronologically. | Strongest audit story; cleanest for future DRAP/PMDC compliance; matches the immutability expectation of medical documents. |
| 10 | **Booking-for-someone-else** | Account holder = patient by default + editable "who is this for?" field (Myself / Someone else → name, age, relation). Doctor sees both account holder and actual patient distinctly. Prescription PDF is auto-issued in the actual patient's name; the doctor's builder shows this as a read-only header (D4). | Covers ~95% of real-world use without a full sub-account system. Family profiles deferred to v1.2+. |

### 4.2 Defaulted (no debate, documented for completeness)

- **Slot duration:** 30 minutes
- **Slot-end buffer:** 5 minutes (room hard cutoff at slot-end + 5min; soft warning to doctor at 5 min remaining)
- **Awaiting-prescription alert threshold:** doctor/admin reminder if no prescription submitted within 12 hours of consultation completion
- **Email reminders:** 24hr + 1hr before slot start (short-lead skip rule documented in P4; either reminder is skipped when the configured booking lead time leaves no room for it)
- **Timezone:** all UI in `Asia/Karachi` (no DST observance in Pakistan); storage in UTC
- **Cancellation/refund channel:** in-app only — no phone or email cancellation
- **Slot generation:** 30-min increments within doctor's set availability windows; back-to-back allowed, no inter-slot buffer in v1

### 4.3 Appointment State Machine

```
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

Refund amounts on `cancelled_refunded`, `doctor_cancelled`, and `doctor_no_show` are net of the payment-gateway transaction fee per policy #5.

Note: a `disputed` boolean flag (set via A5) is orthogonal to this state machine — it can attach to any terminal state and does not alter transitions. See the Disputed-marker bullet in §3.6.

### 4.4 Edge Case Catalogue

40 edge cases catalogued across 7 categories. Each is tagged:
- **(A)** Architecturally handled — covered by design or invariant in §3.3
- **(P)** Policy-handled — covered by one of the 10 locked policies in §4.1
- **(K)** Known gap, manual handling in v1 — documented but not automated

Resolution language describes the *outcome* and the *constraint to be enforced*, not the implementation mechanism (architecture's call).

#### Booking flow (before payment)

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 1 | Two patients click "book" on the same slot simultaneously | A | Storage-layer uniqueness on slot identity (§3.3 #1). Second click fails fast with "slot just taken" error. |
| 2 | Patient starts booking, abandons mid-flow | P | Slot lock expires after 10 min (policy #2) and is released. |
| 3 | Patient on slow 3G — slot expires before payment completes | P | Same as #2. 10-min lock chosen to accommodate this. |
| 4 | Doctor adds a new slot while patient is browsing | A | Frontend refreshes on focus; stale-data shows brief "slot no longer available" error. Acceptable friction. |

#### Payment flow

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 5 | Patient double-clicks "Pay" — two payment attempts | A | Idempotent payment-intent creation on `(patient, slot)` (§3.3 #7); aggregator also handles duplicate detection. |
| 6 | Payment succeeds but webhook never reaches server | A | Hourly reconciliation query against the aggregator for unconfirmed payments in the past 24h; reconciles state and alerts admin on mismatch. |
| 7 | Payment fails — patient retries inside lock window | A | Same locked slot held; patient retries; second attempt triggers a fresh payment intent. |
| 8 | Patient closes browser during payment redirect | A | The verified webhook is the source of truth — if it fires success, booking is confirmed and email sent regardless of browser state. |
| 9 | Patient pays twice (e.g., refreshes success page) | A | Idempotency at intent + aggregator duplicate detection. |
| 10 | Chargeback weeks later | K | Admin tool marks appointment as `disputed` via A5 detail view. No automated handling in v1. |

#### Pre-consultation (after confirmed, before call)

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 11 | Patient cancels inside cancel window | P | Auto-refund initiated to original payment, net of gateway fee (policy #5). |
| 12 | Patient cancels outside cancel window | P | Confirmation modal; on confirm, appointment marked `cancelled_no_refund`. **Slot stays blocked on the doctor's calendar; no refund issued** (policy #4). |
| 13 | Doctor cancels a confirmed appointment | P | Refund initiated (net of gateway fee); apology email to patient (policy #5 + state machine). |
| 14 | Doctor wants to change availability with existing bookings | A | UI prevents deleting a window containing confirmed bookings; doctor must cancel each booking first. |
| 15 | Reminder email fails to send | A | Provider retries with exponential backoff (3×); admin alerted on final failure. |
| 16 | Patient wants to reschedule | P | Cancel + rebook (policy #6). |

#### During consultation

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

#### Post-consultation

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 26 | Doctor doesn't submit prescription within 12 hours | A | Admin alert; appointment status `awaiting_prescription`; doctor reminded via dashboard. |
| 27 | Doctor wants to edit prescription after submit | P | Issues a new prescription; original immutable; patient sees both (policy #9). |
| 28 | Patient claims consultation didn't happen | K | Manual support resolution; admin investigates via A5. No automated dispute flow in v1. |
| 29 | Patient loses prescription PDF | A | Always re-downloadable from dashboard; PDF rendered on demand from stored data. |

#### Refunds

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 30 | Refund API call fails | A | Transient failures auto-retry with exponential backoff (idempotency-keyed, §3.3 #10). On retry exhaustion: admin alert; admin resolves the refund out-of-band in the payment aggregator's dashboard; platform reconciles the final status. Patient notified of delay via email. No manual in-app refund retry. |
| 31 | Refund takes 5–7 days to reflect | A | Patient dashboard shows transparent status ("refund initiated 2 days ago, expected within 7 days") + gateway reference number. |
| 32 | Patient cancels + immediately rebooks inside cancel window | A | No penalty; treated as two independent operations (first cancel refunded, second booking standard flow). |

#### System-level

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 33 | Video provider outage during peak consultation hours | K | Status banner shown; patients/doctors offered reschedule + apology. No automatic fallback in v1. |
| 34 | Payment aggregator outage | A | New bookings blocked with banner; existing confirmed bookings unaffected. |
| 35 | Email provider outage | A | Reminders delayed; queue processed when service returns; admin alerted. |
| 36 | Timezone confusion | A | All UI in `Asia/Karachi`; storage in UTC. Pakistan doesn't observe DST. |

#### Privacy / safety

| # | Edge case | Tag | v1 handling |
|---|---|---|---|
| 37 | Booking for someone else (parent for child, child for parent) | P | "Who is this consultation for?" field captures actual patient name (policy #10). Prescription auto-pulls the actual patient name onto the PDF (§3.5). |
| 38 | Patient is a minor | K | Doctor uses clinical judgment; no platform enforcement in v1. |
| 39 | Doctor's PMC license revoked / admin deactivates a doctor | P | Past appointments untouched. **Existing `confirmed` future appointments are kept and honored — not auto-cancelled** (client decision). Future bookings are blocked and the doctor is removed from the public listing; photo + bio remain visible in upcoming- and past-appointment views for patients with appointments or prescription history under that doctor. The deactivate modal warns the admin with the count of upcoming appointments first. If the doctor genuinely cannot serve, the admin cancels each appointment individually via the `doctor_cancelled` flow (D5) — refund net of gateway fee + apology email. Triggered from A4. |
| 40 | Patient under another patient's account | A | Account-level auth; no cross-account access. |

---

## 5. Risks & Roadmap

### 5.1 Phased Rollout

#### MVP v1 (8 weeks, ~160 dev hours)

| Milestone | End of week | Deliverable |
|---|---|---|
| **M1 — Booking flow** | Week 2 | Patient sign-up (with ToS/Privacy acceptance), doctor listing, slot booking (no payment yet), confirmation email |
| **M2 — Video + Payments** | Week 4 | Full video consultation end-to-end (mobile-tested on 3G); payment flow working including verified webhooks and reconciliation cron |
| **M3 — Prescriptions** | Week 6 | Doctor builds prescription after call with read-only patient identification header; medicine catalogue carries admin-set prices and the builder shows a computed prescription total; patient downloads an itemised PDF (prices + total) from dashboard |
| **M4 — Launch-ready** | Week 8 | Admin panel (doctor onboarding with initial-password set, medicine catalogue with admin-set prices, alert feed), landing page, email automation, `/legal/terms` and `/legal/privacy` page content, full E2E QA |

#### v1.1 (2–4 weeks post-launch)

- **SMS / WhatsApp notifications** (same triggers as email, additional channel via SMS/WhatsApp Business API)
- **Live queue / spot booking** — doctors go "online", patients see online doctors and join a real-time queue without pre-booking. Removes the booking lead-time floor from v1.
- **Pre-consultation skin photo upload** — patient uploads 1–3 photos before call; doctor sees them in dashboard
- **Patient account deletion / data-export flow** — closes the v1 gap (P7, §3.6) of indefinite PII retention with no opt-out
- **ToS / Privacy versioning + re-prompt on update** — policy version bumps re-prompt users on next login
- **Doctor self-service password reset** (via email token) — closes the v1 manual-reset gap (DA5)

#### v1.2+ (later)

- **Server-side PDF generation** — enables email-attached prescriptions, signed/audited PDFs, immutable audit storage. PDF rendering boundary already isolated for a clean swap.
- **Dermestha wallet** — instant refunds via wallet credit; replaces 5–7 day refund flow as default; original-method refund kept as a fallback.
- **Family profiles / sub-accounts** — replaces "who is this for?" field with structured profile switching
- **Secondary bank gateway (UBL/HBL)** — added alongside primary aggregator; route card payments through bank gateway (~1% cheaper) while keeping the primary aggregator for wallets
- **Medicine Ordering Module** — first-party in-app ordering of prescribed medicines with home delivery; fully specified in §6 as a separately-scoped/costed module (supersedes the earlier "pharmacy partnership" idea)
- **Urdu language support**
- **Native iOS / Android apps** — reuse entire backend as-is
- **Additional dermatologists** — added via admin panel (no dev work needed)

### 5.2 Technical & Business Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Payment-aggregator merchant KYC delay (1–2 weeks) | High | High — blocks M2 milestone | Client starts merchant application immediately in parallel with dev; documented as Week 1 client deliverable |
| Video quality poor on 3G | Medium | High — breaks core promise | Explicit mobile-network testing in M2; vendor selected partly for known 3G performance |
| Doctor onboarding bottleneck — launch needs 3–5 derms | High | Critical — no launch without doctors | Client deliverable due Week 1: doctor profiles + availability for 3–5 derms |
| DRAP/PMDC regulatory exposure | Medium | High legally | Explicitly out of scope per §2.3; flagged as deferred risk; not mitigated in v1 |
| Indefinite patient PII / prescription retention with no in-app deletion path in v1 | Medium | Medium — privacy and PR risk; potential pressure from a data-protection regime | Documented as a v1.1 deliverable; client informed during onboarding via the Privacy Policy text |
| Prescription format has no clinical validation | Medium | Medium — patient safety | Free-text fields allow flexibility but no validation; doctor's clinical judgment is the sole safeguard in v1. Acceptable as MVP risk. |
| Refund delay (5–7 days) causes patient complaints | Medium | Low | Patient dashboard shows transparent refund status + gateway reference. Wallet (v1.2+) would mitigate. |
| Net-of-gateway-fee refund causes patient pushback | Low | Low | Cancellation modal and refund-status view explicitly explain the deduction. Reviewed post-launch; switchable to gross refund without architectural change if complaint rate is meaningful. |
| Video provider outage during peak hours | Low | High when it occurs | Status banner + reschedule offer. Known gap — no fallback video provider in v1. |
| Payment webhook delivery failures | Medium | High if undetected | Hourly reconciliation query against the aggregator; admin alerted on mismatch |
| Single-service deploy = no redundancy | Medium | Medium | Acceptable at v1 scale (~100/week); platform auto-restarts on crash; revisited when traffic justifies |
| Admin password / bootstrap compromise | Low | Critical | Bootstrap script is run once on first deploy; admin password is rotated immediately after bootstrap; admin account does not have an email-based password reset path in v1 |
| Out-of-band initial-password sharing for doctors leaks credentials | Medium | Medium | Forced password change on first login (DA3) limits exposure window to the doctor's first session |

---

## 6. Medicine Ordering Module (separate scope — NOT in the v1 8-week build)

> **Scope banner.** This module is documented here to lock the product decisions, but it is **not part of the v1 8-week / ~160-hour MVP**. It is a distinct module to be costed, timelined, and scheduled in a separate planning discussion (per the engagement model). v1 ships only the prescription-side prerequisites: admin-set medicine prices (§A2), the computed prescription total (D4), and the itemised, self-pay PDF (P7).

### 6.1 Summary

Patients can order the medicines on an issued prescription for home delivery, paying by **card** (via the existing payment aggregator) or **cash on delivery (COD)**. Dermestha calculates the order total from admin-configured medicine prices. **Fulfilment is operational:** Dermestha staff arrange delivery through a courier (Leopards, TCS, or equivalent) and update order status manually. No courier API integration is required in this module's first cut.

### 6.2 User stories

**MO1. Order medicines from a prescription (patient)**
> *As a patient, I want to order the medicines on my prescription so they're delivered to me.*

- An "Order medicines" action appears on any `prescription_issued` prescription that has at least one priced (catalogue) medicine
- The order screen lists the prescription's catalogue medicines with quantities (defaulted from dosage × duration where derivable, otherwise editable), unit price, and a computed subtotal + delivery fee + total
- Free-text (non-catalogue) medicines cannot be ordered in-app; they are shown with a "buy at a pharmacy" note
- Patient enters a delivery address and contact phone
- Payment options: **card** (aggregator hosted checkout, same as booking) or **COD**
- On card-payment success (verified webhook) or COD confirmation, the order is placed and an order-confirmation email is sent
- Order is linked to the originating prescription and the patient account

**MO2. Manage and fulfil orders (admin)**
> *As an admin, I want to see and fulfil medicine orders.*

- Admin "Orders" page lists orders with: order ID, patient, linked prescription, items, total, payment method (card/COD), payment status, and order status
- Admin confirms stock/price, marks the order `dispatched` (records courier name + tracking reference, entered manually), then `delivered`
- Admin can cancel an order before dispatch; card orders are refunded via the existing refund path (idempotent, net-of-gateway-fee policy reused per §4.1 #5); COD orders simply close
- COD collection is reconciled manually by admin when the courier remits cash

### 6.3 Order state machine (proposed)

```
placed
  ├─ card: awaiting_payment ─► paid ─► confirmed
  └─ cod: ───────────────────────────► confirmed

confirmed ─► dispatched (courier + tracking ref) ─► delivered

confirmed / paid ─► cancelled   (card → refund initiated; cod → closed)
```

### 6.4 Pricing & data notes

- Order line prices are snapshotted from the catalogue at order-placement time (same snapshot discipline as prescriptions, §3.3 #5) so later catalogue edits never change a placed order
- Delivery fee is an admin-configured flat value in v1 of this module (per-zone pricing deferred)
- Orders, order items, and payment/refund references are audit-logged through the same append-only log (§3.6)

### 6.5 Integrations

- **Payment:** reuses the existing aggregator (hosted checkout, signed webhooks, refund API) — no new payment vendor
- **COD:** offline; no integration; reconciled manually
- **Courier:** operational/manual in the first cut (staff book Leopards/TCS and paste a tracking reference); a courier-API integration is a later enhancement

---

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| **PMC** | Pakistan Medical Commission — official medical licensing body |
| **DRAP** | Drug Regulatory Authority of Pakistan |
| **Slot lock** | 10-minute reservation on a slot during the patient's payment flow |
| **No-show grace** | 15-minute window after slot start before an appointment is marked as no-show |
| **Immutable prescription** | A submitted prescription cannot be edited; corrections require issuing a new linked prescription |
| **`feeAtBooking`** | Snapshot of the doctor's consultation fee taken at the moment the appointment is confirmed; never changes for that appointment thereafter |
| **`mustChangePassword`** | Flag on a user record (doctor or admin) requiring a password change before the next protected route is reached; set on creation and on admin reset, cleared on successful change |
| **`disputed`** | A boolean flag on an appointment record, set by admin via A5 when a chargeback or unresolved patient claim is recorded. Orthogonal to the §4.3 state machine. |
| **Medicine price snapshot** | The unit price copied onto a prescription (and onto a medicine order) at issue/placement time; later catalogue price changes never alter it (§3.3 #5). |
| **Refund idempotency key** | A per-appointment key ensuring a refund settles only once even across automatic retries, the reconciliation path, or an admin's out-of-band gateway action (§3.3 #10). |
| **Minimum booking lead time** | Admin-configurable gap required between "now" and a bookable slot's start; default 1 hour, supported down to 30 minutes in v1 (§4.1 #3). |

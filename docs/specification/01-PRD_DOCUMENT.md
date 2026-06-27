# 01 — PRD Document

| Field            | Value                                    |
| ---------------- | ---------------------------------------- |
| Document ID      | `01-PRD_DOCUMENT`                        |
| Status           | Canonical                                |
| Version          | 1.1                                      |
| Last updated     | 2026-06-28                               |
| Sources absorbed | `docs/product/PRD.md §1, §2.1, §2.3, §5` |
| Related docs     | 02, 07                                   |

---

## Index

1. [Problem statement](#1-problem-statement)
2. [Product description](#2-product-description)
3. [Objectives](#3-objectives)
4. [Core features](#4-core-features)
5. [Additional features (non-functional qualities)](#5-additional-features-non-functional-qualities)
6. [Success metrics / KPIs](#6-success-metrics--kpis)
7. [Roadmap & risks summary](#7-roadmap--risks-summary)

---

## Purpose

This is the stakeholder-facing product requirements document for Dermestha. It captures the problem being solved, what the product does, measurable success criteria, planned feature scope, and delivery roadmap — providing the single authoritative reference for anyone needing to understand what is being built and why.

---

## 1. Problem statement

Pakistani dermatology patients have no specialty-focused telemedicine platform. The dominant players (Ola Doc, Marham, Sehat Kahani, Shifa4U, Healthwire) are generalist marketplaces where skin care is one tab among 100–200 specialties. The booking flow, prescription format, and consultation UX are designed for the average specialty, not for skin examination.

Patients searching for a dermatologist filter through thousands of unrelated doctors, and the prescription experience is a generic upload rather than a structured, skin-treatment-aware document. No existing platform has tuned discovery, booking, consultation interface, or prescription builder specifically for dermatology.

---

## 2. Product description

Dermestha is a purpose-built specialty-boutique telederm platform for Pakistan. v1 ships a single end-to-end loop: patient discovers a curated dermatologist → books a paid slot → joins a live video consultation → receives a structured digital prescription downloadable as a PDF. Every UX choice — discovery, booking, consultation interface, prescription builder — is tuned for skin care. No general-purpose pivots, no irrelevant specialties.

The downloadable prescription is itemised with admin-configured medicine prices and a computed total, so a patient can pay and source the medicines independently. A separately-scoped Medicine Ordering Module (§6 of the PRD) will additionally let patients order prescribed medicines for home delivery; that module is not part of the v1 8-week build.

**Payment & lifecycle model (ADR-43).** v1 uses a **manual offline payment** model: patients pay by bank transfer to the clinic's account and submit a payment reference; the admin verifies it and confirms the booking. There is no in-app payment gateway, hosted checkout, or refunds — paid is paid, and any money movement (e.g. goodwill) is handled offline by the admin. The appointment lifecycle is a simplified **3-state model**: `pending` (booked, awaiting admin verification) → `confirmed`, with `cancelled` reachable from either; there is no in-app no-show or `completed` automation.

---

## 3. Objectives

1. **Validate demand for a specialty telederm loop** — confirm that Pakistani patients will discover, book, pay for, and complete a dermatology telemedicine consultation end-to-end.
2. **Achieve target landing-to-booking conversion** — demonstrate that the focused dermatology UX drives a conversion rate of ≥30% from unique landing visitors to completed bookings.
3. **Deliver reliable paid booking** — ensure slot double-booking rate is zero (enforced at the storage layer) and that offline bank-transfer payments are reliably verified and confirmed by the admin (manual model, no in-app gateway — ADR-43).
4. **Provide usable, itemised prescriptions** — ensure patients can download a structured, priced prescription PDF within 60 seconds of doctor submission, available indefinitely from the patient dashboard.
5. **Maintain core consultation reliability** — achieve ≥95% video-call join success on Pakistani 3G and ≥70% booking-to-completion rate.
6. **Launch within budget and timeline** — deliver the full v1 feature set in 8 weeks (~160 dev hours) at a monthly infrastructure cost under USD 50 at the planned 100 consultations/week scale.

---

## 4. Core features

- **Browse dermatologists** — public, unauthenticated listing of active doctors with fee, specialization, and next-available slot
- **Sign up / log in** — patient account creation with ToS/Privacy acceptance and secure session-based login; shared login route for all roles
- **Book & pay for a slot** — slot selection locks the slot on booking (a `pending` appointment); patient is shown bank-transfer instructions, transfers offline, and submits a payment reference; admin verifies and confirms (no in-app gateway or hosted checkout — ADR-43)
- **Reminders** — booking confirmation email on confirmation; 24-hour and 1-hour reminder emails before slot start (with short-lead skip rules)
- **Join video consultation** — browser-only video room, no app install; activates 10 minutes before slot start; tested on Chrome (Android 10+) and Safari (iOS 14+) over 3G
- **Cancel** — in-app cancellation that frees the slot; no in-app refunds in v1 (paid is paid; any money movement is handled offline by the admin — ADR-43)
- **View / download prescription** — patient dashboard shows past appointments; itemised PDF (per-medicine prices, computed total) rendered client-side and downloadable indefinitely
- **Book for someone else** — "Who is this for?" field captures actual patient name, age, and relation; prescription PDF auto-issued in the actual patient's name
- **View upcoming appointments** — dashboard section listing confirmed appointments with Join Call and Cancel affordances
- **Doctor availability** — doctor sets recurring weekly availability grid; slots auto-generated in 30-minute increments
- **Doctor today's appointments & prescription builder** — doctor dashboard shows today's schedule with Join Call links; prescription builder with medicine catalogue search, running total, and read-only patient identification header
- **Admin doctor onboarding** — add, edit, deactivate, and reactivate doctors; initial password set by admin
- **Admin medicine catalogue** — add, edit (including unit price in PKR), and deactivate medicines used in the prescription builder
- **Admin system-health alerts** — alert feed for submitted payment references awaiting review, email failures, overdue prescriptions, and unhandled exceptions
- **Admin payment review** — queue of `pending` appointments with submitted bank-transfer references; admin accepts (confirms the booking) or rejects (frees the slot)
- **Admin records & audit log** — unified searchable view of appointments and the full append-only audit trail; read-only with admin-only mutations (email re-trigger, accept/reject of pending bank-transfer payments)
- **Admin platform settings** — configurable minimum booking lead time (default 1 hour, down to 30 minutes) and bank-transfer payment details (account name/number, instructions) shown to patients

---

## 5. Additional features (non-functional qualities)

- **Mobile-browser / 3G responsiveness** — patient surface must work on Chrome (Android 10+) and Safari (iOS 14+) over Pakistani 3G; doctor listing page loads in ≤2 seconds on 3G
- **Secure cookie-session authentication** — session cookies are HTTP-only, Secure, and at minimum SameSite=Lax; passwords hashed; plaintext storage forbidden
- **Role-based authorization** — a single server-side role middleware (patient / doctor / admin) gates every authenticated route; frontend role-routing is convenience only
- **Append-only audit trail** — every state transition, auth event, payment event, and admin action flows through the same append-only audit log; no update or delete path exposed
- **Single-domain same-origin** — patient, doctor, and admin surfaces share one domain; frontend and backend are same-origin (no CORS)
- **Transactional email** — appointment-cadence triggers (booking confirmation, 24-hour reminder, 1-hour reminder, prescription-ready notification, payment-submitted admin alert, payment-not-received, cancellation) with exponential-backoff retry and admin alert on final failure
- **Manual offline payment (ADR-43)** — patients pay by bank transfer to the clinic's account and submit a reference; the admin verifies and confirms each booking. No in-app payment gateway, hosted checkout, signed webhooks, or refunds in v1
- **Solo-dev MVP cost ceiling** — total monthly infrastructure cost at launch under ~USD 50 at 100 consultations/week scale

---

## 6. Success metrics / KPIs

| #   | Metric                                             | Target          | Measurement                                                         |
| --- | -------------------------------------------------- | --------------- | ------------------------------------------------------------------- |
| 1   | Landing → booking conversion                       | ≥30%            | Web analytics: unique visitors / completed bookings                 |
| 2   | Booking → completion rate                          | ≥70%            | Confirmed bookings / consultations marked `completed`               |
| 3   | Video call join success on 3G                      | ≥95%            | In-app video-join telemetry, segmented by network type              |
| 4   | Payment confirmation rate (offline bank transfer)  | ≥90%            | Admin-accepted bookings / payment references submitted (ADR-43)      |
| 5   | Prescription availability after doctor submit      | ≤60s end-to-end | Time from doctor submit to first patient-side download availability |
| 6   | Slot double-booking rate                           | 0 (zero)        | Enforced at storage layer; verified by audit log                    |
| 7   | Refund initiation latency                          | — (deferred)    | No in-app refunds in v1; any money movement is handled offline (ADR-43) |
| 8   | First-page Time-to-First-Byte (Karachi mobile, 3G) | ≤2s             | Lighthouse + real-user metrics post-launch                          |

**Measurement instrumentation.** KPIs #1 (landing→booking conversion) and #3 (video-join success by network type) require funnel and video-join telemetry that is not part of the three core integrations. v1 scope must include a lightweight analytics capability that records, at minimum: landing-page visit, booking-started, booking-confirmed, and video-join-attempt/success events (the last tagged with network type where the browser exposes it). Storage and tooling are an architecture decision; the requirement is that every KPI in this table maps to a component that emits the data it needs. KPIs #4 and #6 are derived from existing appointment/payment-reference and audit-log records and need no new instrumentation.

---

## 7. Roadmap & risks summary

### v1 milestones (8 weeks, ~160 dev hours)

| Milestone                 | End of week | Deliverable                                                                                                                                                                                                                                            |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M1 — Booking flow**     | Week 2      | Patient sign-up (with ToS/Privacy acceptance), doctor listing, slot booking (no payment yet), confirmation email                                                                                                                                       |
| **M2 — Video + Payments** | Week 4      | Full video consultation end-to-end (mobile-tested on 3G); manual bank-transfer payment flow working (patient submits a reference, admin verifies and confirms) — no gateway, webhooks, or reconciliation cron (ADR-43)                                  |
| **M3 — Prescriptions**    | Week 6      | Doctor builds prescription after call with read-only patient identification header; medicine catalogue carries admin-set prices and the builder shows a computed prescription total; patient downloads an itemised PDF (prices + total) from dashboard |
| **M4 — Launch-ready**     | Week 8      | Admin panel (doctor onboarding with initial-password set, medicine catalogue with admin-set prices, alert feed), landing page, email automation, `/legal/terms` and `/legal/privacy` page content, full E2E QA                                         |

### v1.1 deferred items (2–4 weeks post-launch)

- SMS / WhatsApp notifications (same triggers as email, additional channel)
- Live queue / spot booking — removes booking lead-time floor; doctors go "online" for real-time queue
- Pre-consultation skin photo upload (1–3 photos before call)
- Patient account deletion / data-export flow
- ToS / Privacy versioning and re-prompt on policy update
- Doctor self-service password reset via email token

### v1.2+ deferred items

- Server-side PDF generation (enables email-attached, signed/audited PDFs)
- Dermestha wallet (instant refunds via wallet credit)
- Family profiles / sub-accounts
- Secondary bank gateway (UBL/HBL)
- Medicine Ordering Module (first-party in-app ordering with home delivery)
- Urdu language support
- Native iOS / Android apps

### Top risks (pointer — full register in doc 07)

The three highest-impact risks identified in the PRD are:

1. **Payment-aggregator merchant KYC delay** (no longer applicable in v1) — eliminated by the manual offline bank-transfer model, which needs no aggregator or merchant KYC (ADR-43).
2. **DRAP/PMDC regulatory exposure** (Likelihood: Medium, Impact: High legally) — explicitly out of scope for v1; flagged as a deferred risk with no v1 mitigation.
3. **Video provider outage during peak consultation hours** (Likelihood: Low, Impact: High when it occurs) — status banner and reschedule offer in v1; no automated fallback video provider.

The complete risk register (all risks with likelihood, impact, and mitigation details) is maintained in doc 07.

---

## Revision footer

| Date       | Change           | Why                                                |
| ---------- | ---------------- | -------------------------------------------------- |
| 2026-06-01 | Initial creation | Faithful re-presentation of PRD.md §1/§2.1/§2.3/§5 |
| 2026-06-28 | Reframed payment to the manual offline bank-transfer model (admin-verified, no gateway/hosted-checkout/webhooks/refunds) and the appointment lifecycle to the 3-state `pending → confirmed` / `cancelled` model: §2 note; objective 3; core features (book & pay, cancel, upcoming, admin alerts/records/settings, new admin payment-review); §5 email triggers + payment row; KPIs #4 (offline confirmation rate) and #7 (refunds deferred); M2 deliverable; risk #1 (KYC no longer applicable) | Manual-payment pivot — as-built sync |

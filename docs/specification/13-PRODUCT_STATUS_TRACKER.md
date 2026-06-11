# 13 — Product Status Tracker

| Field            | Value                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID      | `13-PRODUCT_STATUS_TRACKER`                                                                                                                           |
| Status           | Canonical                                                                                                                                             |
| Version          | 1.7                                                                                                                                                   |
| Last updated     | 2026-06-11                                                                                                                                            |
| Sources absorbed | `server/src + client/src inspection; agentChangeLogs/2026-05-31-1700-m0-foundation-scaffold.md; ARCHITECTURE.md §5b; docs/specification/02; PRD §5.1` |
| Related docs     | 02, 03, 05                                                                                                                                            |

---

## Index

1. [Status legend & method](#1-status-legend--method)
2. [Milestone snapshot](#2-milestone-snapshot)
3. [Module-wise status](#3-module-wise-status)
4. [Feature-wise status](#4-feature-wise-status)
5. [Iteration roadmap](#5-iteration-roadmap)
6. [Remaining for v1](#6-remaining-for-v1)

---

## Purpose

This document reports the **actual build state** of the Dermestha codebase as of 2026-06-01. Statuses are grounded in direct repo inspection (`server/src`, `client/src`, `prisma/`, `shared/`) cross-referenced against the M0 session log and the ARCHITECTURE §5b module inventory. It is the single source of truth for what has been built, what is stubbed, and what has not yet been started.

---

## 1. Status legend & method

| Status           | Meaning                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| Done             | File(s) confirmed in the repo with real implementation; not a stub or empty seam   |
| In progress      | Partial implementation or scaffolded seam exists; functional work remains          |
| Not started      | No corresponding file found in `server/src` or `client/src`                        |
| Deferred → v1.1  | Explicitly out of v1 scope per PRD §5.1; planned for the first post-launch release |
| Deferred → v1.2+ | Explicitly out of v1 and v1.1 scope per PRD §5.1                                   |
| Not verified     | Could not be confirmed or denied from repo inspection alone                        |

**Last verified:** 2026-06-01. Statuses are grounded in repo inspection; anything not verifiable in code is marked `Not verified`. Stub files that only throw `AppError('NOT_IMPLEMENTED', ..., 501)` are counted as **In progress** (seam exists, real logic absent).

---

## 2. Milestone snapshot

| Milestone                      | Target        | Status      | % complete (estimate) | Notes                                                                                                                                                                          |
| ------------------------------ | ------------- | ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M0 — Foundation / scaffold** | Pre-dev       | Done        | 100%                  | All 14 tasks complete per `agentChangeLogs/2026-05-31-1700-m0-foundation-scaffold.md`; server suite 20/20, client suite 2/2                                                    |
| **M1 — Booking flow**          | End of week 2 | In progress | ~90%                    | Slice A (auth) + B (discovery & availability) + C (booking + payment) merged; Slice E added the F07 notification outbox so confirmation + reminder emails enqueue in the webhook `$transaction` and a real Resend adapter (key-based console fallback) replaces the stub. auth + doctor + availability + booking + payment/refund/cancellation services & routes, 30-min slot generation, `BLOCK_HAS_BOOKINGS` guard, client P-02/P-03/D-03/P-04/P-05/D-01/P-06/P-07/P-08/P-10 + 3 nav layouts. Remaining M1-ish polish (P-13/profile/landing) is M3/M4 |
| **M2 — Video + Payments**      | End of week 4 | In progress | ~95%                    | Slice C built Payments (intent + signed-webhook atomic commit, `feeAtBooking`), Refund (net-of-fee, idempotent), Cancellation; Slice D built Video + the appointment-evaluation worker (ADR-25). Slice E completed the safety nets: the **reconciliation** worker (F04.03, lost-IPN confirm + edge #6a full refund), the **refund-retry** worker (F06.03, backoff + exhaustion alert + `refund_delayed`), and the **notification-dispatch** worker (F07.03, invalidation re-check + retry) — all in-process `node-cron` over clock-injected functions (ADR-27). Still absent only: concrete PayFast/Daily.co network adapters (Slice H, vendor-credential work) |
| **M3 — Prescriptions**         | End of week 6 | Not started | 0%                    | No prescription, medicine, or shared Zod DTO files found beyond empty seam                                                                                                     |
| **M4 — Launch-ready**          | End of week 8 | Not started | 0%                    | No admin panel views, email automation, landing page, or legal content pages found                                                                                             |

---

## 3. Module-wise status

### Backend domain modules (ARCH §5b)

| #   | Module                      | Milestone | Status      | Evidence (actual file/path or "none found")                                                                                                    | Notes                                                                                                                                                                                                            |
| --- | --------------------------- | --------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Auth & session              | M1        | In progress | `server/src/middleware/session/session.js`, `server/src/middleware/requireRole/requireRole.js`, `server/src/middleware/rateLimit/rateLimit.js`, `server/src/lib/password/password.js` | Session/role middleware, rate-limiter, password hash/verify built (M0). Slice A added auth service + routes (signup/login/logout/me/forgot/reset/change), Zod validate, DA3 `mustChangePassword` gate, and per-account lockout — all tested. Remaining: DA5 admin-mediated reset route (with doctor management). |
| 2   | User                        | M1        | Not started | none found                                                                                                                                     | `User` model exists in `prisma/schema.prisma`; no `user.service.js` or user routes found.                                                                                                                        |
| 3   | Doctor                      | M1/M4     | Built (M1)  | `server/src/modules/doctor/service.js`, `server/src/modules/doctor/controller.js`, `server/src/modules/doctor/index.js`                          | Slice B: public listing (active-only, paginated, no-leak card) + public profile (404-no-leak) + `getDoctorByUserId` for availability ownership. Admin onboarding/edit/(de)activation still M4.                    |
| 4   | Availability                | M1        | Built       | `server/src/modules/doctor/service.js`, `server/src/modules/doctor/index.js`                                                             | Slice B: weekly recurring blocks (read/replace) + 30-min slot generation (date-fns-tz Karachi↔UTC, ADR-21), lead-time filter, active-appointment exclusion, `BLOCK_HAS_BOOKINGS` orphan guard. Tested (9 unit + integration). |
| 5   | Slot & booking              | M1→M2     | Built       | `server/src/modules/appointment/service.js`, `server/src/modules/appointment/controller.js`, `server/src/modules/appointment/index.js`              | Slice C: `lockSlot` creates `slot_locked` (10-min hold) with Single-Lock + No-Overlap + reclaim-on-conflict; lazy expiry (ADR-23). `POST /api/appointments/lock`. Tested (5 unit + integration).                 |
| 6   | Payment                     | M2        | Built       | `server/src/modules/payment/service.js`, `server/src/integrations/payment/payfast.mock.js` (+ stub), `server/src/modules/payment/controller.js` (payfast handler), `server/src/modules/payment/index.js` (`POST /api/webhooks/payfast`) | Slice C: idempotent intent + `createCheckout` handoff; signature-verified `POST /api/webhooks/payfast` → single `$transaction` `slot_locked→confirmed` + `feeAtBooking` snapshot (#2/#6); idempotent on replay; dev mock gateway w/ real signed IPN (ADR-22). Slice E: `confirmPaidAppointment` extracted as the shared confirm commit; `reconcileUnconfirmed` hourly worker (F04.03) + `queryPaymentStatus`. Concrete PayFast network adapter still pending (Slice H). Tested. |
| 7   | Appointment + state machine | M2        | Built       | `server/src/modules/appointment/service.js`                                                                                              | Slice C: single transition writer (legal-pair validation + audit, optional tx client) for the Slice-C transitions (`slot_locked→confirmed`, `confirmed→cancelled_*`/`doctor_cancelled`). Video-side transitions (`in_progress`/no-show) extend it in Slice D. Tested (3 unit). |
| 8   | Refund                      | M2        | Built       | `server/src/modules/appointment/service.js`                                                                                                        | Slice C: `quoteRefund` net-of-fee (reported fee wins, else Settings fallback, policy #5) + idempotent `initiateRefund` (#10); best-effort, never blocks a transition. Slice E: provider failure → `retrying`+backoff (`Payment.refundAttempts`/`nextRefundRetryAt`), `retryDueRefunds` worker, exhaustion → `failed` + `payment.refund_exhausted` alert + `refund_delayed` email (G1 closed). Tested. |
| 9   | Video                       | M2        | Built       | `server/src/integrations/video/daily.stub.js`, `server/src/integrations/video/daily.mock.js`, `server/src/integrations/video/index.js`, `server/src/modules/video/service.js`, `server/src/modules/appointment/index.js` (`GET /:id/video-token`), `server/src/modules/video/index.js` (`POST /api/webhooks/daily`), `server/src/workers/` | Slice D: video-token issuance with slot-window guard (`VIDEO_WINDOW_CLOSED`); real `POST /api/webhooks/daily` handler recording `doctorJoinedAt`/`patientJoinedAt`; dev mock (`daily.mock`) + `/dev/video/*` simulator + `/dev/worker/*` on-demand trigger (ADR-24); appointment-evaluation `node-cron` worker + `evaluateDueAppointments` in `server/src/modules/appointment/service.js` (ADR-25). Concrete Daily.co network adapter (`daily.js`) pending (P-12).                                                                                   |
| 10  | Prescription                | M3        | Not started | none found                                                                                                                                     | `Prescription` + `PrescriptionItem` models in schema; no `prescription.service.js` found.                                                                                                                        |
| 11  | Medicine catalogue          | M3        | Not started | none found                                                                                                                                     | `Medicine` model in schema; no `medicine.service.js` found.                                                                                                                                                      |
| 12  | Cancellation                | M2        | Built       | `server/src/modules/appointment/service.js`, `server/src/modules/appointment/index.js` (`POST /:id/cancel`)                                         | Slice C: patient ≥2h → `cancelled_refunded` (refund), <2h → `cancelled_no_refund`; doctor → `doctor_cancelled` (refund + apology). Best-effort refund/email. Both roles tested (6 unit + integration); doctor-side UI (D-06) deferred to Slice D. |
| 13  | Notification/email          | M1→M4     | Built (v1 transport) | `server/src/modules/notification/service.js`, `server/src/integrations/email/resend.js`, `server/src/integrations/email/console.dev.js`, `server/src/integrations/email/index.js`             | Slice E: `notification_jobs` outbox + `enqueue`/`enqueueBookingEmails` (cadence + short-lead skip, F07.02), `dispatchDueNotifications` worker (invalidation re-check + backoff + exhaustion alert, F07.03); real Resend HTTP adapter with `RESEND_API_KEY`-based console fallback. Final template marketing copy is M4 (doc 14 §5; vars are the contract). |
| 14  | Audit log                   | M2→M4     | In progress | `server/src/services/audit/audit.service.js`, `server/src/services/audit/audit.service.test.js`                                                            | Append-only `record()` writer built and tested (2/2 tests green). Admin query API absent.                                                                                                                        |
| 15  | Admin alerts / health       | M4        | Not started | none found                                                                                                                                     | `errorTracking.js` is a no-op seam; no alert feed service or routes found.                                                                                                                                       |
| 16  | Records & audit search      | M4        | Not started | none found                                                                                                                                     | No audit query API or admin records routes found.                                                                                                                                                                |
| 17  | Settings                    | M4        | Not started | none found                                                                                                                                     | `Settings` model in schema (single-row, seeded); no `settings.service.js` or admin settings routes found.                                                                                                        |
| 18  | Analytics/telemetry         | M2→M4     | Not started | none found                                                                                                                                     | `AnalyticsEvent` model in schema; no analytics service or event-emit code found.                                                                                                                                 |
| 19  | Legal content               | M4        | Not started | none found                                                                                                                                     | No `/legal/terms` or `/legal/privacy` routes or content found.                                                                                                                                                   |

### Background workers (ARCH §5b)

| Worker                                     | Milestone | Status      | Evidence   | Notes                                            |
| ------------------------------------------ | --------- | ----------- | ---------- | ------------------------------------------------ |
| Reconciliation (hourly PayFast query)      | M2        | Built       | `server/src/workers/index.js`, `server/src/modules/payment/service.js` | Slice E: `reconcileUnconfirmed(now)` (`0 * * * *`) — gateway-paid lost IPN → shared atomic confirm; edge #6a full gross refund; mismatch audit; `/dev/worker/reconcile` trigger (ADR-27). |
| Notification (email dispatch + retry)      | M2        | Built       | `server/src/workers/index.js`, `server/src/modules/notification/service.js` | Slice E: `dispatchDueNotifications(now)` (`* * * * *`) — due outbox rows, invalidation re-check, exponential backoff, exhaustion alert; `/dev/worker/notifications` trigger (ADR-27). |
| Refund-retry (backoff + exhaustion)        | M2        | Built       | `server/src/workers/index.js`, `server/src/modules/appointment/service.js` | Slice E: `retryDueRefunds(now)` (`* * * * *`) — re-runs due `retrying` refunds idempotently; `/dev/worker/refund-retry` trigger (ADR-27). |
| Appointment-evaluation (state advancement) | M2        | Built       | `server/src/workers/` (`node-cron`), `server/src/modules/appointment/service.js` | Slice D: `evaluateDueAppointments(now)` — activation, no-show resolution (ADR-12), completion; driven by `* * * * *` cron; `/dev/worker/evaluate` on-demand trigger (ADR-25). |

### Cross-cutting / infra

| Item                            | Status      | Evidence                                                                                                                                |
| ------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Role middleware (DA6)           | Done        | `server/src/middleware/requireRole/requireRole.js` — tested (3/3)                                                                                   |
| Rate-limiter factory            | Done        | `server/src/middleware/rateLimit/rateLimit.js`                                                                                                    |
| Error envelope middleware       | Done        | `server/src/http/errorHandler/errorHandler.js`, `server/src/http/AppError.js` — tested (3/3)                                                         |
| Zod env validation              | Done        | `server/src/config/env/env.js` — tested (3/3)                                                                                               |
| Prisma singleton                | Done        | `server/src/lib/prisma/prisma.js`                                                                                                              |
| Structured logger               | Done        | `server/src/lib/logger/logger.js`                                                                                                              |
| Error-tracking seam             | In progress | `server/src/lib/errorTracking/errorTracking.js` — no-op until DSN configured (comment: "A3 wires this in M4")                                         |
| Password hash/verify (argon2id) | Done        | `server/src/lib/password/password.js` — tested (2/2)                                                                                             |
| Prisma schema + migrations      | Done        | `prisma/schema.prisma`, `prisma/migrations/20260531163617_init/migration.sql` (includes hand-appended `uniq_active_slot` partial index) |
| 12-factor config loader         | Done        | `server/src/config/env/env.js`, `server/src/config/constants.js`                                                                            |
| Dockerfile + docker-compose     | Done        | `Dockerfile`, `docker-compose.yml`                                                                                                      |
| Payment adapter interface       | In progress | `server/src/integrations/payment/index.js` + `payfast.stub.js` (prod default) + `payfast.mock.js` (dev, ADR-22). Slice E added the `queryPaymentStatus` contract (mock returns `unknown`; stub `NOT_IMPLEMENTED`) for the reconciliation worker. Concrete PayFast network adapter still pending (Slice H). |
| Video adapter interface         | In progress | `server/src/integrations/video/index.js` + `daily.stub.js` (prod default) + `daily.mock.js` (dev, ADR-24). Concrete Daily.co network adapter (`daily.js`) still pending (P-12). |
| Email adapter interface         | Built       | `server/src/integrations/email/index.js` (key-based `pickProvider`) + `resend.js` (real HTTP adapter) + `console.dev.js` (dev fallback). Slice E: `RESEND_API_KEY` selects the real adapter, else console + loud warning; `resend.stub.js` deleted. Verified-domain + `RESEND_FROM` needed for patient inboxes (doc 14). |
| Shared Zod DTO seam             | In progress | `shared/schemas/auth/auth.js` + `availability.js` + `booking.js` + `index.js` — auth (Slice A) + availability/doctor-list/slots (Slice B) + lock/cancel (Slice C) DTOs; prescription/admin DTOs pending                                               |
| `/api/health` route             | Done        | `server/src/health/index.js` — Prisma `SELECT 1` liveness check                                                                        |
| Static SPA serving + catch-all  | Done        | `server/src/index.js`                                                                                                                   |
| Admin bootstrap script          | Done        | `prisma/scripts/bootstrap-admin.js`                                                                                                     |
| DB seed                         | Done        | `prisma/seed.js`                                                                                                                        |

### Frontend modules

| Group                                                         | Status      | Evidence                                                                                                                     | Notes                                                |
| ------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Design tokens (`tokens.css`)                                  | Done        | `client/src/styles/tokens.css` — verbatim port from mockups                                                                  |
| Component CSS (`components.css`)                              | Done        | `client/src/styles/components.css` — verbatim port from mockups                                                              |
| App entry (`main.jsx`, `App.jsx`)                             | Done        | `client/src/main.jsx`, `client/src/App.jsx` — providers composed in `client/src/context/AppProviders.jsx` (QueryClient + BrowserRouter + Session); `AppRoutes` with role placeholders |
| Route config seam (`routes.jsx`)                              | In progress | `client/src/routes.jsx` (`buildRoutes(session)` aggregating each module's `*.routes.jsx`) + `App.jsx` — auth + discovery + booking routes wired (`/` listing, `/doctors/:id`, `/doctor/availability`; patient-gated `/book/:id`, `/pay/return`, `/appointments`); admin views pending |
| Client-side role guard (`RoleRoute.jsx`)                      | Done        | `client/src/lib/RoleRoute/RoleRoute.jsx` — tested (2/2)                                                                                |
| 24 views (P-01…P-13, D-01…D-06, A-01…A-05)                    | In progress | P-04, P-05 (+ forgot/reset), D-01 (Slice A); P-02, P-03, D-03 (Slice B); P-06, P-07, P-08, P-10 (Slice C)                    | 10 of 24 built; rest pending                         |
| Layouts (`TopNavLayout`, `BottomTabsLayout`, `SidebarLayout`) | Done        | `AuthSplitLayout` (Slice A); `PatientLayout` (topnav + mobile tabbar) + `SidebarLayout` (Slice B)                            | All 3 chrome layouts built; AuthSplit for auth pages |
| Shared design components (~16)                                | In progress | `Button, Field, Card, Alert, Checkbox` (Slice A); `DoctorCard, SlotButton` (Slice B); `CancelModal` (Slice C)                | 8 of ~16 built; rest as views need them              |
| Typed API client                                              | Done        | `client/src/lib/apiClient/apiClient.js` — tested (3/3)                                                                                 | error-envelope wrapper; single network seam          |
| Auth/session context                                          | Done        | `client/src/context/session/session.jsx` — tested (2/2)                                                                                  | React Context, **state only** (session/loading/refresh/setSession); hydrates via `/auth/me`. One-shot auth actions in `modules/auth/useAuth.js` |
| Video chrome (Daily SDK wrapper)                              | Not started | none found                                                                                                                   | No video-stage component found                       |
| Client-side PDF renderer                                      | Not started | none found                                                                                                                   | No PDF render boundary found                         |
| Legal page templates                                          | Not started | none found                                                                                                                   | No `client/src/legal/` directory found               |

---

## 4. Feature-wise status

Feature IDs are those defined in `docs/specification/02-SCOPE_FEATURE_DOCUMENT.md`.

| Feature                                              | Owning module(s)                            | Milestone | Status      | Notes                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| F01 — Patient authentication & account               | Auth & session (1), User (2)                | M1        | In progress | Auth routes + service (signup/login/logout/me/forgot/reset/change) built & tested (Slice A); reset email delivery stubbed until Resend (M4); no email verification in v1 by design; profile (P-13) later |
| F02 — Doctor discovery (public listing & profile)    | Doctor (3)                                  | M1        | Built       | Slice B: `GET /api/doctors` (paginated, active-only, no-leak card + next-slot hint), `GET /api/doctors/:id` (404-no-leak), P-02/P-03 views; tested |
| F03 — Slot booking & slot-lock                       | Slot & booking (5), Availability (4)        | M1→M2     | Built       | Slice C: `POST /api/appointments/lock` → `slot_locked` (10-min hold) + who-for (P8); Single-Lock/No-Overlap; lazy expiry + reclaim-on-conflict over `uniq_active_slot` (ADR-23); P-06 booking view. Tested |
| F04 — Payment                                        | Payment (6), Appointment state machine (7)  | M2        | Built       | Slice C: idempotent intent + checkout handoff; signature-verified webhook → atomic `confirmed` + `feeAtBooking` (#2/#6), idempotent on replay; P-07 return view. Slice E: F04.03 hourly reconciliation worker (lost-IPN confirm via the shared `confirmPaidAppointment` commit; edge #6a full gross refund). Exercised via dev mock gateway (ADR-22); concrete PayFast adapter pending (Slice H). Tested |
| F05 — Appointment lifecycle & video consultation     | Appointment + state machine (7), Video (9)  | M2        | Built       | Slice D: video-token issuance + slot-window guard; `POST /api/webhooks/daily` join recording (`doctorJoinedAt`/`patientJoinedAt`); appointment-evaluation worker (`node-cron`, `evaluateDueAppointments` in `modules/appointment/service.js`) — `confirmed→in_progress`, no-show resolution (ADR-12), `in_progress→completed`; dev mock simulator (ADR-24). Exercised via `daily.mock` + real webhook path. (F07 reminders + F04.03 reconciliation remain deferred.) |
| F06 — Cancellation & refund                          | Cancellation (12), Refund (8)               | M2        | Built       | Slice C: `POST /api/appointments/:id/cancel` — patient ≥2h refund / <2h no-refund / doctor cancel; net-of-fee refund (policy #5, idempotent #10), best-effort; P-08 dashboard + P-10 modal (same refund number). Slice E: F06.03 refund-retry worker (backoff, exhaustion → `failed` + alert + `refund_delayed` email; G1 closed); cancellation/no-show emails now route through the F07 outbox. Doctor UI (D-06) deferred. Tested |
| F07 — Reminders & notifications                      | Notification/email (13)                     | M1→M4     | Built (v1 transport) | Slice E: `notification_jobs` transactional outbox; event emails enqueue in the caller's `$transaction`; confirmation + slot−24h/slot−1h reminders (short-lead skip, Karachi-correct); `dispatchDueNotifications` worker re-checks state (suppress invalidated reminders), retries with backoff, alerts on exhaustion; cancellation/refund/refund-delayed triggers wired. Real Resend adapter + console fallback. Final template copy is M4 |
| F08 — Prescription                                   | Prescription (10), Medicine (11)            | M3        | Not started | Schema models defined; no prescription or medicine service found; no client PDF renderer found               |
| F09 — Doctor weekly availability                     | Availability (4)                            | M1        | Built       | Slice B: `GET /api/doctors/:id/availability` (doctor-own/admin), `PUT /api/availability` (replace, `BLOCK_HAS_BOOKINGS` guard), `GET /api/doctors/:id/slots` (30-min gen), D-03 grid; tested |
| F10 — Admin: doctor onboarding, edit, (de)activation | Doctor (3)                                  | M1/M4     | Not started | No doctor service, admin doctor routes, or admin views found                                                 |
| F11 — Admin: medicine catalogue                      | Medicine (11)                               | M3        | Not started | `Medicine` schema defined and seeded (demo); no medicine service or admin routes found                       |
| F12 — Admin: system-health alerts                    | Admin alerts / health (15)                  | M4        | Not started | `errorTracking.js` is a no-op seam; no alert feed or admin routes found                                      |
| F13 — Admin: records & audit log (unified)           | Records & audit search (16), Audit log (14) | M4        | Not started | `audit.service.record()` built; no query API or admin records view found                                     |
| F14 — Admin: platform settings                       | Settings (17)                               | M4        | Not started | `Settings` schema defined and seeded; no settings service or admin settings routes found                     |
| F15 — Doctor & admin authentication & roles          | Auth & session (1)                          | M1        | In progress | Shared login + role routing, DA3 forced-change gate, `requireRole` all built & tested (Slice A); DA5 admin-mediated reset + admin bootstrap/doctor-create pending           |
| F16 — Legal content (ToS / Privacy)                  | Legal content (19)                          | M4        | Not started | No `/legal/terms` or `/legal/privacy` routes or content files found                                          |

---

## 5. Iteration roadmap

### v1 (M1–M4, 8-week scope)

| Milestone                      | Deliverable                                                                                                                 | Status      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| M1 — Booking flow (Week 2)     | Patient sign-up + ToS consent, login (shared), doctor listing, slot booking (no payment), confirmation email                | Not started |
| M2 — Video + Payments (Week 4) | Full video consultation (mobile-tested on 3G); PayFast payment flow + signed webhooks + reconciliation cron                 | Not started |
| M3 — Prescriptions (Week 6)    | Doctor prescription builder + patient-ID header; medicine catalogue prices; patient itemised PDF download                   | Not started |
| M4 — Launch-ready (Week 8)     | Admin panel (doctor onboarding, medicine catalogue, alert feed); landing page; email automation; legal content; full E2E QA | Not started |

### v1.1 (2–4 weeks post-launch)

| Item                                                | Status          |
| --------------------------------------------------- | --------------- |
| SMS / WhatsApp notifications                        | Deferred → v1.1 |
| Live queue / spot booking (removes lead-time floor) | Deferred → v1.1 |
| Pre-consultation skin photo upload                  | Deferred → v1.1 |
| Patient account deletion / data-export flow         | Deferred → v1.1 |
| ToS / Privacy versioning + re-prompt on update      | Deferred → v1.1 |
| Doctor self-service password reset (email token)    | Deferred → v1.1 |

### v1.2+

| Item                                                    | Status           |
| ------------------------------------------------------- | ---------------- |
| Server-side PDF generation (email-attached, signed)     | Deferred → v1.2+ |
| Dermestha wallet (instant refunds)                      | Deferred → v1.2+ |
| Family profiles / sub-accounts                          | Deferred → v1.2+ |
| Secondary bank gateway (UBL/HBL)                        | Deferred → v1.2+ |
| Medicine Ordering Module (in-app order + home delivery) | Deferred → v1.2+ |
| Urdu language support                                   | Deferred → v1.2+ |
| Native iOS / Android apps                               | Deferred → v1.2+ |

### Medicine Ordering Module (separate scope — §6)

Listed in PRD §6 as a **separately scoped and costed module**, explicitly NOT part of the v1 8-week build. v1 ships only the prescription-side prerequisites (admin medicine prices, computed prescription total, itemised self-pay PDF). The module is **Deferred → v1.2+** and requires its own planning, costing, and timeline discussion before scheduling.

---

## 6. Remaining for v1

Everything below is absent from `server/src` and `client/src` as of 2026-06-01. This is the full build backlog for the v1 8-week scope.

### M1 — Booking flow

- [ ] Auth service: sign-up (name, email, phone, password, ToS consent capture to `tos_accepted_at`)
- [ ] Auth service: login (shared `/login`; role-based routing on success to patient/doctor/admin dashboard)
- [ ] Auth service: forgot-password (enumeration-safe; 1-hour token; Resend integration)
- [ ] Auth routes: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- [ ] DA3 forced-first-login-change middleware gate (checks `must_change_password`)
- [x] Doctor service: public listing (active-only, paginated) and public profile endpoint — Slice B
- [x] Doctor routes: `GET /api/doctors`, `GET /api/doctors/:id` — Slice B
- [x] Availability service: save/update weekly recurring blocks; generate 30-minute slots from blocks; lead-time filter; block-with-bookings guard — Slice B
- [x] Availability routes: `GET /api/doctors/:id/slots`, `GET /api/doctors/:id/availability`, `PUT /api/availability` (doctor-scoped) — Slice B (replace is `PUT /api/availability`, not the per-id form originally sketched)
- [x] Booking / slot-lock service: create `slot_locked` appointment; 10-minute hold; single-lock + no-overlap; lazy expiry + reclaim-on-conflict (ADR-23) — Slice C
- [x] Booking routes: `POST /api/appointments/lock`, `POST /api/appointments/:id/pay` — Slice C (no `DELETE …/lock`; expiry is lazy, not an explicit release route)
- [x] Notification service: `notification_jobs` outbox + dispatch worker (cadence, short-lead skip, invalidation, backoff); confirmation/refund/apology/refund-delayed triggers; real Resend adapter + console fallback — Slice E. Final template copy is M4
- [~] Shared Zod DTOs: sign-up, login (Slice A); lock + cancel (Slice C); doctor list/slots (Slice B)
- [~] Patient views (client): P-02 ✓, P-03 ✓, P-04 ✓, P-05 ✓ (Slice A/B); P-06 booking ✓, P-07 payment return ✓, P-08 upcoming ✓, P-10 cancel modal ✓ (Slice C)
- [x] Doctor views (client): D-03 weekly availability grid (Slice B); D-01 forced first-login password change (Slice A)
- [x] Layout chromes: `PatientLayout` (TopNav + BottomTabs), `SidebarLayout` (doctor/admin) — Slice B
- [ ] Shared design components (~16 from `_component-reference.html`): `Button`, `Card`, `Input`, `Modal`, slot-grid, etc.
- [ ] Typed API client (`client/src/lib/apiClient/apiClient.js` or equivalent)
- [ ] Auth/session context provider (React)
- [ ] Route config: wire all M1 views with `RoleRoute` guards

### M2 — Video + Payments

- [x] Payment service: idempotent intent, checkout handoff, signed-webhook verify, `fee_at_booking` snapshot, atomic commit (appointment + payment) — Slice C; F04.03 reconciliation worker + `queryPaymentStatus` — Slice E
- [~] Payment routes: `POST /api/appointments/:id/pay`, `POST /api/webhooks/payfast` — Slice C; no `…/reconcile` route yet
- [ ] Video service: Daily.co room creation and time-bound token issuance (replace stub), participant-event ingestion
- [ ] Video routes: `POST /api/appointments/:id/video/token`
- [x] Appointment state-machine service: transition validation, audit-log writes, side-effect triggers (refund, email) — Slice C (Slice-C transitions; video-side transitions extend it in Slice D)
- [x] Appointment routes: `GET /api/appointments` (patient/doctor scoped), `GET /api/appointments/:id` — Slice C
- [x] Refund service: net-of-fee amount, idempotent refund call, fallback fee model — Slice C; F06.03 retry/backoff worker + exhaustion alert + `refund_delayed` email (G1) — Slice E
- [x] Cancellation service: patient (≥2h/<2h) and doctor cancel flows; refund orchestration — Slice C
- [x] Cancellation route: `POST /api/appointments/:id/cancel` (unified patient/doctor by session role) — Slice C
- [x] Workers directory (`server/src/workers/`): reconciliation worker (hourly cron) — Slice E; notification-dispatch + refund-retry workers (`* * * * *`) — Slice E; appointment-evaluation worker — Slice D. All in-process `node-cron` over clock-injected functions (ADR-25/27); `/dev/worker/*` on-demand triggers
- [ ] Analytics service: emit events for KPI #1 (landing→booking) and #3 (video-join success by network type)
- [ ] Audit log query API (admin-only): `GET /api/admin/audit-log`
- [ ] Patient views: P-07 payment redirect/confirmation, P-08 upcoming appointments (with "Join Call"), P-09 video consultation room
- [ ] Doctor views: D-02 today's appointments, D-03 video consultation room

### M3 — Prescriptions

- [ ] Prescription service: immutable submit, items + price snapshot, patient-ID snapshot, chronological list, JSON read API
- [ ] Prescription routes: `POST /api/appointments/:id/prescriptions`, `GET /api/appointments/:id/prescriptions`
- [ ] Medicine service: admin CRUD, unit price, dosage forms, deactivate
- [ ] Medicine routes: `GET /api/medicines`, `POST /api/admin/medicines`, `PATCH /api/admin/medicines/:id`
- [ ] Client-side PDF renderer (`renderPrescriptionPdf(json)` boundary in `client/src/`)
- [ ] Prescription-ready email trigger (Resend, via notification service)
- [ ] Patient views: P-10 past appointments, P-11 prescription detail + PDF download
- [ ] Doctor views: D-04 prescription builder

### M4 — Launch-ready

- [ ] Admin panel — doctor onboarding (A1): add doctor with initial-password set; photo upload
- [ ] Admin panel — doctor edit/deactivate (A4): edit fields, PMC/email immutability guard, deactivation-with-count warning, reactivate
- [ ] Admin panel — medicine catalogue (A2): searchable list, add, edit, deactivate
- [ ] Admin panel — alert feed (A3): payment mismatches, refund failures, email failures, awaiting-prescription alerts, unhandled exceptions; email re-trigger
- [ ] Admin panel — records & audit log (A5): unified search, detail view, mark `disputed`, email re-trigger
- [ ] Admin panel — platform settings (A6): min lead time, fallback fee model, audit-logged changes
- [ ] Settings service: read/write single-row settings; audit log on every change
- [ ] Settings routes: `GET /api/admin/settings`, `PATCH /api/admin/settings`
- [ ] Error-tracking DSN wired (replace `errorTracking.js` no-op with concrete SDK)
- [~] Email automation: transport mechanism built in Slice E (outbox + dispatch worker: confirmation, 24h/1h reminders, refund confirmation, cancellation apology, refund-delayed; retry/backoff; reminder invalidation). Remaining: `prescription_ready` trigger (Slice F/M3) and final marketing copy per template (doc 14 §5)
- [ ] Landing page (public-facing patient acquisition surface)
- [ ] Legal content: `/legal/terms` and `/legal/privacy` pages
- [ ] Admin views (client): A-01 doctor list, A-02 add doctor, A-03 doctor detail/edit, A-04 medicine catalogue, A-05 records & audit log, A-06 alert feed, A-07 settings
- [ ] Doctor views (client): D-05 past appointments / history, D-06 cancellation flow
- [ ] Patient views (client): P-12 refund status, P-13 profile / account settings
- [ ] Full E2E QA pass

---

## Revision footer

| Date       | Change           | Why                                                                     |
| ---------- | ---------------- | ----------------------------------------------------------------------- |
| 2026-06-01 | Initial creation | Snapshot of build state vs. ARCH §5b module inventory + doc 02 features |
| 2026-06-03 | Corrected M1 patient/doctor view screen IDs to doc 06 canon | Slice A; M2 video screen IDs still to be aligned in Slices C/D |
| 2026-06-03 | Status sweep after Slice A merge (M1, module 1, F01, F15, frontend rows, Zod seam) | Reflect built auth backend + P-04/P-05/D-01 + client foundation |
| 2026-06-03 | Status sweep after Slice B merge (M1 ~55%, modules 3+4 → Built, F02+F09 → Built, frontend views/layouts/components, Zod seam, M1 checklist) | Reflect built discovery + availability backend + P-02/P-03/D-03 + 3 nav layouts (v1.3) |
| 2026-06-04 | Status sweep after Slice C (M1 ~85%, M2 ~40%; modules 5/6/7/8/12 → Built; F03/F04/F06 → Built; adapter/email/Zod/route rows; views→10/24, components→8/16; M1/M2 checklists) | Reflect built booking + payment (mock gateway) + refund/cancellation + P-06/P-07/P-08/P-10 (v1.4) |
| 2026-06-05 | Status sweep after Slice D (M2 ~75%; module 9 → Built; F05 → Built; appointment-evaluation worker → Built; Video adapter interface row updated; M2 checklist) | Reflect built video + appointment-evaluation worker (ADR-24/25) (v1.5) |
| 2026-06-11 | Re-pointed all file-path evidence cells to the feature-first module layout (domain merges, infra grouping, webhook split, schema domain folders, client modules); updated frontend prose (AppProviders, `buildRoutes`, session state/action split) | Folder-structure restructure (ADR-26); pure relocation, no status change (v1.6) |
| 2026-06-11 | Status sweep after Slice E (M1 ~90%, M2 ~95%; modules 8/13 updated; reconciliation + notification-dispatch + refund-retry workers → Built; payment/email adapter rows; F04/F06/F07 → Built-for-v1; M2/M4 checklists) | Reflect built F07 outbox + F04.03/F06.03 workers + real Resend adapter + G1–G4 fixes (ADR-27) (v1.7) |

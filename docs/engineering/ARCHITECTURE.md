# Dermestha — Architecture

**Document type:** Technical architecture specification
**Pairs with:** `docs/product/PRD.md` (what to build), `docs/design/DESIGN.md` (what it looks like). This document defines **how it is wired**.
**Contract-level specs:** see §17 — `API.md`, `prisma/schema.prisma`, `CONFIG.md`, `INTEGRATIONS.md`, `.env.example`.
**Status:** v1.1 — implementation-ready (companion specs added; coding base complete)
**Date:** 2026-05-30

> Scope note: This document selects the technology, deployment topology, schema, module layout, and integration shapes that the PRD (§3 preamble) deferred to the architecture step. **Visual and theming decisions are owned by `DESIGN.md`** and are not re-decided here — this document only defines how that design *binds* to the stack. AWS-portability is treated as a first-class constraint throughout.

---

## 1. Overview

Dermestha v1 is a **single-deployable, same-origin monolith**: one JavaScript **Express** application that exposes a JSON API *and* serves the built **React (Vite)** single-page app from the same origin (no CORS). Business logic lives in a **service layer** (`model → controller → service`); a single **role middleware** is the server-side authorization boundary. Persistence is **PostgreSQL via Prisma**, chosen because the PRD's data-integrity invariants (§3.3) map directly onto native `UNIQUE` constraints, foreign keys, and SQL transactions.

Three **in-process background workers** (reconciliation, notification, appointment-evaluation) advance time-based state. Three **external integrations** — **PayFast** (payments), **Daily.co** (video), **Resend** (email) — each sit behind a thin **adapter interface** so a vendor (or an AWS-native equivalent) can be swapped without touching business logic.

Deployment is **Railway all-in-one** (app + managed Postgres, one region near Pakistan), kept under the §3.2 budget. The whole app ships as a **Docker image** with **12-factor** configuration, so the later move to AWS (ECS/App Runner + RDS) is a redeploy, not a rewrite.

---

## 2. High-Level Architecture

```
                          ┌───────────────────────────────────────────────┐
   Patient (mobile web)   │                 Browser (React SPA)            │
   Doctor  (desktop)      │   patient views · doctor views · admin views  │
   Admin   (desktop)      │   shared components · token-based theme        │
                          └───────────────┬───────────────────────────────┘
                                          │ same-origin HTTPS (cookies)
                                          ▼
        ┌─────────────────────────────────────────────────────────────────────┐
        │                     Express monolith (JavaScript)                     │
        │                                                                       │
        │  express.static(React build)  +  SPA catch-all   ◄── serves the UI    │
        │                                                                       │
        │  /api routes → controllers → ┌──────────────────────────────────┐    │
        │   role middleware (DA6) ─────│          SERVICE LAYER           │    │
        │   rate-limit / validation    │  auth · booking · slot-lock ·    │    │
        │                              │  appointment state-machine ·     │    │
        │                              │  payment · refund · prescription │    │
        │                              │  · medicine · audit-log · notify │    │
        │                              └───────┬─────────────┬────────────┘    │
        │   in-process WORKERS                 │             │                 │
        │   • reconciliation (hourly)          │             │                 │
        │   • notification (dispatch+retry)    ▼             ▼                 │
        │   • appointment-evaluation     Prisma client   integration adapters  │
        └──────────────────────────────────┬───────────────────┬──────────────┘
                                            ▼                   │
                                   ┌─────────────────┐          │
                                   │   PostgreSQL    │          │
                                   │  (app data +    │          ▼
                                   │   sessions)     │   ┌──────────────────────┐
                                   └─────────────────┘   │ PayFast · Daily.co · │
                                                         │ Resend (+ error      │
                                                         │ tracking)            │
                                                         └──────────────────────┘
```

### Components

| Component | Responsibility | Technology |
|---|---|---|
| **Web client** | All three surfaces (patient/doctor/admin); discovery, booking, payment handoff, video, dashboards, prescription render | React + Vite (JavaScript + JSDoc), token-based CSS |
| **API + app core** | JSON API, service-layer business logic, state machine, invariants, authorization | Node + Express (JavaScript + JSDoc), Prisma |
| **Database** | Durable store for all domain data **and** server sessions | PostgreSQL (managed) |
| **Reconciliation worker** | Hourly query of PayFast for unconfirmed payments; reconcile missed webhooks | node-cron (in-process) |
| **Notification worker** | Schedule + dispatch the 6 email triggers; retry/backoff; reminder invalidation | node-cron (in-process) |
| **Appointment-evaluation worker** | Advance `confirmed→in_progress`, resolve `completed`/no-show within the grace window | node-cron (in-process) |
| **Payment adapter** | Hosted checkout, signed webhook verify, refund API, reconciliation query | PayFast |
| **Video adapter** | Per-appointment rooms, time-bound participant tokens | Daily.co |
| **Email adapter** | Transactional sends + bounce/failure signal | Resend |

---

## 3. Tech Stack Decisions

| Decision | Choice | Rationale (tied to requirements) |
|---|---|---|
| Language | **JavaScript** end-to-end (ES modules), with `// @ts-check` + **JSDoc** type hints | Per the chosen stack. No build/transpile step and no `tsconfig`. JSDoc + `@ts-check` (via a `jsconfig.json`) gives editor-level type-checking on the risky invariant modules — the §4.3 state machine, slot-lock, refund math — without committing to TypeScript. Prisma's generated client still surfaces model types through JSDoc/editor hints. |
| App framework | **Node + Express** monolith, `model → controller → service` | Team expertise; serves the SPA same-origin → satisfies §3.2 (no CORS), one domain, cookie auth "just works". |
| Frontend | **Vite + React (JS)** SPA, served by Express `static` | Fast builds; one deployable; host-agnostic. SSR not needed at this scale (TTFB met via region + static serving + code-splitting). |
| Styling / theming | **Reuse the mockups' CSS-variable tokens** (`tokens.css` + `components.css`); React components wrap existing BEM classes | DESIGN.md §8 left this binding to architecture. CSS custom properties give the most *manageable* theming (one var → app-wide reskin) and are pixel-faithful to the approved mockups. **MUI rejected**: imposes Material look conflicting with the flat/squared design and adds bundle weight against KPI #8. |
| Database | **PostgreSQL + Prisma** | Relational, integrity-heavy, join-heavy data; native `UNIQUE`/FK/transactions satisfy §3.3 directly; cleanest AWS path (RDS/Aurora). |
| Sessions / auth | **Hand-rolled cookie sessions** — `express-session` + `connect-pg-simple` + `argon2` + `express-rate-limit` | PRD §3.6 mandates HTTP-only session cookies (not JWT). Auth has bespoke rules (DA1/DA3/DA5); hand-rolling fits the service layer and makes per-event audit-logging trivial, with fewest dependencies. |
| Hosting | **Railway all-in-one** (app + Postgres), Mumbai/Singapore region | Simplest managed setup; private app↔DB networking; always-on for webhooks/cron; under §3.2 (~USD 50/mo) budget. |
| Email | **Resend** (free tier) | Free at ~2–3k/mo; bounce/complaint webhooks satisfy §3.4. |
| Video | **Daily.co** (behind adapter) | Least development; room + time-bound token primitives map 1:1 to §3.4; cost scales with paid consults. |
| Payments | **PayFast** (behind adapter) | Most established PK aggregator (first SBP commercial license, APPS-backed, PCI-DSS); one integration + KYC covers cards + JazzCash + Easypaisa + bank; hosted checkout, signed webhooks/IPN, refund API, reconciliation query. |
| Scaffold | **Lean scaffold, no third-party boilerplate** | No maintained boilerplate matches Express + React-SPA + Prisma + cookie-session RBAC; official Vite `react` + a clean Express/Prisma backend is lower-effort and better-fit. Borrow only config (Dockerfile, ESLint/Prettier/Husky/Zod). |

---

## 4. Directory Structure

```
dermestha/
├── Dockerfile                  # single image: build client → run server
├── docker-compose.yml          # local dev: app + postgres
├── .env.example                # 12-factor config contract
├── jsconfig.json               # checkJs for editor type-checking (no build step)
├── package.json                # workspaces: server + client
├── prisma/
│   ├── schema.prisma           # all models + the critical constraints
│   ├── migrations/             # versioned schema history
│   └── seed.js                 # dev seed (medicines, a demo doctor)
├── shared/
│   └── schemas/                # Zod schemas (+ JSDoc-inferred DTOs) shared client↔server
├── server/
│   └── src/
│       ├── index.js            # bootstraps Express + workers + static serving
│       ├── config/             # env loader (validated), constants
│       ├── lib/                # prisma client, logger, error-tracking init
│       ├── middleware/         # requireRole (DA6), rateLimit, errorHandler, session
│       ├── models/             # Prisma-backed data access helpers (thin)
│       ├── controllers/        # HTTP handlers (thin; validate → call service)
│       ├── services/           # BUSINESS LOGIC (the PRD "application core")
│       │   ├── auth.service.js
│       │   ├── booking.service.js
│       │   ├── slotLock.service.js
│       │   ├── appointmentState.service.js   # the §4.3 state machine
│       │   ├── payment.service.js
│       │   ├── refund.service.js
│       │   ├── prescription.service.js
│       │   ├── medicine.service.js
│       │   ├── doctor.service.js
│       │   ├── availability.service.js
│       │   ├── settings.service.js
│       │   ├── analytics.service.js
│       │   └── audit.service.js               # single append-only writer
│       ├── workers/            # reconciliation · notification · appointmentEval
│       ├── integrations/       # adapters behind interfaces
│       │   ├── payment/  (PaymentProvider typedef + payfast.js)
│       │   ├── video/    (VideoProvider typedef + daily.js)
│       │   └── email/    (EmailProvider typedef + resend.js)
│       └── routes/             # router wiring, role-scoped
└── client/
    └── src/
        ├── main.jsx, App.jsx
        ├── routes.jsx          # centralized route config + role guards
        ├── styles/             # tokens.css + components.css (ported from mockups)
        ├── layouts/            # TopNavLayout · BottomTabsLayout · SidebarLayout
        ├── components/         # the ~16 shared design components
        ├── views/
        │   ├── patient/        # P-01 … P-13
        │   ├── doctor/         # D-01 … D-06
        │   └── admin/          # A-01 … A-05
        ├── lib/                # typed API client, session context, pdf renderer
        └── legal/              # /legal/terms, /legal/privacy templates
```

### Key directories explained
- `server/src/services/` — all business logic. Controllers and workers both call services; rules change in one place. This is the PRD's "application core."
- `server/src/integrations/` — each vendor behind a JSDoc `@typedef` contract (`PaymentProvider`, `VideoProvider`, `EmailProvider`). Swapping PayFast→Safepay or Daily→Agora is a new file + a config switch.
- `client/src/styles/` — the approved `tokens.css`/`components.css` ported verbatim from `mockups/assets/css`; the single theming source of truth.
- `shared/schemas/` — Zod schemas imported by both sides; they validate at runtime and, via `z.infer` in JSDoc, give editor-checked DTOs so a model change propagates to both client and server.

---

## 5. Data Model

PostgreSQL via Prisma. All timestamps are `timestamptz` stored in **UTC**; the UI renders `Asia/Karachi` (no DST). Money is stored in **integer PKR (paisa-safe)** to avoid float drift.

### Tables (collections of record)

| Table | Purpose | Notable columns / constraints |
|---|---|---|
| `users` | Patients, doctors, admin (one table, `role` enum) | `role` (`patient`/`doctor`/`admin`), `email` UNIQUE, `password_hash`, `phone`, `full_name`, `tos_accepted_at`, `must_change_password` |
| `doctors` | Doctor profile (1:1 with a `users` row of role doctor) | `pmc_number` + `email` **immutable post-create** (#8), `specialization`, `fee` (PKR), `bio`, `photo_url`, `is_active`, `status` (`pending`/`active`) |
| `availability_blocks` | Recurring weekly windows (D1) | `doctor_id` FK, `weekday`, `start_time`, `end_time` |
| `appointments` | The core record + state | `doctor_id` FK (**never** denormalize name, #3), `patient_user_id` FK, `slot_start`/`slot_end`, `state` enum, `fee_at_booking` (#6), `for_self` + `subject_name`/`age`/`relation` (P8), `disputed` bool (flag, §3.6), `lock_expires_at` |
| `payments` | One per booking attempt | `appointment_id` FK, `intent_key` UNIQUE on `(patient_user_id, slot_start)` (#7), `provider_ref`, `status`, `amount`, `gateway_fee`, `refund_idempotency_key` UNIQUE (#10), `refund_ref`, `refund_status` |
| `prescriptions` | Immutable, 1..n per appointment (#4) | `appointment_id` FK, `issued_at`, `doctor_snapshot` (jsonb, #3), `patient_id_snapshot` (jsonb, P8), `notes`, `follow_up_date` |
| `prescription_items` | Line items with price snapshot (#5) | `prescription_id` FK, `medicine_name`, `dosage`, `duration`, `instructions`, `price` (nullable → free-text "not priced") |
| `medicines` | Admin catalogue (A2) | `name`, `generic_name`, `dosage_forms`, `unit_price` (PKR), `is_active` |
| `audit_log` | Append-only event log (§3.6) | `at`, `event_type`, `actor_type` (`patient`/`doctor`/`admin`/`system`), `actor_id`, `target_ref`, `reason`, `meta` jsonb |
| `analytics_events` | KPI telemetry (#1/#3) | `at`, `type`, `network_type`, `meta` jsonb |
| `settings` | Single-row platform config (A6) | `min_booking_lead_minutes` (default 60, ≥30), `fallback_fee_pct`, `fallback_fee_fixed` |
| `session` | Server sessions (connect-pg-simple) | managed by the session store |

### The critical constraints (non-negotiable, §3.3)

1. **No double-booking (#1):** a **partial unique index**
   ```sql
   CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
     WHERE state IN ('slot_locked','confirmed','in_progress','completed',
                     'prescription_issued','cancelled_no_refund');
   ```
   Releasing states (`cancelled_refunded`, `doctor_cancelled`) are excluded so a freed slot is rebookable. A second insert for a held slot fails at write time — not at validation. **Note:** Prisma's DSL cannot express this partial (`WHERE`) index, so it is added by hand-editing the generated migration's SQL — see `prisma/schema.prisma` header and `CONFIG.md §7`.
2. **Atomic booking + payment (#2):** the confirm path wraps the appointment update + payment write in **one Prisma `$transaction`**. No replica set needed (native to Postgres).
3. **Idempotency:** `payments.intent_key` UNIQUE `(patient_user_id, slot_start)` (#7); `refund_idempotency_key` UNIQUE (#10).
4. **Snapshots:** `prescription_items.price` + `prescriptions.doctor_snapshot` (#5/#3), `appointments.fee_at_booking` (#6) captured at write/confirm time.
5. **Immutability (#4):** no `UPDATE`/`DELETE` route or service method exists for prescriptions; corrections insert a new linked row.

---

## 5b. Module Inventory — everything to be built

Each backend module = Prisma model(s) + service + controller/routes. Milestones reference PRD §5.1 (M1 booking · M2 video+payments · M3 prescriptions · M4 admin/launch).

### Backend domain modules

| # | Module | Responsibility | PRD refs | Milestone |
|---|---|---|---|---|
| 1 | **Auth & session** | signup + ToS consent, shared login + role-routing, logout, patient self-reset, doctor admin reset, `mustChangePassword` gate, admin bootstrap, role middleware, rate-limit/lockout | P2, DA1–DA6, §3.6 | M1 |
| 2 | **User** | user records (role, contact, hash, consent ts, flags) | P2, DA2 | M1 |
| 3 | **Doctor** | admin CRUD, PMC/email immutability, active/pending + deactivation, photo upload/validate, public listing + profile | A1, A4, P1, P3, #8/#9 | M1 / M4 |
| 4 | **Availability** | weekly recurring grid, 30-min slot generation, block-with-bookings guard | D1, edge #14 | M1 |
| 5 | **Slot & booking** | slot listing w/ lead-time filter, 10-min slot-lock lifecycle + uniqueness, "who is this for" | P3, P8, A6, #1 | M1 → M2 |
| 6 | **Payment** | idempotent intent, PayFast checkout handoff, signed webhook verify, `fee_at_booking`, reconciliation hook | P3, §3.4, #6/#7, edge #6/#6a | M2 |
| 7 | **Appointment + state machine** | central §4.3 machine, transitions, `disputed` flag | §4.3, §3.6 | M2 |
| 8 | **Refund** | eligibility + net-of-fee amount, idempotent refund call, retry/backoff, status, fallback fee model | P6, policy #5, #10, A6 | M2 |
| 9 | **Video** | Daily adapter: per-appointment room, time-bound tokens, join activation, participant-event ingestion | P5, D3, §3.4 | M2 |
| 10 | **Prescription** | immutable submit, items + price snapshot, running total, patient-ID snapshot, chronological list, JSON read API, client PDF seam | D4, P7, §3.5, #4/#5 | M3 |
| 11 | **Medicine catalogue** | admin CRUD, unit price, dosage forms, deactivate | A2 | M3 |
| 12 | **Cancellation** | patient (≥2h/<2h) + doctor flows → refund/no-refund | P6, D5, policy #4 | M2 |
| 13 | **Notification/email** | Resend adapter, 6 triggers, scheduling, retry/backoff, reminder invalidation, admin alert on failure | P4, D4, §3.4 | M1 → M4 |
| 14 | **Audit log** | append-only writer + filtered query API; full event coverage | §3.6, A5 | M2 → M4 |
| 15 | **Admin alerts / health** | alert feed + email re-trigger | A3 | M4 |
| 16 | **Records & audit search** | unified A5 view (filters, rows, detail w/ history + prescriptions, mark disputed, re-trigger email) | A5 | M4 |
| 17 | **Settings** | min lead time, fallback fee model, audit-logged | A6 | M4 |
| 18 | **Analytics/telemetry** | events for KPI #1/#3 | §1 | M2 → M4 |
| 19 | **Legal content** | `/legal/terms`, `/legal/privacy` | P2, §3.6 | M4 |

### Background workers (3, in-process)
- **Reconciliation** — hourly PayFast query for unconfirmed payments (edge #6/#6a). [M2]
- **Notification** — schedule + dispatch the 6 emails, retry/backoff, re-check appointment state before sending a reminder. [M2]
- **Appointment-evaluation** — advance `confirmed→in_progress` at slot-start; resolve `completed`/no-show within the grace window; never leave `in_progress` past slot-end+5min. [M2]

### Cross-cutting / infra
Role middleware (DA6) · rate-limiter · Zod validation · error-tracking integration (A3) · Prisma schema + migrations · 12-factor config loader · Dockerfile · the three adapter interfaces.

### Frontend modules
The **24 views** (P-01…P-13, D-01…D-06, A-01…A-05) + shared: the ~16 design components, 3 layout chromes, centralized route config + role guards, typed API client, auth/session context, video chrome, client-side PDF renderer, legal-page template.

---

## 6. Frontend Architecture & Design-System Integration

- **Screens → routes:** the 24 `DESIGN.md` §6 screens map 1:1 to React views under `client/src/views/{patient,doctor,admin}/`. IDs match mockup filenames.
- **Three navigation chromes** as layout wrappers (`TopNavLayout`, `BottomTabsLayout`, `SidebarLayout`) selected by surface/viewport; views never re-implement nav.
- **Theme:** the ported `tokens.css` (CSS custom properties) is the single source of truth; components reference token *roles*, never raw hex. Fonts: Archivo + Hanken via Google Fonts (`preconnect` + `display=swap`).
- **Shared components:** the ~16 components from `_component-reference.html` are defined once in `components/` and composed everywhere; variants via props (`<Button variant="primary" size="lg">` → `class="btn btn--primary btn--lg"`).
- **Video chrome** wraps Daily's browser SDK inside the existing `video-stage`/`video-controls` markup; the top nav stays the standard white app nav per DESIGN.md §3.19.
- **Prescription PDF** is rendered **client-side** from the prescription JSON behind a single `renderPrescriptionPdf()` boundary (§3.5) — the swap to server-side rendering (v1.2) touches nothing else.
- **Role-routing** after login (DA2) is convenience only; the **server is the enforcement boundary** (DA6).

---

## 6b. Maintainability & Change-Friendliness

Every common "change X later" has one obvious place — within the PRD's "don't over-engineer" guidance (seams where they pay, no premature abstraction elsewhere).

**Frontend**
- **Theme:** edit one variable in `tokens.css` → app-wide reskin; headroom for an alternate token set (dark/seasonal) without touching components.
- **Shared components:** change a component once → reflects across all 24 screens.
- **Routes:** a centralized route config with declarative role guards (`<RoleRoute role="doctor">`) and per-route lazy-loading (code-split for the 3G TTFB KPI). Add/guard a route in one entry.
- **Typed API client + shared types:** endpoints and types live once; a model change propagates by type.

**Backend**
- **Service layer** is the single home for business logic (controllers thin; workers reuse it).
- **State machine** is one module with an allowed-transition table.
- **Integration adapters** swap PayFast↔Safepay, Daily↔Agora, Resend↔SES (incl. AWS-native) without touching logic.
- **Config-driven Settings (A6)** allow runtime tuning (lead time, fallback fee) with no redeploy; Prisma migrations make schema change versioned; centralized Zod validation + a single audit-log writer give consistent change points.

---

## 7. Auth & Session Design

Hand-rolled, cookie-based, role-aware, audit-logged.

- **Sessions:** `express-session` + `connect-pg-simple` (sessions in the `session` table). Cookie is **HTTP-only, Secure, SameSite=Lax** (§3.6). Passwords hashed with **argon2** (bcrypt acceptable).
- **Sign-up (P2):** name, email, phone, password + **mandatory ToS/Privacy consent**, recorded as `tos_accepted_at`. Email uniqueness enforced by the DB; duplicate returns a clear error. No email verification in v1.
- **Login (DA2):** shared `/login` for all roles → on success, route by `users.role`. 
- **Patient password reset (P2):** emailed token, **1h expiry**, **enumeration-safe** (identical response for known/unknown emails).
- **Doctor onboarding (DA1):** admin creates the doctor and sets an initial password (shared out-of-band). **Forced first-login change (DA3)** via `must_change_password` — gated by middleware before the doctor panel.
- **Asymmetric recovery:** patient = self-service; **doctor = admin-mediated reset (DA5)** (sets `must_change_password`); **admin = no reset path** (bootstrap only, DA4).
- **Admin bootstrap (DA4):** one-off script, documented in the deploy runbook; no admin self-signup, no admin-creates-admin UI.
- **Authorization (DA6):** a single `requireRole(...)` middleware gates every authenticated route — never duplicated in handlers, never only on the frontend.
- **Abuse protection (§3.6):** `express-rate-limit` on login / forgot-password / sign-up / payment-intent; failed-login lockout/backoff (threshold + duration set in config). Breaches are audit-logged and, when sustained, surfaced to the A3 alert feed.
- **Auditing:** login, password change, and admin password reset are written to `audit_log` via `audit.service`.

---

## 8. Key Abstractions

- **Appointment state-machine service** — the only place transitions are defined (§4.3); validates allowed transitions, writes the audit entry, triggers side-effects (refund, email). Called by controllers and the evaluation worker.
- **Slot-lock lifecycle** — `slotLock.service` creates a `slot_locked` appointment with `lock_expires_at = now + 10min`; the unique index prevents a second lock; expiry releases it.
- **Refund orchestration** — `refund.service` computes amount (net of gateway fee, policy #5; fallback fee model from Settings when the gateway doesn't report one), calls the payment adapter with the per-appointment `refund_idempotency_key`, retries with backoff, raises an admin alert on exhaustion (#10, edge #30). No in-app manual retry.
- **Audit-log writer** — single append-only `audit.service.record(...)`; no update/delete path.
- **Integration adapters** — `PaymentProvider`, `VideoProvider`, `EmailProvider` JSDoc `@typedef` contracts; concrete `payfast.js`, `daily.js`, `resend.js`.
- **PDF render boundary** — `renderPrescriptionPdf(json)` on the client; the only thing that changes for the v1.2 server-side swap.

---

## 9. Data Flow (PRD §3.1)

1. **Booking → payment → confirmation.** Patient picks slot → `slotLock.service` locks for 10 min → redirect to PayFast hosted checkout → signed `payment.success` webhook → signature verified → **one transaction** commits the appointment (`confirmed`, `fee_at_booking`) + payment record (#2) → confirmation email enqueued.
2. **Reconciliation safety net.** Hourly worker queries PayFast for unconfirmed payments → completes the same atomic commit for any missed webhook. If the slot was already confirmed to another patient, the unique index (#1) blocks a second appointment → the paying patient is **fully refunded** (platform-caused), admin alerted, patient emailed (edge #6a).
3. **Consultation → prescription.** −10 min → Join Call activates → Daily issues time-bound tokens scoped to the slot window → call completes → doctor submits an **immutable** prescription (#4) → "prescription ready" email → patient downloads client-rendered PDF.
4. **Cancellation → refund.** Patient/doctor cancels → eligibility + amount computed → idempotent refund call → reference stored → dashboard shows status; backoff + admin alert on failure.
5. **Deactivation.** Admin deactivates doctor → `is_active=false` (removed from listing, new bookings blocked) → **existing confirmed appointments untouched** (#9); offboarding a non-serving doctor is per-appointment `doctor_cancelled` (D5).

---

## 10. Workers

In-process scheduled jobs (`node-cron`) calling the service layer; audit actor type `system`.

- **Reconciliation (hourly)** — see flow #2 / edge #6.
- **Notification** — schedules the 6 triggers; 24h/1h reminders are **skipped** for short-lead bookings (P4); the worker **re-checks appointment state immediately before dispatch** and suppresses reminders for any appointment no longer `confirmed`/`in_progress` (§3.4). Retry with backoff; admin alert on final failure.
- **Appointment-evaluation** — `confirmed→in_progress` at slot-start; finalizes `completed` at slot-end+5min once both joined (transient drops don't finalize, edge #22); at slot-start+15min evaluates join events: **doctor never joined → `doctor_no_show`** (refund net of fee + apology), doctor joined but patient didn't → `patient_no_show` (no refund). **Missing participant data → resolve to a non-penalizing terminal state + admin alert; never leave `in_progress` past slot-end+5min.**

---

## 11. Security & Authorization

- **HTTPS everywhere.** Session cookie HTTP-only/Secure/SameSite=Lax; passwords hashed (no plaintext).
- **Single authorization mechanism:** `requireRole` middleware (DA6) enforces patient/doctor/admin scoping server-side. A deactivated doctor still authenticates for routes scoped to their existing appointments (#9).
- **Payment data isolation:** card/wallet data never touches the platform — handled by PayFast hosted checkout.
- **Webhook authentication:** every inbound PayFast webhook is signature-verified; missing/invalid signatures are rejected and logged to the admin alert feed.
- **Video access:** Daily participant tokens are appointment-scoped and time-bound (slot-start−10min → slot-end+5min).
- **Audit log:** append-only, admin-only query API (A5); covers state transitions, auth, payment, refund, and admin operational actions.
- **Disputed marker:** a boolean flag on `appointments`, admin-set via A5, orthogonal to the state machine (§3.6).
- **Abuse protection & lockout:** rate-limits + failed-login backoff, audit-logged, escalated to A3 on sustained abuse.

---

## 12. Vendor Integration Notes

- **PayFast (payment adapter):** hosted checkout handoff; **signed webhook** verification on success/failure; **refund API** keyed by `refund_idempotency_key`; **reconciliation query** for unconfirmed payments over 24h. The gateway-reported fee is captured on the payment record and drives the refund amount, the cancellation-modal estimate, and the dashboard breakdown identically (policy #5); when no fee is reported, the Settings fallback model (A6) applies. Begin merchant **KYC in Week 1** (§5.2 risk).
- **Daily.co (video adapter):** one room per appointment; time-bound meeting tokens; browser-only join; participant join/leave events feed the evaluation worker. **Cost note (§5.2):** ~$0 under ~165 consults/mo, ~$64/mo at full 100/wk — a revenue-backed variable cost; the adapter seam allows a later swap to Agora or self-hosted LiveKit if 3G testing (M2) or cost warrants.
- **Resend (email adapter):** the 6 transactional triggers; bounce/complaint webhooks; retry/backoff lives in the notification worker. **No PDF attachments in v1** — the prescription-ready email links to the dashboard.

---

## 13. AWS Migration Path

The architecture is portable by construction:
- **Dockerfile + 12-factor env** → the same image runs on Railway now and **ECS Fargate / App Runner / Elastic Beanstalk** later, no code change.
- **PostgreSQL → RDS / Aurora PostgreSQL** is a `DATABASE_URL` change; Prisma migrations run identically.
- **Adapters** → swap Resend→**SES**, Daily→**Chime SDK** (or keep them; they're cloud-agnostic) behind the existing interfaces.
- **Workers** are isolated callable jobs → can stay in-process or move to **EventBridge + Lambda / ECS scheduled tasks**.
- Choose **`ap-south-1` (Mumbai)** to preserve the Karachi-latency target (KPI #8).

---

## 14. Getting Started / Scaffold

1. **Client:** `npm create vite@latest client -- --template react`; port `mockups/assets/css/{tokens,components}.css` into `client/src/styles/`; add the Google Fonts links from `_component-reference.html`.
2. **Backend:** init Express (JavaScript, ES modules); add a root `jsconfig.json` with `"checkJs": true` for editor type-checking; `npx prisma init` (PostgreSQL); define `schema.prisma`; `npx prisma migrate dev`.
3. **Same-origin serving:** in `server/src/index.js`, register `/api` routes, then `express.static(client/dist)` + an SPA catch-all (catch-all **last**).
4. **Sessions:** wire `express-session` + `connect-pg-simple` against the same Postgres.
5. **Config:** all secrets/URLs in env (`.env.example` is the contract): `DATABASE_URL`, `SESSION_SECRET`, `PAYFAST_*`, `DAILY_API_KEY`, `RESEND_API_KEY`, error-tracking DSN.
6. **Dockerfile:** multi-stage — build client, build server, run `node server/dist/index.js`.
7. **Admin bootstrap (DA4):** a one-off `prisma/scripts/bootstrap-admin.js`, documented in the runbook.
8. **Deploy:** Railway project → app service + Postgres plugin (auto-injects `DATABASE_URL`), region Mumbai/Singapore.

---

## 15. What NOT to Over-Engineer

| Area | Keep simple (v1) | Avoid |
|---|---|---|
| Auth | Cookie sessions in Postgres | OAuth/JWT infra, external IdP |
| State | React state/context | Redux/MobX |
| API | Same-origin REST | GraphQL, separate API gateway |
| Database | Single Postgres | Read replicas, sharding |
| Caching | None | Redis until measured |
| Workers | In-process cron | A separate queue/broker (until scale needs it) |
| PDF | Client-side render | Server-side rendering (v1.2 seam already isolated) |
| Video | Managed Daily | Self-hosting an SFU/TURN (deferred swap option) |
| Deploy | Single service | Multi-region, k8s |

---

## 16. Future Considerations

- **Self-hosted video swap** (LiveKit) — contained behind the video adapter if cost/3G warrants.
- **Server-side PDF** (v1.2) — enables email-attached, signed prescriptions; the render boundary is already isolated.
- **Medicine Ordering Module (PRD §6)** — reuses the payment adapter, audit log, and snapshot discipline; out of v1 scope.
- **Dermestha wallet, SMS/WhatsApp, Urdu, native apps, secondary bank gateway** — all accommodated by the adapter seams and the same backend.
- **AWS migration** — see §13.

---

## 17. Companion Specifications

This document is the high-level overview; the contract-level detail needed to start coding lives in focused companion files. Each cites its PRD/ARCH source so they stay in sync.

| File | Purpose | Resolves |
|---|---|---|
| `docs/engineering/API.md` | REST endpoint inventory (method · path · role · req/resp), API conventions (error envelope, status map, pagination), and the **§4.3 state-machine transition table**. Includes requirement-ID and invariant coverage checklists. | API surface, error contract, allowed transitions |
| `prisma/schema.prisma` | Runnable schema for §5: all enums, 12 models, declarable uniques. `prisma validate`-clean on Prisma 6.x. | Executable data model |
| `docs/engineering/CONFIG.md` | Every constant the PRD deferred to "an architecture decision": timing windows, rate limits/lockout, worker cadence, refund backoff, crypto/cookie params, migration caveats. | §3.6-mandated values |
| `docs/engineering/INTEGRATIONS.md` | The 3 adapter `@typedef` contracts (PaymentProvider/VideoProvider/EmailProvider) + PayFast/Daily/Resend payload shapes, the 6-email merge-var catalog, and the analytics event catalog. | Vendor seams (§12) |
| `.env.example` | The 12-factor config contract: all secrets/URLs + tunable defaults mirroring `CONFIG.md`. | Deploy config (§14.5) |

**The no-double-booking partial index (§5 #1) is added by a hand-edited migration** — flagged in `prisma/schema.prisma` and `CONFIG.md §7`.

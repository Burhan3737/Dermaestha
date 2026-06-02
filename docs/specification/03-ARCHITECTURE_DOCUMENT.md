# 03 — Architecture Document

| Field                | Value                              |
| -------------------- | ---------------------------------- |
| **Document ID**      | 03-ARCHITECTURE_DOCUMENT           |
| **Status**           | Canonical                          |
| **Version**          | 1.1                                |
| **Last updated**     | 2026-06-03                         |
| **Sources absorbed** | `docs/engineering/ARCHITECTURE.md` |
| **Related docs**     | 02, 04, 05, 10, 14, 15             |

---

## Index

1. [High-level architecture](#1-high-level-architecture)
2. [Technology stack](#2-technology-stack)
3. [Data flow diagrams](#3-data-flow-diagrams)
4. [Integration points](#4-integration-points)
5. [Deployment architecture](#5-deployment-architecture)
6. [Evolution direction](#6-evolution-direction)

---

## Purpose

This document defines how Dermestha v1 is wired: the structural decisions, technology stack, runtime data flows, external integrations, and deployment topology. Visual and theming decisions are owned by `DESIGN.md` and are not re-decided here.

---

## 1. High-level architecture

Dermestha v1 is a **single-deployable, same-origin monolith**: one JavaScript Express application that exposes a JSON API and serves the built React (Vite) single-page app from the same origin (no CORS). Business logic lives in a **service layer** (`model → controller → service`); a single **role middleware** is the server-side authorization boundary. Three **in-process background workers** advance time-based state. Three **external integrations** each sit behind a thin **adapter interface** so a vendor can be swapped without touching business logic.

**Components:**

- **Web client** — All three surfaces (patient / doctor / admin); discovery, booking, payment handoff, video, dashboards, prescription render. React + Vite (JavaScript + JSDoc), token-based CSS.
- **API + app core** — JSON API, service-layer business logic, state machine, invariants, authorization. Node + Express (JavaScript + JSDoc), Prisma.
- **Database** — Durable store for all domain data and server sessions. PostgreSQL (managed).
- **Reconciliation worker** — Hourly query of PayFast for unconfirmed payments; reconcile missed webhooks. `node-cron` (in-process).
- **Notification worker** — Schedule and dispatch the 6 email triggers; retry/backoff; reminder invalidation. `node-cron` (in-process).
- **Appointment-evaluation worker** — Advance `confirmed→in_progress`, resolve `completed`/no-show within the grace window. `node-cron` (in-process).
- **Payment adapter** — Hosted checkout, signed webhook verify, refund API, reconciliation query. PayFast.
- **Video adapter** — Per-appointment rooms, time-bound participant tokens. Daily.co.
- **Email adapter** — Transactional sends + bounce/failure signal. Resend.

---

## 2. Technology stack

| Decision              | Choice                                                                                                               | Rationale                                                                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Language**          | JavaScript end-to-end (ES modules), with `// @ts-check` + JSDoc type hints                                           | No build/transpile step and no `tsconfig`. JSDoc + `@ts-check` (via a `jsconfig.json`) gives editor-level type-checking on the risky invariant modules — the state machine, slot-lock, refund math — without committing to TypeScript. Prisma's generated client still surfaces model types through JSDoc/editor hints. |
| **App framework**     | Node + Express monolith, `model → controller → service`                                                              | Team expertise; serves the SPA same-origin → satisfies no-CORS requirement, one domain, cookie auth just works.                                                                                                                                                                                                         |
| **Frontend**          | Vite + React (JS) SPA, served by Express `static`                                                                    | Fast builds; one deployable; host-agnostic. SSR not needed at this scale (TTFB met via region + static serving + code-splitting). Client state: React Context (session) + TanStack Query (server cache), per ADR-20.                                                                                                                                                                                       |
| **Styling / theming** | Reuse the mockups' CSS-variable tokens (`tokens.css` + `components.css`); React components wrap existing BEM classes | CSS custom properties give the most manageable theming (one var → app-wide reskin) and are pixel-faithful to the approved mockups. MUI rejected: imposes Material look conflicting with the flat/squared design and adds bundle weight.                                                                                 |
| **Database**          | PostgreSQL + Prisma                                                                                                  | Relational, integrity-heavy, join-heavy data; native `UNIQUE`/FK/transactions satisfy data-integrity invariants directly; cleanest AWS path (RDS/Aurora).                                                                                                                                                               |
| **Sessions / auth**   | Hand-rolled cookie sessions — `express-session` + `connect-pg-simple` + `argon2` + `express-rate-limit`              | PRD mandates HTTP-only session cookies (not JWT). Auth has bespoke rules; hand-rolling fits the service layer and makes per-event audit-logging trivial, with fewest dependencies.                                                                                                                                      |
| **Hosting**           | Railway all-in-one (app + Postgres), Mumbai/Singapore region                                                         | Simplest managed setup; private app↔DB networking; always-on for webhooks/cron; under ~USD 50/mo budget.                                                                                                                                                                                                                |
| **Email**             | Resend (free tier)                                                                                                   | Free at ~2–3k/mo; bounce/complaint webhooks satisfy notification requirements.                                                                                                                                                                                                                                          |
| **Video**             | Daily.co (behind adapter)                                                                                            | Least development; room + time-bound token primitives map 1:1 to requirements; cost scales with paid consults.                                                                                                                                                                                                          |
| **Payments**          | PayFast (behind adapter)                                                                                             | Most established PK aggregator (first SBP commercial license, APPS-backed, PCI-DSS); one integration + KYC covers cards + JazzCash + Easypaisa + bank; hosted checkout, signed webhooks/IPN, refund API, reconciliation query.                                                                                          |
| **Scaffold**          | Lean scaffold, no third-party boilerplate                                                                            | No maintained boilerplate matches Express + React-SPA + Prisma + cookie-session RBAC; official Vite `react` + a clean Express/Prisma backend is lower-effort and better-fit. Borrow only config (Dockerfile, ESLint/Prettier/Husky/Zod).                                                                                |

---

## 3. Data flow diagrams

### 3a. Three-layer architecture

```mermaid
flowchart TB
    subgraph Presentation["Presentation — Browser (React SPA)"]
        UI["Patient views · Doctor views · Admin views<br/>Shared components · Token-based theme"]
    end

    subgraph Application["Application — Express Monolith (JavaScript)"]
        direction TB
        Routes["API routes → Controllers → Service layer<br/>Role middleware (requireRole) · Rate-limit / Validation"]
        Workers["In-process workers<br/>(Reconciliation · Notification · Appointment-evaluation)"]
        Adapters["Integration adapters<br/>(PaymentProvider · VideoProvider · EmailProvider)"]
        Routes --> Workers
        Routes --> Adapters
    end

    subgraph Data["Data — PostgreSQL"]
        DB["App data + Server sessions"]
    end

    Externals["External services<br/>PayFast · Daily.co · Resend"]

    Presentation -- "Same-origin HTTPS (cookies)" --> Application
    Application -- "Prisma client" --> Data
    Adapters --> Externals
```

### 3b. Booking → Payment → Confirmation sequence

```mermaid
sequenceDiagram
    participant P as Patient (Browser)
    participant E as Express (service layer)
    participant PF as PayFast
    participant DB as PostgreSQL

    P->>E: Pick slot → initiate booking
    E->>DB: slot_locked appointment (lock_expires_at = now+10 min)
    Note over DB: Partial unique index prevents double-lock
    E-->>P: Redirect to PayFast hosted checkout
    P->>PF: Complete payment
    PF->>E: Signed payment.success webhook
    E->>E: Verify webhook signature
    E->>DB: Atomic transaction — appointment → confirmed<br/>+ fee_at_booking captured + payment record
    E->>E: Enqueue confirmation email (notification worker)
    E-->>P: Confirmation shown on dashboard
```

### 3c. Core business process flows

```mermaid
flowchart TD
    A([Consultation starts]) --> B[Daily.co time-bound<br/>tokens issued]
    B --> C[Video call in progress]
    C --> D{Call completed?}
    D -- Yes --> E[Doctor submits<br/>immutable prescription]
    E --> F[Prescription-ready<br/>email enqueued]
    F --> G([Patient downloads<br/>client-rendered PDF])

    H([Patient or doctor<br/>cancels appointment]) --> I{Eligibility check}
    I -- Refund eligible --> J[Compute net-of-fee<br/>refund amount]
    J --> K[Idempotent refund call<br/>to PayFast adapter]
    K --> L{Refund succeeded?}
    L -- Yes --> M([Dashboard shows<br/>refund status])
    L -- No --> N[Retry with backoff<br/>Admin alert on exhaustion]

    O([Reconciliation worker<br/>hourly]) --> P[Query PayFast for<br/>unconfirmed payments]
    P --> Q{Missed webhook<br/>found?}
    Q -- Yes --> R[Atomic commit<br/>or refund if slot taken]
    Q -- No --> S([No action needed])
```

---

## 4. Integration points

Three external services, each behind a thin adapter interface:

- **PayFast (payment adapter)** — Hosted checkout handoff; signed webhook verification on success/failure; refund API keyed by `refund_idempotency_key`; reconciliation query for unconfirmed payments. Accessed only through the `PaymentProvider` adapter interface (`server/src/integrations/payment/`). Detailed payload contracts and field descriptions live in doc 14.
- **Daily.co (video adapter)** — One room per appointment; time-bound meeting tokens scoped to the slot window; browser-only join; participant join/leave events feed the appointment-evaluation worker. Accessed only through the `VideoProvider` adapter interface (`server/src/integrations/video/`). Detailed contracts live in doc 14.
- **Resend (email adapter)** — The 6 transactional email triggers; bounce/complaint webhooks; retry/backoff managed by the notification worker. No PDF attachments in v1. Accessed only through the `EmailProvider` adapter interface (`server/src/integrations/email/`). The 6-email merge-variable catalog and trigger conditions live in doc 14.

There are no message queues or other third-party infrastructure services. The three background workers (reconciliation, notification, appointment-evaluation) are in-process `node-cron` jobs calling the service layer directly.

---

## 5. Deployment architecture

**Local development** — `docker-compose.yml` runs two services: the app container and a Postgres container. All secrets and URLs are loaded from `.env` (contract: `.env.example`). Prisma migrations run via `npx prisma migrate dev`. Detailed local-environment steps live in doc 10.

**Production** — Railway all-in-one deployment: one app service (Docker image built from the multi-stage `Dockerfile`) + a managed Postgres plugin (auto-injects `DATABASE_URL`). Region: Mumbai or Singapore to minimize Karachi-latency. The same Docker image that runs locally is pushed to Railway; all configuration is injected via environment variables (12-factor). Always-on for webhooks and cron workers. Detailed deploy runbook, environment variable listing, and admin-bootstrap procedure live in doc 10.

---

## 6. Evolution direction

**AWS migration path (§13)** — The architecture is portable by construction. The same Docker image runs on Railway now and on ECS Fargate / App Runner / Elastic Beanstalk later with no code change. Migrating to RDS/Aurora PostgreSQL is a `DATABASE_URL` change; Prisma migrations run identically. Resend can be swapped for SES; Daily.co can be swapped for Chime SDK — both behind their existing adapter interfaces. In-process workers can stay in-process or move to EventBridge + Lambda / ECS scheduled tasks. Region `ap-south-1` (Mumbai) preserves the Karachi-latency target.

**Future considerations (§16):**

- **Self-hosted video swap** (LiveKit) — contained behind the `VideoProvider` adapter if cost or 3G performance warrants.
- **Server-side PDF** (v1.2) — enables email-attached, signed prescriptions; the `renderPrescriptionPdf()` boundary is already isolated on the client.
- **Medicine Ordering Module (PRD §6)** — reuses the payment adapter, audit log, and snapshot discipline; out of v1 scope.
- **Dermestha wallet, SMS/WhatsApp, Urdu, native apps, secondary bank gateway** — accommodated by the adapter seams and the same backend.

---

## Revision footer

| Date       | Change           | Why                                                            |
| ---------- | ---------------- | -------------------------------------------------------------- |
| 2026-06-01 | Initial creation | Faithful re-presentation of `docs/engineering/ARCHITECTURE.md` |
| 2026-06-03 | Noted frontend state stack (Context + TanStack Query) in §2 | Reflects ADR-20 (Slice A) |

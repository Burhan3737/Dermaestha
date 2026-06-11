# 11 — Architecture Decision Record

| Field            | Value                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Document ID      | 11-ARCHITECTURE_DECISION_RECORD                                                                    |
| Status           | Canonical                                                                                          |
| Version          | 1.9                                                                                                |
| Last updated     | 2026-06-12                                                                                         |
| Sources absorbed | `docs/engineering/ARCHITECTURE.md §3/§5/§8/§10/§12/§15; agentChangeLogs/; docs/superpowers/specs/` |
| Related docs     | 03, 04, 05, 14                                                                                     |

---

## Index

1. [Purpose](#purpose)
2. [ADR-01 — PostgreSQL + Prisma over a document database](#adr-01--postgresql--prisma-over-a-document-database)
3. [ADR-02 — JavaScript + JSDoc + @ts-check over TypeScript](#adr-02--javascript--jsdoc--ts-check-over-typescript)
4. [ADR-03 — Same-origin Express monolith serving the React SPA](#adr-03--same-origin-express-monolith-serving-the-react-spa)
5. [ADR-04 — Vite + React SPA (no SSR)](#adr-04--vite--react-spa-no-ssr)
6. [ADR-05 — Hand-rolled cookie sessions over JWT or external IdP](#adr-05--hand-rolled-cookie-sessions-over-jwt-or-external-idp)
7. [ADR-06 — CSS-variable token system over a component library (MUI)](#adr-06--css-variable-token-system-over-a-component-library-mui)
8. [ADR-07 — No-double-booking via a hand-added partial unique index](#adr-07--no-double-booking-via-a-hand-added-partial-unique-index)
9. [ADR-08 — In-process node-cron workers over a separate queue/broker](#adr-08--in-process-node-cron-workers-over-a-separate-queuebroker)
10. [ADR-09 — Client-side PDF rendering with an isolated boundary](#adr-09--client-side-pdf-rendering-with-an-isolated-boundary)
11. [ADR-10 — Integration adapters behind JSDoc @typedef contracts](#adr-10--integration-adapters-behind-jsdoc-typedef-contracts)
12. [ADR-11 — Net-of-gateway-fee refunds (policy #5)](#adr-11--net-of-gateway-fee-refunds-policy-5)
13. [ADR-12 — Doctor-absence precedence in no-show resolution](#adr-12--doctor-absence-precedence-in-no-show-resolution)
14. [ADR-13 — Deactivation preserves existing appointments](#adr-13--deactivation-preserves-existing-appointments)
15. [ADR-14 — Railway all-in-one hosting with a 12-factor Docker image](#adr-14--railway-all-in-one-hosting-with-a-12-factor-docker-image)
16. [ADR-15 — Vendor selection: PayFast, Daily.co, Resend](#adr-15--vendor-selection-payfast-dailyco-resend)
17. [ADR-16 — Lean scaffold with no third-party boilerplate](#adr-16--lean-scaffold-with-no-third-party-boilerplate)
18. [ADR-17 — Prisma pinned to 6.x (not 7+)](#adr-17--prisma-pinned-to-6x-not-7)
19. [ADR-18 — Vite 5 (esbuild) pinned over Vite 8 (rolldown)](#adr-18--vite-5-esbuild-pinned-over-vite-8-rolldown)
20. [ADR-19 — Documentation suite: sole source of truth / faithful re-presentation only](#adr-19--documentation-suite-sole-source-of-truth--faithful-re-presentation-only)
21. [ADR-20 — Frontend state: React Context (session) + TanStack Query (server cache)](#adr-20--frontend-state-react-context-session--tanstack-query-server-cache)
22. [ADR-21 — Asia/Karachi ↔ UTC via date-fns-tz](#adr-21--asiakarachi--utc-via-date-fns-tz)
23. [ADR-22 — Dev payment simulation: mock gateway with a real signed IPN](#adr-22--dev-payment-simulation-mock-gateway-with-a-real-signed-ipn)
24. [ADR-23 — Lazy slot-lock expiry (no background worker)](#adr-23--lazy-slot-lock-expiry-no-background-worker)
25. [ADR-24 — Dev video simulation: mock provider + real webhook + dev simulator](#adr-24--dev-video-simulation-mock-provider--real-webhook--dev-simulator)
26. [ADR-25 — Appointment-evaluation worker: in-process node-cron (realizing ADR-08)](#adr-25--appointment-evaluation-worker-in-process-node-cron-realizing-adr-08)
27. [ADR-26 — Feature-first client modules + domain-based server modules](#adr-26--feature-first-client-modules--domain-based-server-modules)
28. [ADR-27 — Notification outbox + in-process dispatch/retry/reconciliation workers](#adr-27--notification-outbox--in-process-dispatchretryreconciliation-workers)
29. [ADR-28 — State-guarded transition write + per-prescription outbox dedupe key](#adr-28--state-guarded-transition-write--per-prescription-outbox-dedupe-key)

---

## Purpose

This document records every significant architecture and technology decision made for Dermestha v1, capturing what was chosen, why, and what each decision enables or rules out. Each entry traces directly to a source document and is intended to be the first reference when questioning a current constraint or planning a future change.

---

## ADR-01 — PostgreSQL + Prisma over a document database

**Date:** 2026-05-30

**Context:** The PRD §3.3 specifies ten non-negotiable data-integrity invariants including no-double-booking, idempotent payments, atomic booking + payment confirmation, prescription immutability, and snapshot captures at write time. These invariants require unique constraints, foreign keys, atomic multi-table transactions, and partial indexes — all native relational-database primitives. The data is also join-heavy (appointments reference users, doctors, payments, prescriptions). (ARCHITECTURE.md §3)

**Decision:** PostgreSQL as the database, accessed through the Prisma ORM (v6.x). Money stored as integer PKR to avoid float drift. All timestamps stored as `timestamptz` in UTC.

**Consequences:** Native `UNIQUE` constraints, foreign keys, and SQL transactions satisfy PRD §3.3 invariants directly without application-layer workarounds. Prisma provides a type-safe generated client and versioned migrations. The cleanest AWS migration path is a `DATABASE_URL` swap to RDS/Aurora PostgreSQL — no code change required. A document database would require all invariant enforcement at the application layer, increasing complexity and risk. Prisma 6.x is pinned because Prisma 7 removed in-schema `datasource.url` support (see ADR-17).

---

## ADR-02 — JavaScript + JSDoc + @ts-check over TypeScript

**Date:** 2026-05-30

**Context:** The project requires type safety on the highest-risk modules (§4.3 state machine, slot-lock service, refund math) without the overhead of a TypeScript build pipeline, `tsconfig` maintenance, or compile step for a v1 monolith. (ARCHITECTURE.md §3)

**Decision:** JavaScript end-to-end (ES modules) with `// @ts-check` directives and JSDoc type hints on invariant modules, governed by a root `jsconfig.json` with `"checkJs": true`. Prisma's generated client surfaces model types through JSDoc/editor hints.

**Consequences:** Editors (VS Code) provide type-checking and autocompletion on annotated modules without a build step. No `tsc` compile is needed; the same JS files run directly in Node. The trade-off is that type errors are surfaced in the IDE only, not at CI compile time. TypeScript can be adopted incrementally later without a rewrite — JSDoc-annotated JS is forward-compatible.

---

## ADR-03 — Same-origin Express monolith serving the React SPA

**Date:** 2026-05-30

**Context:** The PRD §3.2 requires HTTP-only session cookies for authentication. Session cookies with `SameSite=Lax` and `Secure` are most reliable on the same origin; a split frontend/API deployment introduces CORS complexity and cross-origin cookie headaches. Team expertise is in Node/Express. (ARCHITECTURE.md §3)

**Decision:** A single Node + Express application serves both the JSON API (under `/api`) and the built React SPA (`express.static` + catch-all). One deployable unit; one domain; no CORS configuration required.

**Consequences:** Cookie-based auth works without CORS headers or credentialed cross-origin requests. One deployable simplifies Railway hosting and Docker image management. The architecture rules out running the frontend on a separate CDN domain at v1 (that path would require CORS and credentialed fetch configuration). AWS migration is a single-image redeploy — no service topology change needed. `trust proxy` must be set to `1` when running behind a TLS-terminating proxy (Railway) so that `req.secure` evaluates correctly and the `Secure` cookie flag is honoured.

---

## ADR-04 — Vite + React SPA (no SSR)

**Date:** 2026-05-30

**Context:** The platform serves patients on 3G mobile, doctors on desktop, and an admin surface — three distinct surfaces with a time-to-first-byte KPI (KPI #8). SSR complexity is not warranted at v1 scale. The monolith's regional co-location (Mumbai/Singapore) and code-splitting can meet TTFB targets without SSR. (ARCHITECTURE.md §3)

**Decision:** React SPA built with Vite, served as static assets from Express. No server-side rendering in v1. Code-splitting via React lazy/Suspense for the 3G TTFB KPI. Client pinned to Vite 5 (see ADR-18).

**Consequences:** Fast builds; host-agnostic static assets; one deployable. SSR (e.g., React Server Components, Next.js) is deferred — it would benefit SEO and initial load time but is not required by PRD v1 scope and adds significant complexity. The absence of SSR means the initial HTML payload is a shell; content loads after JS executes.

---

## ADR-05 — Hand-rolled cookie sessions over JWT or external IdP

**Date:** 2026-05-30

**Context:** PRD §3.6 explicitly mandates HTTP-only session cookies (not JWT). Auth has bespoke per-role rules (DA1–DA6): asymmetric recovery paths (patient self-service vs. doctor admin-mediated), forced first-login password change (`must_change_password`), admin bootstrap only (no admin self-signup), per-event audit-logging, rate-limit lockout, and a disputed-appointment flag. These rules do not map cleanly onto a generic OAuth/IdP flow. (ARCHITECTURE.md §3, §7)

**Decision:** Hand-rolled cookie sessions using `express-session` + `connect-pg-simple` (sessions stored in the `session` Postgres table) + `argon2` (password hashing) + `express-rate-limit`. No JWT, no OAuth, no external IdP in v1.

**Consequences:** Each session is a server-side row — revocation is instant (delete the row). Per-event audit logging in `audit_log` is trivial because every auth action passes through the service layer. The bespoke DA1–DA6 rules are implemented cleanly without fighting an IdP's opinionated flows. The trade-off is that session storage must scale with the Postgres instance; for v1 single-instance this is not a constraint. External IdP (e.g. Auth0, Cognito) is explicitly ruled out at v1 (ARCHITECTURE.md §15).

---

## ADR-06 — CSS-variable token system over a component library (MUI)

**Date:** 2026-05-30

**Context:** DESIGN.md §8 deferred the design-system binding decision to the architecture step. The approved mockups use a flat/squared visual language with a specific CSS token system (`tokens.css` + `components.css`). Pixel-fidelity to the approved mockups is required. KPI #8 targets bundle weight. (ARCHITECTURE.md §3)

**Decision:** Port the mockups' `tokens.css` and `components.css` verbatim into `client/src/styles/`. React components reference existing BEM class names. CSS custom properties are the single theming mechanism. MUI was explicitly evaluated and rejected.

**Consequences:** The component library is pixel-faithful to the approved mockups with no Material Design overrides needed. One CSS variable change produces an app-wide reskin (dark mode, seasonal). Bundle weight is minimal compared to a full component library. The trade-off is that the ~16 shared components must be built by hand rather than imported from a library. MUI was rejected because it imposes a Material look conflicting with the flat/squared design and adds unnecessary bundle weight against KPI #8.

---

## ADR-07 — No-double-booking via a hand-added partial unique index

**Date:** 2026-05-30

**Context:** PRD invariant #1 requires that no two active appointments can occupy the same doctor slot. "Active" excludes the releasing states (`cancelled_refunded`, `doctor_cancelled`) so a freed slot is immediately rebookable. Validation at the application layer (check-then-insert) is subject to a race condition under concurrent booking. (ARCHITECTURE.md §5)

**Decision:** A partial unique index on the `appointments` table enforces the constraint at write time:

```sql
CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
  WHERE state IN ('slot_locked','confirmed','in_progress','completed',
                  'prescription_issued','cancelled_no_refund');
```

Prisma's DSL cannot express a `WHERE` clause on a `UNIQUE` index, so this index is added by hand-editing the generated migration SQL. The caveat is documented in the `prisma/schema.prisma` header and doc 04 §4b.

**Consequences:** A second insert for a held slot fails at the database write — not at validation — making a double-booking impossible regardless of concurrency. Releasing states are excluded so freed slots are immediately rebookable. The hand-edited migration must be re-applied manually if the `init` migration is ever recreated (see doc 04 §4b). This is the single highest-risk maintenance rule in the codebase: the index must never be accidentally dropped.

---

## ADR-08 — In-process node-cron workers over a separate queue/broker

**Date:** 2026-05-30

**Context:** Three time-based background jobs are required: reconciliation (hourly PayFast query), notification dispatch (6 email triggers), and appointment-evaluation (state advancement). At v1 scale, a separate queue/broker (Redis, SQS, BullMQ) would be speculative infrastructure. ARCHITECTURE.md §15 explicitly lists "A separate queue/broker (until scale needs it)" as something to avoid. (ARCHITECTURE.md §10, §15)

**Decision:** All three workers run in-process as `node-cron` scheduled jobs inside the Express server process. Workers call the service layer directly, with audit actor type `system`.

**Consequences:** Zero additional infrastructure; simpler deployment (single process, single Railway service). Workers share the Prisma client singleton and service layer without IPC or serialization. The single-instance assumption is explicit: workers are not idempotent across horizontal replicas, so horizontal scaling would require extracting workers to a separate process or using a distributed lock. The seam (isolated `workers/` directory calling only the service layer) makes that extraction straightforward later.

---

## ADR-09 — Client-side PDF rendering with an isolated boundary

**Date:** 2026-05-30

**Context:** PRD §3.5 requires that patients can download prescriptions as PDFs. Server-side PDF generation (Puppeteer, wkhtmltopdf) adds a binary dependency to the Docker image and server-side CPU load. At v1 scale, client-side rendering is sufficient. A future v1.2 requirement for email-attached, digitally-signed prescriptions will require server-side rendering. (ARCHITECTURE.md §6, §8, §15)

**Decision:** Prescription PDFs are rendered client-side from the prescription JSON via a single `renderPrescriptionPdf(json)` function in `client/src/lib/`. This function is the only call site for PDF logic; no PDF dependency exists in the server package.

**Consequences:** No server-side binary dependency; no server CPU usage for PDF generation. The isolated boundary (`renderPrescriptionPdf`) means the v1.2 swap to server-side rendering touches exactly one call site and one new server endpoint — nothing else changes. The trade-off is that PDF rendering relies on the patient's browser; very old or low-memory browsers may struggle with large prescription histories (deferred concern at v1 scale).

---

## ADR-10 — Integration adapters behind JSDoc @typedef contracts

**Date:** 2026-05-30

**Context:** Three external vendors are required: PayFast (payments), Daily.co (video), and Resend (email). Each has a Pakistan-specific or cost-driven rationale that may not hold at scale or if a vendor changes pricing/availability. ARCHITECTURE.md §12 documents explicit swap candidates (PayFast→Safepay, Daily→Agora/LiveKit, Resend→SES). Business logic must not depend on vendor-specific APIs. (ARCHITECTURE.md §4, §6b, §8, §12)

**Decision:** Each integration is encapsulated behind a JSDoc `@typedef` contract: `PaymentProvider`, `VideoProvider`, `EmailProvider`. Concrete implementations (`payfast.js`, `daily.js`, `resend.js`) live in `server/src/integrations/{payment,video,email}/` and are selected at runtime via a barrel `index.js`. Business logic calls only the typedef contract.

**Consequences:** Swapping a vendor is a new file + a config switch — no business-logic changes. AWS migration can replace Resend with SES and Daily with Chime SDK behind the same interfaces. The stub pattern (`NOT_IMPLEMENTED` stubs throwing `AppError 501`) allows M0 scaffold tests to run without live credentials. The trade-off is that each typedef contract must be kept in sync with what the concrete adapter actually provides.

---

## ADR-11 — Net-of-gateway-fee refunds (policy #5)

**Date:** 2026-05-30

**Context:** PRD policy #5 defines that patient refunds are calculated net of the gateway fee, not at the full payment amount. The gateway fee is reported by PayFast on the payment record; when not reported, a fallback fee model (percentage + fixed, configurable via Settings A6) is used. This is a business unit-economics decision recorded in the PRD. (ARCHITECTURE.md §8, §12)

**Decision:** The refund logic (in `modules/appointment/service.js` since the ADR-26 restructure) computes the refund amount as `payment.amount − gateway_fee`. When `gateway_fee` is not reported by PayFast, the Settings `fallback_fee_pct` + `fallback_fee_fixed` (admin-configurable, A6) apply. The gateway-reported fee is captured on the `payments` record at booking time and drives the refund amount, the cancellation-modal estimate, and the dashboard breakdown identically.

**Consequences:** The platform absorbs the gateway cost on cancellations rather than passing it to the patient as a surprise deduction beyond what was shown at booking. The fallback fee model is admin-configurable at runtime (no redeploy required). The `refund_idempotency_key` UNIQUE constraint on `payments` (invariant #10) ensures no duplicate refunds are issued regardless of retry behaviour.

---

## ADR-12 — Doctor-absence precedence in no-show resolution

**Date:** 2026-05-30

**Context:** The appointment-evaluation worker must resolve the no-show state when a slot lapses without both participants joining. Two outcomes are possible: `doctor_no_show` (doctor never joined — full refund net of fee + apology to patient) or `patient_no_show` (doctor joined, patient did not — no refund). When participant join-event data is ambiguous or missing, neither outcome is safe to assert blindly. PRD §4.3 states the resolution rule. (ARCHITECTURE.md §10)

**Decision:** If participant-join data is missing or ambiguous at resolution time, the worker resolves to a non-penalizing terminal state and raises an admin alert. The evaluation order is: if the doctor never joined → `doctor_no_show`; if the doctor joined but the patient did not → `patient_no_show`. The system never leaves an appointment in `in_progress` past slot-end+5min.

**Consequences:** A patient is never penalized for a system data failure; the platform takes the financial risk of ambiguous resolution. Admin is always alerted on data-gap resolutions so manual review is possible. The hard deadline (slot-end+5min) prevents appointments from being stranded in a non-terminal state indefinitely.

---

## ADR-13 — Deactivation preserves existing appointments

**Date:** 2026-05-30

**Context:** PRD invariant #9 states that deactivating a doctor must not cascade-cancel their confirmed future appointments. Existing patients with confirmed appointments have a reasonable expectation that their appointment will proceed. A cascade-cancel would require automatic refunds and notifications for each affected patient. (ARCHITECTURE.md §9)

**Decision:** When admin deactivates a doctor (`is_active = false`), the doctor is removed from the public listing and no new bookings are accepted for that doctor. All existing confirmed appointments are left untouched. The doctor's sessions for those appointments remain accessible via routes scoped to their existing appointments (DA6 still authenticates deactivated doctors for their appointment scope).

**Consequences:** Patients with confirmed appointments are not disrupted by a deactivation action. The offboarding path for a doctor who will not serve their remaining appointments uses the per-appointment `doctor_cancelled` transition (D5), which triggers the appropriate refunds and notifications individually. There is no bulk-cancel UI or API in v1.

---

## ADR-14 — Railway all-in-one hosting with a 12-factor Docker image

**Date:** 2026-05-30

**Context:** PRD §3.2 requires hosting under approximately USD 50/month. The team needs managed Postgres with private networking, always-on availability for payment webhooks and cron workers, and a deployment near Karachi (to meet KPI #8 latency target). A future migration to AWS is a first-class constraint. (ARCHITECTURE.md §3, §13)

**Decision:** Railway all-in-one deployment: one app service + Railway's managed Postgres plugin, Mumbai/Singapore region. The application ships as a Docker image with all configuration injected as environment variables (12-factor). The multi-stage Dockerfile builds the React SPA in a `client-build` stage and runs the Express server in the `runtime` stage.

**Consequences:** Single-service simplicity; private app↔DB networking; always-on for webhooks and cron; under the ~USD 50/mo budget. The 12-factor configuration means the same Docker image runs on Railway now and on AWS ECS Fargate / App Runner / Elastic Beanstalk later with only a `DATABASE_URL` and secrets change — no code change. Multi-region, Kubernetes, and redundancy are explicitly deferred (ARCHITECTURE.md §15).

---

## ADR-15 — Vendor selection: PayFast, Daily.co, Resend

**Date:** 2026-05-30

**Context:** Three integration categories require vendor picks: payments, video consultation, and transactional email. Each must fit the Pakistan market, the v1 budget, and the §3.4 functional requirements. (ARCHITECTURE.md §3, §12)

**Decision:**

- **PayFast** for payments: most established Pakistan aggregator (first SBP commercial licence, APPS-backed, PCI-DSS). One integration and one KYC covers cards + JazzCash + Easypaisa + bank transfer. Provides hosted checkout, signed webhooks/IPN, refund API, and reconciliation query endpoint.
- **Daily.co** for video: fewest development primitives needed; room + time-bound participant token model maps 1:1 to the per-appointment video requirement (PRD §3.4). Cost scales with paid consults (~$0 under ~165 consults/month, ~$64/month at 100 consults/week — a revenue-backed variable cost).
- **Resend** for email: free tier sufficient at ~2–3k messages/month for v1; bounce and complaint webhooks satisfy PRD §3.4 notification reliability requirements.

**Consequences:** PayFast KYC must begin in Week 1 (PRD §5.2 risk item). Daily.co cost is a variable tied to revenue, but the adapter seam allows a swap to Agora or self-hosted LiveKit if 3G testing (M2) or cost warrants. Resend→AWS SES is a zero-code swap behind the `EmailProvider` adapter. All three are behind adapter contracts (ADR-10), so none are locked in.

---

## ADR-16 — Lean scaffold with no third-party boilerplate

**Date:** 2026-05-30

**Context:** The stack is Express + React SPA + Prisma + cookie-session RBAC — a combination not covered by any maintained boilerplate at the time of the architecture decision. Using an unmatched boilerplate would require significant stripping and creates update-dependency risk. (ARCHITECTURE.md §3)

**Decision:** Scaffold from first principles: `npm create vite@latest` for the React client; a clean Express + Prisma backend initialized by hand. Borrow only configuration files (Dockerfile, ESLint/Prettier/Husky/Zod) where these are commodity choices.

**Consequences:** The scaffold contains exactly the dependencies the project needs with no unused framework code. Each dependency is a deliberate choice. The trade-off is that there is no ongoing boilerplate upstream to pull security patches from — this is mitigated by the lean dependency list and the deliberate use of well-maintained, individually-audited packages.

---

## ADR-17 — Prisma pinned to 6.x (not 7+)

**Date:** 2026-05-31

**Context:** During M0 scaffold execution, Prisma 7 was evaluated. Prisma 7 removed support for `datasource.url` declared directly in `schema.prisma`, requiring a `prisma.config.ts` file and driver adapters — a heavier configuration model than v1 needs. (agentChangeLogs/2026-05-31-1509-architecture-coding-base.md; agentChangeLogs/2026-05-31-1700-m0-foundation-scaffold.md)

**Decision:** Prisma pinned to exactly `6.19.3` (not `^6` or `^7`) in `package.json`. This pin is documented in doc 15 §7 (Migration Caveats) and in the `.env.example` `DATABASE_URL` comment.

**Consequences:** The `datasource.url` syntax in `schema.prisma` continues to work. The exact pin (not a caret range) prevents an inadvertent major-version bump during `npm install`. When upgrading Prisma in future, the doc 15 §7 caveat and any `prisma.config.ts` migration requirements must be assessed first.

---

## ADR-18 — Vite 5 (esbuild) pinned over Vite 8 (rolldown)

**Date:** 2026-05-31

**Context:** The initial client scaffold used `npm create vite@latest`, which generated a Vite 8 (rolldown-based) project. Vite 8's CSS minification requires the `lightningcss` native binary, which resolves to a platform-specific package at `npm install` time. The Windows-generated lockfile contained the `lightningcss-win32-x64-msvc` binary; the Linux binary (`lightningcss-linux-x64-gnu`) was absent from the lockfile, causing the Docker multi-stage build to fail at the `vite build` step on Linux. (agentChangeLogs/2026-05-31-1700-m0-foundation-scaffold.md)

**Decision:** The client is pinned to Vite 5 + `@vitejs/plugin-react 4` + Vitest 2 (esbuild minifier; no native binary dependencies). `vite`, `@vitejs/plugin-react`, and `vitest` are pinned in `client/package.json`. These versions must not be bumped without verifying the Docker Linux build.

**Consequences:** The Docker image builds correctly on Linux from a Windows-generated lockfile. The esbuild minifier is performant and well-tested for this use case. The constraint is that `npm create vite@latest` must not be re-run, and the pinned versions must not be upgraded without explicit Docker verification. If Vite 8 is adopted in future, the lockfile must be regenerated on a Linux environment or with a cross-platform optional-dependency strategy.

---

## ADR-19 — Documentation suite: sole source of truth / faithful re-presentation only

**Date:** 2026-06-01

**Context:** The repository held high-fidelity engineering docs (PRD, ARCHITECTURE, API, DESIGN, CONFIG, INTEGRATIONS, schema) in non-standardized locations with no governance layer. The team needed a single navigable canonical suite that an agent or developer could rely on without cross-referencing multiple scattered files. The risk of "creative re-interpretation" when generating documentation from source material was identified as a correctness hazard. (docs/superpowers/specs/2026-06-01-documentation-suite-design.md; agentChangeLogs/2026-06-01-2321-documentation-suite-design.md)

**Decision:** A 16-document numbered suite (`docs/specification/00`–`15`) is generated as a faithful re-presentation of existing source documents. The governing rules: (1) the suite is the sole source of truth; existing `docs/engineering/`, `docs/product/`, `docs/design/` files are deprecated-by-policy but left physically unchanged; (2) each document only reorganizes, structures, and indexes existing information — no facts are invented, altered, or dropped; (3) each document carries a "Sources absorbed" metadata line as a diff-able audit trail; (4) cross-referencing uses stable IDs (`FNN`, `ADR-NN`, `TC-F00-000`, etc.) rather than duplicating prose.

**Consequences:** Any agent or developer reading a specification document can trust it reflects the actual source without creative re-interpretation. Deprecation-by-policy means the original docs are preserved for reference but not maintained as canon. The faithful re-presentation constraint means the suite does not fill gaps in the source material — open questions in the source remain open questions in the suite. The change-impact matrix in doc 00 governs which suite documents must be updated when a source fact changes.

---

## ADR-20 — Frontend state: React Context (session) + TanStack Query (server cache)

**Date:** 2026-06-03

**Context:** The frontend (patient/doctor/admin SPA) has three distinct kinds of state: session/identity (who is logged in — global, changes rarely), server-cache data (doctor listings, appointments, refund status, slot availability — owned by the backend, must be cached/refetched/invalidated), and local UI state (form fields, modal open/closed). The canonical stack (ADR-04/ADR-06) was deliberately lean — `react`, `react-dom`, `react-router-dom`, no state library. Edge case #4 (doc 02) requires the frontend to refresh stale data on window focus. Conflating these three state kinds into one store causes re-render churn and manual cache invalidation as the dashboards grow. (docs/superpowers/specs/2026-06-03-slice-a-identity-access-design.md)

**Decision:** Session/identity is held in a hand-rolled **React Context** (`SessionProvider` + `useSession`), hydrated from `GET /api/auth/me`. Server-cache data is managed by **TanStack Query** (`@tanstack/react-query`), added as the one new client dependency, with `refetchOnWindowFocus` enabled to satisfy edge #4. Local UI state uses `useState`/`useReducer`. All network calls — for both Context and Query — route through the single `apiClient` seam.

**Consequences:** Clean separation of concerns: Context owns identity, Query owns server data (cache keys, dedup, loading/error states, focus refetch), and `apiClient` stays the single network seam so fetch internals or interceptors change in one place. Auth mutations via `useMutation` give free pending/error states and `queryClient.invalidateQueries()` after login/logout. The trade-off is one added client dependency against the lean-scaffold principle (ADR-16); it is justified by the number of data-driven views across M1–M4 and the explicit edge-#4 focus-refetch requirement. Redux/Zustand/MobX and a single global app store were considered and rejected (churn + manual invalidation at this app's size).

---

## ADR-21 — Asia/Karachi ↔ UTC via date-fns-tz

**Date:** 2026-06-03

**Context:** Doctor availability is authored as `Asia/Karachi` wall-times ("HH:mm" + weekday) but stored and served as UTC instants (doc 04/15). Generating 30-minute slots for a calendar date requires converting a local wall-time to the correct UTC instant, and the availability guard must map a UTC `slotStart` back to a Karachi weekday/time. A hand-rolled fixed +05:00 offset works today (Pakistan observes no DST) but is brittle and easy to get subtly wrong. (docs/superpowers/specs/2026-06-03-slice-b-discovery-availability-design.md)

**Decision:** Use `date-fns-tz` **server-side** for the conversions (`fromZonedTime`) and zone-aware formatting (`formatInTimeZone`) in slot generation and the block guard, isolated in `server/src/lib/tz/tz.js`. The **client** renders UTC → Karachi with the **native `Intl.DateTimeFormat({ timeZone: 'Asia/Karachi' })`** — no client-side TZ dependency.

**Consequences:** Correct, DST-proof conversions behind one small helper; the client bundle gains no dependency. One server dependency is added (`date-fns-tz`) — a deliberate exception to the lean-scaffold principle (ADR-16), justified by correctness on the load-bearing slot path. If the platform ever serves regions beyond Pakistan, the same helper handles their zones.

---

## ADR-22 — Dev payment simulation: mock gateway with a real signed IPN

**Date:** 2026-06-04

**Context:** Slice C builds the booking↔payment interlock (F03/F04), but there is no live PayFast merchant account in the dev/CI environment, and the concrete network adapter is not yet wired (the `payfast.stub` throws `NOT_IMPLEMENTED`). The webhook-as-source-of-truth design (doc 05 §5, F04.02) makes the signed IPN — not the browser redirect — the authoritative confirmation. A simulation that shortcuts the redirect→out-of-band-signed-callback split would test a different architecture than the one shipped. (docs/superpowers/specs/2026-06-03-slice-c-booking-payment-design.md)

**Decision:** Add a dev-only mock `PaymentProvider` (`server/src/integrations/payment/payfast.mock.js`) implementing the same `@typedef` contract (ADR-10). `createCheckout` returns a redirect to an app-served, env-guarded hosted-checkout page (`/dev/checkout`, mounted only when `PAYMENT_PROVIDER=mock`); its "Pay"/"Fail" action builds a **real HMAC-signed IPN** (`signParams`/`buildSignedIpn`, keyed on `PAYFAST_PASSPHRASE`) and runs it through the **same** `verifyWebhook` + atomic-commit path as production. Selection is via the `PAYMENT_PROVIDER` switch (default `stub`); the throwing stub remains the production default until the concrete adapter is wired.

**Consequences:** The production webhook-truth path — signature verification, the single `$transaction` commit (#2), `feeAtBooking` snapshot (#6), and 401-on-bad-signature — is genuinely exercised offline and in CI; only the "bank" is faked. The concrete PayFast network adapter remains a future file-swap behind the typedef, with no business-logic change. The hard safety constraint is that the mock provider and the `/dev/*` routes must never be active in production: the switch defaults to `stub` and the `/dev` mount is guarded by `env.PAYMENT_PROVIDER === 'mock'` (see doc 10/15/08).

---

## ADR-23 — Lazy slot-lock expiry (no background worker)

**Date:** 2026-06-04

**Context:** A `slot_locked` appointment carries a 10-minute `lockExpiresAt`; when it lapses, the slot must become bookable and reappear in the picker. The `uniq_active_slot` partial index (ADR-07) counts `slot_locked` as occupying, and slot generation excludes `slot_locked`, so an expired-but-present lock row would otherwise keep a slot both hidden and unbookable. ADR-08 anticipated in-process `node-cron` workers for time-based jobs, but a periodic sweep polling the DB every minute is standing overhead, and an in-memory per-lock `setTimeout` is not durable across restarts. (docs/superpowers/specs/2026-06-03-slice-c-booking-payment-design.md)

**Decision:** Expiry is **derived from `lockExpiresAt`**, evaluated lazily at the two moments it matters — never by a background worker. (1) **Read:** slot generation's occupancy query adds `NOT: { state: 'slot_locked', lockExpiresAt: { lt: now } }`, so an expired hold no longer occupies the slot and it reappears in the picker instantly. (2) **Write:** a new lock that collides on the partial index (`P2002`) triggers reclaim — if the blocker is an expired `slot_locked`, delete it and retry once; otherwise return `SLOT_TAKEN`. No `setInterval`/`setTimeout`.

**Consequences:** Correct discovery and booking with zero standing background work and durability across restarts (nothing is held in process memory). A dead lock row lingers invisibly in the table until that slot is rebooked — accepted, since it occupies neither the picker nor a booking attempt. This is a deliberate, documented narrowing of ADR-08's worker model for the lock-release case specifically; the reconciliation and notification workers remain future `node-cron` jobs. A consequence surfaced in testing: a *sequential* second lock on a held slot is rejected at the read-validation gate with `SLOT_NOT_BOOKABLE` (422), while `SLOT_TAKEN` (409) is reserved for the true concurrent race caught by the index.

---

## ADR-24 — Dev video simulation: mock provider + real webhook + dev simulator

**Date:** 2026-06-05

**Context:** Slice D builds F05 video, but there is no live Daily.co account in dev/CI and the concrete network adapter is unwired (`daily.stub` throws `NOT_IMPLEMENTED`). No-show resolution depends on participant-join data Daily would post to `POST /api/webhooks/daily`. A simulation that bypassed the webhook→worker path would test a different architecture than the one shipped (same rationale as ADR-22 for payments).

**Decision:** Add a dev-only mock `VideoProvider` (`server/src/integrations/video/daily.mock.js`) implementing the same `@typedef` (ADR-10): `createRoom` returns a deterministic `appt_<id>` room; `issueToken` returns an HMAC-signed (keyed on `VIDEO_MOCK_SECRET`) opaque dev token bounded by the slot window. The real `POST /api/webhooks/daily` handler records first-join timestamps via `recordJoinFromDailyEvent`; a dev-only, env-guarded simulator (`/dev/video/*`, mounted only when `VIDEO_PROVIDER=mock`) emits the documented Daily participant payload through that same handler, and the SPA records its join via a server-provided `joinSimUrl`. Selection is via the `VIDEO_PROVIDER` switch (default `stub`); `stub` and `daily` resolve to the throwing stub until the concrete `daily.js` adapter is wired.

**Consequences:** The production webhook→worker no-show path (join recording, the §4.3 transitions, refund/email side-effects) is genuinely exercised offline and in CI; only the vendor REST call and the browser media SDK are faked. The real-Daily swap reduces to a concrete `daily.js` adapter + the client Daily SDK on P-12 + webhook signature verification — business logic untouched. Hard safety constraint: the mock provider and `/dev/*` routes must never be active in production (switch defaults to `stub`; `/dev` mounts env-guarded). Mock role-inference from `user_name` is dev-only; the real adapter must map role from `is_owner`/a stable participant id.

---

## ADR-25 — Appointment-evaluation worker: in-process node-cron (realizing ADR-08)

**Date:** 2026-06-05

**Context:** The non-payment lifecycle transitions (`confirmed→in_progress` at slot start, `in_progress→completed` at slot-end+5m, no-show resolution at slot+15m) fire as push side-effects (refund + apology email) even when no one reads the appointment — so the lazy approach used for lock-expiry (ADR-23) is insufficient here. ADR-08 anticipated in-process `node-cron` workers; Slice D builds the first one.

**Decision:** A pure, clock-injected `evaluateDueAppointments(now)` (originally `server/src/services/evaluation.service.js`; since merged into `server/src/modules/appointment/service.js` — ADR-26) performs activation, ADR-12 no-show resolution, and completion — transitioning ONLY via the `transition()` writer and reusing the shared best-effort `safeRefund` (all now co-located in that same appointment module). It is driven by an in-process `node-cron` job (`* * * * *`) in a new `server/src/workers/` seam, started ONLY in the server run guard (never under tests). A dev-only `/dev/worker/evaluate` triggers one pass on demand. Each appointment is wrapped in its own try/catch so one failing row cannot poison the batch (retried next tick). Hard guarantee: no appointment remains `in_progress` past slot-end+5m. The `evaluation_data_gap` admin alert is scoped to the zero-join-data ("resolved blind") case — a deliberate v1 narrowing of ADR-12's "missing/ambiguous".

**Consequences:** Establishes the worker seam the deferred notification (F07) and reconciliation (F04.03) workers will reuse. Single-instance assumption per doc 15 §3 (no leader election); horizontal scaling would need a distributed lock or worker extraction. `node-cron` is added as the first worker dependency. Clock injection keeps every transition branch unit-testable without timers.

---

## ADR-26 — Feature-first client modules + domain-based server modules

**Date:** 2026-06-11

**Status:** Accepted

**Context:** The client (`views/`/`components/`/`lib/` with data logic living inside views, plus a split `App.jsx`↔`routes.jsx`) and the server (`controllers/`/`services/`/`routes/` layer-first) trees had grown inconsistent and hard to navigate, and render concerns were entangled with business logic. Two dev notes requested a maintainability restructure. (docs/superpowers/specs/2026-06-10-folder-restructure-design.md)

**Decision:** Adopt a **feature-first** organization — a pure relocation with no behavior, API, DB-schema, or dependency change.

- **Server:** domain `modules/<domain>/` each `index.js` + `controller.js` + `service.js` + `test.js` for `auth`, `doctor` (absorbs `availability`), `appointment`, `payment`, `video`. The seven appointment-domain services (`appointment`, `booking`, `appointmentState`, `cancellation`, `refund`, `refundSideEffects`, `evaluation`) merge into one `modules/appointment/service.js`; `doctor` + `availability` merge into one `modules/doctor/service.js`. `webhook.controller.js` and `routes/webhooks.js` are **deleted**, split by domain (payfast → `payment`, daily → `video`). `audit.service` → shared `services/audit/`. Cross-cutting infra stays top-level and folder-grouped (`config/`, `http/`, `lib/<name>/<name>.js`, `middleware/<name>/<name>.js`, `integrations/`, `workers/`); flat exceptions are `config/constants.js` and `http/AppError.js`. A central `server/src/routes.js` (`registerRoutes`) replaces the inline mount block in `index.js`; `health/` and `dev/` are standalone.
- **Client:** feature `modules/<feature>/` each with `views/<View>/`, feature `components/`, one `use<Feature>` hook owning the module's data/mutations, and a `*.routes.jsx`. Views keep render + pure UI state only. Cross-feature primitives → `shared/<Name>/`; cross-cutting state → `context/` (`context/session/session.jsx` + `context/AppProviders.jsx`); pure utilities → `lib/<name>/<name>.js`; page shells → `layouts/<Name>/`. The session context is split: **state** (session/loading/refresh/setSession) stays in `context/session`, while the **one-shot auth actions** (login/signup/logout/forgot/reset/change) move to `modules/auth/useAuth.js`. Routing consolidates: each module exposes a `*.routes.jsx`, aggregated by `routes.jsx`'s `buildRoutes(session)`; `App.jsx` renders only the table + catch-alls.
- **Shared:** Zod request schemas remain the client↔server contract in `shared/schemas/`, reorganized per-domain (`auth/`, `doctor/` [absorbs availability], `appointment/`) behind the `index.js` barrel.
- **Tests** are co-located: server domain-module tests are `modules/<x>/test.js` (not `*.test.js`), so `vitest.config.js`'s include adds `server/src/**/test.js`. One sanctioned test-internals pattern: merged services `import * as self` and route test-stubbed intra-module calls through `self.` so `vi.spyOn` can intercept them under ESM (a bare local call cannot be spied).
- **Prisma schema stays centralized** (`prisma/schema.prisma`) — idiomatic single generated client.

**Consequences:** One obvious home per concept; everything a feature needs is co-located; the view layer is separated from logic; client and server routing are symmetric. Trade-offs: deeper relative-import paths in client module views, and the `self.`-import test convention. Invalidates path references in earlier ADRs (ADR-21 `lib/tz.js` → `lib/tz/tz.js`; ADR-25 `evaluation.service.js`/`refundSideEffects.js`/`appointmentState.service` → merged `modules/appointment/service.js`) and doc 13's file inventory — corrected in the same pass. Extends the lean-scaffold intent (ADR-16) and the faithful-re-presentation discipline (ADR-19): no new behavior, only structure. Wiring the client to consume `shared/schemas` (replacing hand-rolled validation) remains a noted follow-up.

---

## ADR-27 — Notification outbox + in-process dispatch/retry/reconciliation workers

**Date:** 2026-06-11

**Status:** Accepted

**Context:** Slice E realizes the two deferred workers ADR-08/ADR-25 anticipated (notification dispatch F07, reconciliation F04.03) and completes the refund-retry safety net (F06.03). Three coupling problems had to be solved together: (1) Slice C/D sent appointment emails as a post-commit, fire-and-forget `emailProvider.send()` — a crash between the committed state change and the send loses the email, and the PayFast IPN ack waited on a send it shouldn't; (2) reminders (F07.02) must fire at slot−24h / slot−1h but be suppressed if the appointment leaves `confirmed`/`in_progress` before then (F07.03), which a fire-once send cannot express; (3) a failed refund was previously near-silent. A simple "sent-flags on the appointment" approach was considered and rejected — boolean flags cannot carry retry/backoff state, a suppression outcome, or a per-trigger schedule, and they fail the F07.03 retry rule. (docs/superpowers/specs/2026-06-11-slice-e-m1-m2-closure-design.md)

**Decision:** Introduce one persistent **transactional outbox** table, `notification_jobs` (doc 04 §2n), backing all appointment emails. Event emails are enqueued **inside the caller's `$transaction`** (the same transaction as the promising state change), with merge-vars snapshotted as JSON at enqueue time; idempotency is the `@@unique([appointmentId, type])` upsert (a replayed webhook is a no-op). Three thin `node-cron` drivers over **pure, clock-injected service functions** (the ADR-25 pattern) run in the existing `workers/` seam: `dispatchDueNotifications(now)` and `retryDueRefunds(now)` every minute, `reconcileUnconfirmed(now)` hourly. Dispatch re-checks appointment state immediately before sending (suppress→`suppressed` if invalidated), retries with exponential backoff (`EMAIL_BACKOFF_BASE_SEC × 2^attempts`) to `EMAIL_MAX_ATTEMPTS`, then marks `failed` + writes an `email.send_failed_final` audit alert. Refund-retry adds `Payment.refundAttempts`/`nextRefundRetryAt` (not job rows — refunds aren't notifications) and on exhaustion writes a `payment.refund_exhausted` alert + a `refund_delayed` outbox row. Reconciliation reuses the webhook's `confirmPaidAppointment` commit (never writing state itself — `appointmentState.transition` stays the only writer) and, on edge #6a, issues a full **gross** refund. Alert representation is audit rows (`targetRef`/`providerRef`) the Slice G admin feed will read; a dedicated alert store is deferred.

**Consequences:** A committed state change and the email it promises now commit atomically — a crash can never lose an email, and the IPN ack no longer waits on a send. Reminders gain a real schedule + suppression + retry that flags could not express. The outbox + workers establish exactly the seam ADR-08/25 set up, with no new infrastructure (single-instance, no leader election per doc 15 §3 — the dispatch worker's atomic lease-claim flip is defense-in-depth, not distributed locking). Trade-offs: a minute of latency on event emails (the cron tick) versus an immediate post-commit send; one new table + two `Payment` columns (doc 04); and `prescription_ready` (Slice F) may need the per-appointment uniqueness relaxed to per-prescription (a YAGNI deferral noted in the model). The rejected sent-flags option is recorded above so the table is not "simplified" back into one later.

---

## ADR-28 — State-guarded transition write + per-prescription outbox dedupe key

**Date:** 2026-06-12

**Status:** Accepted

**Context:** Slice F (F08 prescriptions) adds two transitions into the single state-writer (ADR-25): `completed → prescription_issued` on first issue, with corrections appending a new linked row while the state stays `prescription_issued` (#4). Two gaps surfaced. (1) The `transition()` writer validated `from → to` with a read-then-write, so two concurrent first-issue submits could both pass validation and double-apply (a second transition, a duplicate side-effect). (2) The Slice E outbox was unique on `(appointmentId, type)`, which made `prescription_ready` a singleton-per-appointment — it could not enqueue one email per prescription (corrections would be deduped away), the YAGNI deferral ADR-27 anticipated.

**Decision:** Make the single-writer's write **state-guarded**: the update is `updateMany WHERE id = :id AND state = :from`; a matched-count of 0 means a concurrent transition already moved the row, so it raises `409 INVALID_TRANSITION` instead of silently double-applying. Relax the outbox unique to the 3-column composite `(appointmentId, type, dedupeKey)` with `dedupeKey` defaulting to `''` (migration `20260612003907_slice_f_outbox_dedupe_key`): Slice E types keep `''` (singleton semantics unchanged), and `prescription_ready` sets `dedupeKey` = the prescription id, enqueuing one email per prescription including corrections.

**Consequences:** The double-apply race is closed at the database boundary — exactly one concurrent first-issue submit wins, the loser's `$transaction` (its prescription row included) rolls back atomically; proven by a Postgres row-lock integration test. The state machine remains the sole writer (ADR-25 unchanged). The outbox stays idempotent on replay while gaining per-prescription granularity, with no behaviour change for Slice E triggers. Cost: one extra column and a slightly wider unique index (doc 04 §2n/§4a).

---

## Revision footer

| Date       | Change           | Why                                                           |
| ---------- | ---------------- | ------------------------------------------------------------- |
| 2026-06-01 | Initial creation | Extracted from ARCHITECTURE.md decisions + changelogs + specs |
| 2026-06-03 | Added ADR-20 (frontend state: Context + TanStack Query) | Slice A frontend-state decision; new client dependency `@tanstack/react-query` |
| 2026-06-03 | Added ADR-21 (Asia/Karachi ↔ UTC via date-fns-tz) | Slice B slot-generation timezone decision; new server dependency `date-fns-tz` |
| 2026-06-04 | Added ADR-22 (dev mock payment gateway, signed IPN) + ADR-23 (lazy lock-expiry, no worker) | Slice C booking/payment decisions |
| 2026-06-05 | Added ADR-24 (dev video simulation: mock provider + real webhook) + ADR-25 (appointment-evaluation worker, node-cron) | Slice D (F05 video & lifecycle) |
| 2026-06-11 | Added ADR-26 (feature-first client + domain server modules); re-pointed ADR-21 (`lib/tz/tz.js`) + ADR-25 (merged `modules/appointment/service.js`) path refs | Folder-structure restructure for maintainability; behavior unchanged |
| 2026-06-11 | Normalized ADR-11's `refund.service` decision ref to the merged `modules/appointment/service.js` (cross-ref ADR-26) | Docs↔code alignment follow-up |
| 2026-06-11 | Repointed deprecated `CONFIG.md §7` refs (ADR-07 partial-index caveat -> doc 04 §4b; ADR-17 Prisma pin/upgrade -> doc 15 §7) | Deprecated-doc hygiene (design §8.1) |
| 2026-06-11 | Added ADR-27 (notification outbox + in-process dispatch/retry/reconciliation workers; rejected sent-flags) | Slice E (F07 outbox + F04.03/F06.03 workers); new architectural decision |
| 2026-06-12 | Added ADR-28 (state-guarded transition write closing the double-apply race; per-prescription outbox `dedupe_key` relaxation actioning ADR-27's YAGNI deferral) | Slice F (F08 prescriptions); new architectural decision |

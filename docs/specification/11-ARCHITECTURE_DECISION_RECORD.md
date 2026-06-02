# 11 — Architecture Decision Record

| Field            | Value                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Document ID      | 11-ARCHITECTURE_DECISION_RECORD                                                                    |
| Status           | Canonical                                                                                          |
| Version          | 1.0                                                                                                |
| Last updated     | 2026-06-01                                                                                         |
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

Prisma's DSL cannot express a `WHERE` clause on a `UNIQUE` index, so this index is added by hand-editing the generated migration SQL. The caveat is documented in `prisma/schema.prisma` header and `CONFIG.md §7`.

**Consequences:** A second insert for a held slot fails at the database write — not at validation — making a double-booking impossible regardless of concurrency. Releasing states are excluded so freed slots are immediately rebookable. The hand-edited migration must be re-applied manually if the `init` migration is ever recreated (see `CONFIG.md §7`). This is the single highest-risk maintenance rule in the codebase: the index must never be accidentally dropped.

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

**Decision:** `refund.service` computes the refund amount as `payment.amount − gateway_fee`. When `gateway_fee` is not reported by PayFast, the Settings `fallback_fee_pct` + `fallback_fee_fixed` (admin-configurable, A6) apply. The gateway-reported fee is captured on the `payments` record at booking time and drives the refund amount, the cancellation-modal estimate, and the dashboard breakdown identically.

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

**Decision:** Prisma pinned to exactly `6.19.3` (not `^6` or `^7`) in `package.json`. This pin is documented in `CONFIG.md §7` and in the `.env.example` `DATABASE_URL` comment.

**Consequences:** The `datasource.url` syntax in `schema.prisma` continues to work. The exact pin (not a caret range) prevents an inadvertent major-version bump during `npm install`. When upgrading Prisma in future, the CONFIG.md §7 caveat and any `prisma.config.ts` migration requirements must be assessed first.

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

## Revision footer

| Date       | Change           | Why                                                           |
| ---------- | ---------------- | ------------------------------------------------------------- |
| 2026-06-01 | Initial creation | Extracted from ARCHITECTURE.md decisions + changelogs + specs |

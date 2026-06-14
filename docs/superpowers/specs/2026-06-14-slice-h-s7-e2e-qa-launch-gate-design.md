# Slice H · S7 — E2E QA + Launch Gate — Design

| Field      | Value |
| ---------- | ----- |
| Date       | 2026-06-14 |
| Status     | Approved (brainstorming output); plan + execution pending (user stays involved — controller pauses before kickoff) |
| Slice      | H of 8 — sub-slice S7 of 7 (the final v1 slice; intentionally last — depends on S1–S6 all merged) |
| Depends on | S1–S6 merged to `main` (312 server+shared / 123 client green; single zod@3; build + migrate clean) |
| Canon refs | doc 09 (testing strategy, §5 priority map, §7 entry/exit criteria, §9 release recommendation); doc 12 (107 enumerated TCs, F01–F16); doc 04 §6 invariants #1–#10; doc 08 (security controls); doc 02/03/05/06 (the per-slice flow definitions) |

---

## 0. Decision provenance (read first)

S7 concludes v1. doc 12 is **already fully populated (107 TCs across all 16 features)** and unit+integration are green, so S7 is NOT test authoring — it is **executing the QA-functional layer** (doc 09 §1) to satisfy the §7 exit criteria, fixing what it finds, and producing the §9 release recommendation.

Approved decisions (user, 2026-06-14):
- **Hybrid E2E:** a durable Playwright harness for the Critical clicked-through journeys + an assisted-manual browser pass for the rest, **against the mock/dev adapters** (ADR-22/24 mirror the real payment/video paths offline, so a full E2E is meaningful; real-vendor validation is a separate pre-launch gate).
- **Fix Critical/High bugs in-slice** (TDD) → re-run to green → then recommend. Medium/Low logged as follow-ups.
- **Deliverable** = a point-in-time release recommendation in `docs/superpowers/reports/` + per-TC verdicts annotated into doc 12 + a doc 13 status update.
- **No new flow-map doc.** The E2E specs are the executable flow map; flow traceability is achieved by a traceability matrix in the report + surgical cross-reference tightening in the existing canon (02/03/04/05/06).
- The harness + doc 12 are a **living, extensible** suite, not a one-shot (conventions below).

Two §7 exit criteria are intrinsically human/vendor and **cannot** be closed here → the honest terminal verdict is **Conditional-Go**: UAT sign-off (client + doctor rep) and real-vendor live validation (PayFast/Daily credentials) remain.

---

## 1. Scope & goals

**Goal:** satisfy doc 09 §7 exit criteria for v1, fixing Critical/High defects, and issue the launch-gate recommendation.

**In scope**
1. Playwright E2E harness (root `e2e/`) for the 6 Critical journeys (§3).
2. Assisted-manual browser pass for the remaining / UI-only TCs (§4).
3. Coverage map: existing 312/123 suite → §7 exit criteria (§5).
4. Flow-traceability pass + matrix; surgical canon cross-ref tightening (§6).
5. Fix Critical/High bugs; re-run (§7).
6. Release recommendation report + doc 12/13 updates (§8).

**Out of scope (flagged, not closed)**
- UAT sign-off (human); real-vendor live validation (credentials).
- doc 09 §2 deferred items (Medicine Ordering, email verification, account deletion, policy versioning, WCAG, SMS/WhatsApp, PDF email attach, live-queue).
- Real CI wiring beyond the `test:e2e` script (note for follow-up; no CI config exists in-repo).
- Medium/Low bug fixes (logged as follow-ups).

**Success criteria**
1. The 6 Playwright journeys pass green against the mock-adapter stack via `npm run test:e2e`.
2. Every Critical + High doc-12 TC has a Verified (or justified) verdict; all 10 invariants have Verified coverage (existing-suite or new).
3. No open Critical/High bug remains (those found are fixed + re-verified).
4. Each of the 6 journeys is walkable end-to-end across the canon by cross-reference (gaps patched).
5. The release recommendation states a clear Go / Conditional-Go / No-Go with the consolidated pre-launch gate checklist.

---

## 2. Test environment & data

The built app (server serving the built client) against local Postgres, env: `PAYMENT_PROVIDER=mock`, `VIDEO_PROVIDER=mock`, `EMAIL_PROVIDER=console`, `NODE_ENV=development` (mounts `/dev/checkout`, `/dev/video/*`, `/dev/worker/*`). Deterministic seed (doc 09 §7 entry data): ≥1 active doctor + weekly availability, 1 patient, 1 admin (bootstrap script). Playwright drives `http://localhost:<port>`; `global-setup.js` seeds + (optionally) starts the server.

> The mock stack is the only viable v1 E2E target (real adapters are researched/credential-gated). Mock mode also bypasses the real Daily iframe (uses the `joinSimUrl` path), so J2 runs headless.

## 3. Automated E2E — Playwright harness (durable)

Critical journeys (doc 09 §5 Critical set), one spec file each, each step tagged with its feature + TC ID:
- **J1 `j1-book-pay-confirm`** — signup + ToS consent → `/browse` → profile → lock slot → pay via `/dev/checkout` (signed mock IPN) → return → appointments shows `confirmed` (invariants #2/#6/#7).
- **J2 `j2-video-lifecycle`** — patient + doctor join via mock `joinSimUrl` → `/dev/worker/evaluate` → `in_progress`/`completed`/no-show transitions (ADR-12/25).
- **J3 `j3-prescription`** — doctor submits → `prescription_issued` → patient views + PDF download (invariants #3/#4/#5).
- **J4 `j4-cancel-refund`** — patient cancel ≥2h → `cancelled_refunded`; <2h → `cancelled_no_refund` (invariant #10; same refund number P-08↔P-10).
- **J5 `j5-auth-role-gates`** — patient→`/admin` blocked; DA3 forced-password-change loop; 404-no-leak across roles (F15/doc 08 §A01).
- **J6 `j6-admin-onboarding`** — admin creates doctor → doctor first-login forced change (F10/F15).

## 4. Assisted-manual browser pass (`mcp__playwright__*`)

For non-Critical / UI-only TCs the harness doesn't cover: admin F11–F14 UIs, F12 alert feed, F13 records/audit, F16 legal pages (DRAFT banner present), F02 discovery, copy/empty-states, reminder-email rendering (console adapter). Each executed TC → Verified/Failed in doc 12. Exploratory artifacts land in `.playwright-mcp/` (already gitignored).

## 5. Coverage mapping

A traceability table: each Critical/High doc-12 TC + each invariant #1–#10 → **already-covered** (cite the existing 312/123 test), **new E2E** (J1–J6), or **manual** (§4). Proves the §7 exit criteria without re-testing what's already green — S7 starts from a high baseline.

## 6. Flow-traceability pass + canon tightening (no new doc)

For each journey, walk the canon as a chain: `doc 06 screen → doc 05 route → doc 02 feature rule → doc 04 state/invariant → doc 14 side-effect`. Where a hop lacks a cross-reference, **add that link surgically to the existing doc** (evidence-driven, only where a gap is found). The integrated human-readable view is a **journey ↔ canon traceability matrix in the report** (a table of pointers into the canon — `step → doc/§ → TC ID`), never a duplicate of the canon prose. The E2E specs share the same ID vocabulary, so executable + documentary maps align.

## 7. Bug policy

Critical/High findings → fixed in-slice (TDD, via the per-task subagent loop) → re-run to green → only then recommend. Medium/Low → logged as follow-ups in the report. The gate does not pass with an open Critical/High.

## 8. Deliverable

`docs/superpowers/reports/2026-06-14-v1-release-recommendation.md` (doc 09 §9 format): cases executed/passed/failed/blocked; open bugs by severity; invariant coverage; the journey↔canon traceability matrix; UAT + vendor-gate status; the consolidated pre-launch gate checklist; **Go / Conditional-Go / No-Go**. Plus: doc 12 per-TC verdicts; doc 13 status (M4 E2E QA done; v1 launch-readiness). Expected verdict: **Conditional-Go**.

## 9. File layout

```
playwright.config.js              NEW (root, mirrors vitest.config.js)
package.json                      EDIT: + devDep @playwright/test; + script "test:e2e": "playwright test"
.gitignore                        EDIT: + playwright-report/  test-results/  /playwright/.cache/
e2e/
  global-setup.js                 seed test DB (active doctor+availability, patient, admin)
  support/                        login/seed helpers, role fixtures, selectors (page-object-ish)
  tests/j1..j6-*.spec.js          the 6 critical-journey specs
docs/superpowers/plans/2026-06-14-slice-h-s7-e2e-qa-launch-gate.md   the plan
docs/superpowers/reports/2026-06-14-v1-release-recommendation.md     the release rec
```
`@playwright/test` is **root dev tooling** (beside vitest/eslint/prettier), NOT a workspace — it drives the whole running stack. The committed `e2e/*.spec.js` are the durable regression map; the `mcp__playwright__*` manual pass is interactive (artifacts → `.playwright-mcp/`, gitignored).

## 10. Extensibility / conventions for adding tests (living suite)

S7 establishes the harness + first full pass; the suite GROWS additively:
- **A new journey = one new `e2e/tests/jN-*.spec.js`** reusing `e2e/support/` primitives (auth/seed/navigation) — config + global-setup unchanged.
- **A new test case = next free `TC-FNN-NNN`** (doc 09 §5 ID rule); never renumber existing TCs.
- **Each QA cycle = a new dated report** in `docs/superpowers/reports/`; prior reports stay as history.
- The assisted-manual pass continually surfaces candidates that get **promoted** into committed `e2e/` specs.
This convention block is part of the spec so future contributors/agents extend without guessing.

## 11. Execution model

Same spec→plan→execute pattern, but S7 is more controller-driven: a lead subagent builds the Playwright harness + fixes Critical/High bugs (TDD); the **controller** drives the assisted-manual pass, authors the coverage map + traceability matrix, and writes the release recommendation (live QA judgment is not fully delegated). **The user stays involved in S7** — the controller pauses to confirm the execution approach before kickoff rather than auto-running.

## 12. Spec-doc impact (tracked; applied at end with the report)

| Doc | Change |
| --- | --- |
| 09 | Record the executed QA-functional pass + the Playwright E2E harness as the realized "assisted browser automation" layer (§1/§4); note `npm run test:e2e` |
| 12 | Per-TC Verified/Failed verdicts for executed cases |
| 13 | M4 → E2E QA done; v1 launch-readiness (Conditional-Go) |
| 02/03/04/05/06 | Surgical cross-reference additions ONLY where the §6 traceability pass finds a missing hop |
| 11 | New ADR — "Playwright E2E harness (root `e2e/`) against mock adapters as the v1 launch gate; living/extensible suite" |
| 15 / 10 | `test:e2e` script (15 §scripts); Playwright/CI + the consolidated pre-launch gate as deploy notes (10) |
| — | NOT a spec doc: the release recommendation lives in `docs/superpowers/reports/` |

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-14 | Initial creation | Slice H · S7 brainstorming output (approved) |

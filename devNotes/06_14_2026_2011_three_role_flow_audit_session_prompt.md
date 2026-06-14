# New-session starting prompt — Three-role visual flow audit

**Purpose of this file:** the starting prompt for a NEW Claude Code session. That session visually runs every navigable flow for all three roles (patient / doctor / admin) against the local app, finds breaks/inconsistencies vs. the spec docs, and produces an issue report for a *separate* fix-and-test session. Paste the block below as the session's first message.

**Context for whoever launches it:** Slice H (S1–S7) is complete and merged; v1 launch gate is **Conditional-Go** (see `docs/superpowers/reports/2026-06-14-v1-release-recommendation.md`). The local Postgres should be up; ensure no stray dev server is holding port 3000.

---

> **Goal:** Exhaustively map and **visually test every navigable flow** for all three roles — **patient, doctor, admin** — in the Dermestha app running locally on mock adapters; decompose the flows so the three role-streams can run **in parallel via subagents** (respecting prerequisites); identify any **breaks, dead-ends, or inconsistencies vs. the spec docs**; and produce a structured **issue report** for a separate fix session.
>
> **This is a FIND + REPORT session.** Do NOT fix anything, do NOT edit app code, do NOT write/commit Playwright specs. The **only** permitted writes are: (1) your report, (2) your session changelog, (3) **one** dev seed script for the baseline (below). If the running app and the docs disagree, **report it — don't silently reconcile.**
>
> ### First steps (per this repo's CLAUDE.md)
> 1. Read `docs/specification/00-INDEX_AND_GOVERNANCE.md`, then treat `docs/specification/` (00–15) as the sole source of truth. Derive flows from the docs — primarily **doc 02** (features + named rules), **doc 05** (routes + state machine), **doc 06** (screen flows + navigation map + 24-screen inventory), **doc 13** (status).
> 2. Read `docs/superpowers/reports/2026-06-14-v1-release-recommendation.md` + **doc 07** so you do **not** re-report the known Conditional-Go gates (DRAFT legal copy, email-domain delivery, real-PayFast wiring, Daily webhook-HMAC smoke). Report only **new** flow issues.
> 3. This is fundamentally a **`verify`-style pass** (run the app + observe behavior to confirm flows work). Recommend the best-fit skill to the user and **announce it before activating** (per CLAUDE.md) — `verify` is the expected lead; the project's `run` skill + the Playwright **MCP** browser tools are the driving mechanism. Phases 1 & 5 are ordinary read/write.
> 4. Maintain one session changelog in `agentChangeLogs/` per the rules.
>
> ### Phase 1 — Build the flow inventory (from docs)
> Enumerate **every** start-to-end path, **major and minor**, per role, each step annotated with its doc reference (screen ID + route + feature rule). Cover at minimum:
> - *Patient:* landing → browse → signup/login → doctor profile → book → pay → view appointments → join call → view prescription + PDF → logout; plus forgot/reset password, cancel ≥2h (refund) & <2h (no-refund), **slot-lock race (P1 vs P2)**, 404/no-leak, payment-fail, empty/no-slots.
> - *Doctor:* login → (DA3 forced password change) → today's appointments → join call → submit prescription → availability edit → logout.
> - *Admin:* login → doctors (add / edit / deactivate / reactivate / reset-password) → medicines (add/edit/deactivate) → system-health alerts (+ email resend) → records & audit search → settings save → logout.
>
> ### Phase 2 — Fresh, clean baseline DB + a reusable seed script
> The dev DB has accumulated test clutter — **start from a clean slate.** Create **`prisma/scripts/seed-baseline.js`** (the one permitted code write) that: clears all domain tables in FK-safe order, ensures `Settings(id=1)`, and seeds **exactly this simple baseline** (a stable starting point the human can reset to anytime):
> - **1 admin:** `baseline.admin@dermestha.test`
> - **2 patients:** `baseline.patient1@dermestha.test`, `baseline.patient2@dermestha.test` (ToS-accepted)
> - **1 doctor:** `baseline.doctor@dermestha.test` — active, with a today availability window
> - **1 medicine** (active), and **pre-seeded appointments on the baseline doctor** in the states the doctor/patient flows need without live cross-stream dependencies: one `confirmed` in the join window, one `completed` **with a prescription** (for the patient's view-prescription flow), one `confirmed` ≥2h-future (cancel→refund), one `confirmed` <2h (cancel→no-refund).
> - A single known password for all accounts that passes the password policy (confirm it validates; document the exact value in the report). Reuse `e2e/support/db.js` helpers (hashing etc.) where sensible.
> Run it, then build + start the server on mocks: `npm run build:client`, then background `PAYMENT_PROVIDER=mock VIDEO_PROVIDER=mock EMAIL_PROVIDER=console NODE_ENV=development node --env-file=.env server/src/index.js`; confirm `GET /api/health` → 200. *(Expected-local, not bugs: email logs to console; video is the mock-join path; payment is the `/dev/checkout` signed IPN.)*
>
> ### Phase 3 — Decompose for parallel execution
> Split the inventory into **three role-streams (patient / doctor / admin)** to run as parallel subagents, with these rules:
> - **Isolation:** each subagent uses its own browser session (isolated cookies). The **admin stream creates its own throwaway doctors** for mutation tests and must **never modify the baseline doctor** (the patient + doctor streams depend on it). The **doctor stream uses the pre-seeded appointments**; the **patient stream books new slots** on the baseline doctor.
> - **Prerequisite graph (sequence within a stream):** e.g. *admin add-doctor → that new doctor's forced first-login*; *book → pay → confirm → view*; the doctor's join/prescription steps rely on the pre-seeded confirmed appointments (no dependency on the live patient stream).
> - **Execution-mode check:** determine whether the Playwright MCP browser supports concurrent isolated contexts. If yes, run the three streams in parallel; **if it's a single shared browser, run the streams sequentially** — the data/session isolation above makes the results correct either way. State which mode you used.
>
> ### Phase 4 — Visually walk every flow
> Drive each path start→end per role with the Playwright MCP tools, snapshot/screenshot each step, and verify: the screen renders, navigation works (no dead-ends/broken links/wrong redirects), the data is correct, and the behavior matches the doc. Record console errors. Keep snapshots shallow/targeted (the admin doctor list is large). Use the seeded baseline accounts; the slot-lock race uses both patients.
>
> ### Phase 5 — Report
> Write `docs/superpowers/reports/2026-06-15-three-role-flow-audit.md`:
> 1. The per-role flow inventory with **pass / break / inconsistent** status per flow.
> 2. An itemized **issue log** — each: severity, role, screen/route, **doc-expected vs. actual**, exact repro, screenshot ref.
> 3. **"Proposed e2e coverage gaps"** — which flows should get new committed Playwright specs (for the fix session to author **test-first**); do not write specs here.
> 4. A **doc-impact note** if any flow reveals the docs (not the code) are stale.
> 5. The **baseline reference** — the `seed-baseline.js` command + the account list + password — so the user/fix-session can reset to the known state.
> This report + the baseline seed are the inputs to the later fix-and-test session.
>
> ### Constraints
> Read-only on app code; the only writes are the report, the changelog, and `prisma/scripts/seed-baseline.js`. Mock adapters only; no vendor credentials needed. Find and document; do not fix; do not author committed Playwright specs.

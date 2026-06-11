# 2026-06-11-2350 — slice-f-prescriptions-design

**Status:** Completed (design + plan; build is the next session)
**Goal:** Brainstorm and write the approved design for Slice F (Prescriptions, M3) — the next slice after the merged Slice E — then turn it into the implementation plan.
**Skill(s) used:** superpowers:brainstorming (user-invoked); superpowers:writing-plans (announced, user approved)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** b48b93a (design doc); plan commit follows
**Last updated:** 2026-06-12-0030
**Tags:** #design #plan #feature #prescriptions #m3

## Summary

Explored post-Slice-E state (M1/M2 functionally closed; doc 13's "Video chrome: Not started" row found stale — VideoRoom/DoctorToday exist), confirmed direction with the user (Slice F — Prescriptions over admin panel / vendor adapters), resolved four scope decisions via Q&A, and wrote the approved design to `docs/superpowers/specs/2026-06-11-slice-f-prescriptions-design.md`. After user spec approval, wrote the 16-task TDD implementation plan to `docs/superpowers/plans/2026-06-12-slice-f-prescriptions.md` (every task grounded in verified source: schema field names, enqueue upsert shape, LEGAL map, listForRole branches, client view/test patterns, seed credentials). No production code changed.

## Context / why

Slice E (notification outbox + workers + G1–G4 fixes) is merged; user asked to "move forward". Doc 13 roadmap → M3 Prescriptions is the natural next slice; user confirmed.

## Files changed

| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-11-slice-f-prescriptions-design.md` | Created | Approved Slice F design (scope, architecture, migration, API, services, frontend, errors, testing, gated canon-doc impact) |
| `docs/superpowers/plans/2026-06-12-slice-f-prescriptions.md` | Created | 16-task TDD implementation plan (outbox dedupeKey migration → medicine/prescription modules → state machine → read-model → client P-09/P-13/D-05/D-02 → integration → gated canon sweep) |
| `agentChangeLogs/2026-06-11-2350-slice-f-prescriptions-design.md` | Created | This session log |
| `agentChangeLogs/index.md` | Modified | Added this session's line |

## Dependencies / config / schema

None this session. Design specifies (for the build session): one migration (`notification_jobs.dedupe_key` + widened unique) and one client dependency (`pdf-lib`, lazy-loaded).

## Decisions

1. **Slice F = Prescriptions (M3)** over admin panel (G) / vendor adapters (H) — roadmap order, zero external dependencies (user choice).
2. **Medicine scope:** read endpoint + admin CRUD routes (backend only, per doc 13's M3 checklist); A-02 UI stays Slice G (user choice).
3. **PDF:** pdf-lib behind a single lazy-loaded `renderPrescriptionPdf(json)` boundary, client-side only (user choice; server-side PDF is v1.2+).
4. **Awaiting-prescription reminder:** minimal D-02 badge now (client-derived >12 h condition); F12/A3 admin alert stays Slice G (user choice).
5. **Approach 1 of 3:** two new modules (prescription, medicine) + atomic submit `$transaction` + outbox `dedupeKey` migration so corrections (policy #9) email per-prescription — the relaxation Slice E's schema comment anticipated (user choice over folding into the appointment module or first-email-only).

## Notable findings

- Doc 13 frontend table's "Video chrome (Daily SDK wrapper): Not started" is stale — `client/src/modules/video/views/VideoRoom/` + `DoctorToday` exist with tests (Slice D).
- Doc 13's M3 checklist uses stale screen IDs ("P-10 past appointments, P-11 prescription detail, D-04 builder"); doc 06 canon is P-09 / P-13 / D-05 (P-10 = cancellation modal, D-04 = doctor video). Design's doc-13 sweep includes the correction.
- `appointmentState.LEGAL` has no `completed` entry yet — exactly one line needed; corrections submit in `prescription_issued` must NOT transition.
- `listForRole` patient branch has no history scope (only UPCOMING) — P-09 needs it.
- Doc 14 §5 `prescription_ready` trigger reads "→prescription_issued"; corrections don't transition, so the design widens the trigger to "every submit" (gated doc 14 edit listed).

## Verification

Not verified (no code changed; design-only session). Baseline cited from the Slice E session log: 169 server + 41 client tests green on `main`.

## Risk / rollback

None — documentation only. Revert = drop the design doc + this log.

## Open items / next session

1. ~~User reviews the written spec~~ — approved 2026-06-12.
2. ~~Invoke superpowers:writing-plans~~ — plan written: `docs/superpowers/plans/2026-06-12-slice-f-prescriptions.md`.
3. Build session: branch question (needs user approval per CLAUDE.md, plan asks at execution start), then execute the plan (subagent-driven or inline — user to choose).
4. Canon-doc edits (plan Task 16) remain GATED on explicit user approval at build time.
5. Plan-noted findings for the build: ESM red-step for Task 8 relies on import-linking failure; Vite build should show a separate pdf-lib chunk (Task 16 Step 3 verifies the lazy import).

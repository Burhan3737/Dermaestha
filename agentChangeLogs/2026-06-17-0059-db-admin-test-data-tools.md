# 2026-06-17-0059 — db-admin-test-data-tools

**Status:** Completed
**Goal:** Act as live DBA against the local Postgres — create test appointments on demand — and capture each scenario as a re-runnable script, then package it into a local skill.
**Skill(s) used:** `superpowers:writing-skills` (opted in — user requested skill creation) to author the project-local `dermestha-db-test-data` skill.
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (no commits made)
**Last updated:** 2026-06-21-1922
**Tags:** #infra #test-data #tooling

## Summary
Operating as the user's database administrator against the local Docker Postgres
(`dermestha-db-1`) while they test the app on localhost:5173. Creating/removing
appointment test data live via SQL (no app code). Per user request, each distinct
scenario is being captured as a parameterized, re-runnable shell script under
`dbCases/`; these will become the executable tools behind a skill created at the
end of the session.

## Context / why
The user is testing dermestha locally and needs specific appointment states
seeded directly into the DB on demand, faster than going through the UI booking
flow. They also want the scenarios reusable, hence the script library.

## Files changed
| File | Action | What & why |
|---|---|---|
| `.claude/skills/dermestha-db-test-data/SKILL.md` | Created | Project-local skill: overview, when-to-use, conventions, case table, run/remove instructions, "add a new case" guidance. Folds in the former dbCases README. |
| `.claude/skills/dermestha-db-test-data/cases/01-create-confirmed-appointment.sh` | Created | Case 01 tool (moved from dbCases): creates a `confirmed` appointment + matching `success` payment, parameterized by patient/doctor email, Karachi slot time, slot minutes. Mirrors `confirmPaidAppointment`. |
| `dbCases/README.md` | Created → Deleted | Temp scratch location; content folded into SKILL.md, folder removed per user request. |
| `dbCases/01-create-confirmed-appointment.sh` | Created → Deleted | Temp scratch location; script moved into the skill, folder removed per user request. |

## Dependencies / config / schema
None. No schema/migration/package changes. Runtime data mutations only.

## Decisions
- **Confirmed appointments must carry a `success` payment.** A bare `confirmed`
  appointment is a state the app never produces; `quoteRefund`/`initiateRefund`
  read a `status='success'` payment and 404 without it, breaking cancel/refund.
  So script 01 writes both rows atomically.
- **Skip observability tables** (`notification_jobs`, `audit_log`,
  `analytics_events`) — user confirmed this is a test environment and they gate
  no user action.
- **Identity by email, time in Karachi local** — scripts resolve patient/doctor
  by email (survive reseed) and convert Karachi→UTC in SQL, so callers never
  hand-convert or paste cuids.

## Notable findings
- DB clock at session start: UTC `2026-06-16 19:46` = Karachi `2026-06-17 00:46`.
  The user said "18 June" but "12:48 now" only fits 17 June; flagged and used 17 June.
- `uniq_active_slot` (partial unique on `doctor_id, slot_start` for active states)
  and `intent_key` (unique `patient_user_id, slot_start` on payments) make the
  scripts safely non-duplicating — a repeat for the same slot errors out.

## Verification
- Case-01 script verified 3×, each against a throwaway future slot then deleted:
  from `dbCases/` (`2027-03-01 09:00` → 04:00 UTC) and from the final skill path
  (`2027-04-01 10:00` → 05:00 UTC). Karachi→UTC +5 and `slot_end` +30m correct.
- Real cases created for the user via the tool (all `confirmed` + `success`
  payment, Patient One / Doctor One): 00:48, 01:30, 02:00, 02:43 (17 June Karachi).
- Earlier wrong appointment (`f3541bea…`, 12:45 PM) + its payment deleted.
- NOTE: proportionate verification only — functional run + cleanup. No full
  RED-GREEN subagent pressure-testing (overkill for a project-local tool-bundle
  reference skill; not a discipline skill).

## Risk / rollback
Low. All changes are rows in the local dev DB; delete by id to revert. Scripts
are additive files under `dbCases/`, not wired into app code.

## Open items / next session
- Future cases: add as `.claude/skills/dermestha-db-test-data/cases/NN-*.sh` and
  a row in the SKILL.md Cases table (e.g. slot_locked, no-show, refunded states).
- Skill is local/uncommitted; commit/push only if/when the user asks.
- Doc-impact: none (runtime test data + agent-local tooling only; no spec/code/schema change).

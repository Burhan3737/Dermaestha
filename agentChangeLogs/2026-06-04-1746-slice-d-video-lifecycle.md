# 2026-06-04-1746 — slice-d-video-lifecycle

**Status:** Partial (brainstorming + spec complete; plan + build pending)
**Goal:** Brainstorm + spec + plan + build Slice D (Video & Appointment Lifecycle) — the fourth and final vertical slice of the M1+M2 patient journey.
**Skill(s) used:** superpowers:brainstorming (user-invoked); will hand off to superpowers:writing-plans
**Ticket / issue:** None
**Branch:** feat/slice-d-video-lifecycle (off main)
**Commits / PR:** None yet
**Last updated:** 2026-06-04-1746
**Tags:** #feature #video #lifecycle #worker #frontend #migration

## Summary
Fourth slice of the 4-slice M1+M2 decomposition (A + B + C merged). Brainstormed and got approval on the Slice D design: F05 video consultation via a dev `daily.mock` VideoProvider mirroring ADR-22, the `video-token` route, a real `POST /api/webhooks/daily` join-recording handler + dev simulator, the appointment-evaluation worker (first node-cron worker, ADR-08) owning `confirmed→in_progress→{completed,patient_no_show,doctor_no_show}` with doctor-absence precedence (ADR-12), and the doctor UI (D-02 today view, D-06 cancel modal) + patient P-11/P-12 screens. Spec pending write; implementation plan + build pending.

## Context / why
Slices A/B/C are merged to `main`. Slice C deferred all video + lifecycle work to Slice D (its "Open items"). Slice D consumes confirmed/paid appointments. Two environment constraints drove the central decisions: no live Daily.co account (so a video simulation strategy is needed, paralleling the payfast.mock approach in ADR-22), and the ADR-08 (node-cron) vs ADR-23 (lazy) worker question (resolved: lazy is insufficient because no-show/completion fire push side-effects with no reader, so node-cron is correct here).

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-04-1746-slice-d-video-lifecycle.md` | Created | This session changelog. |
| `agentChangeLogs/index.md` | Modified | Added Slice D index line. |
| `docs/superpowers/specs/2026-06-04-slice-d-video-lifecycle-design.md` | Created | Slice D design doc (brainstorming output). |

## Dependencies / config / schema
Planned (pending plan/build approval):
- Server dependency: add `node-cron` (first in-process worker, ADR-08).
- Schema: add nullable `doctorJoinedAt` + `patientJoinedAt` (`timestamptz`) to `appointments`. Prisma migration. Doc-04 cascade.
- Env: add `VIDEO_PROVIDER` (`stub|mock|daily`, default `stub`) + optional `VIDEO_MOCK_SECRET`. Doc-15 cascade (+08/10/03).

## Decisions
- **Video simulation:** Faithful mirror of ADR-22 — `daily.mock` VideoProvider (deterministic room + dev token), the real `POST /api/webhooks/daily` join-recording handler, a dev-only env-guarded `/dev/video/*` simulator; the evaluation worker reads real recorded join data. Maximizes what survives the real-Daily swap (only the vendor REST adapter + client media SDK + webhook signature remain). (User chose.)
- **Join-event storage:** two nullable timestamp columns on `appointments` (`doctorJoinedAt`, `patientJoinedAt`), set on first join. Minimal sufficient for no-show resolution; richer per-event table is YAGNI. (User chose.)
- **Worker driver:** node-cron per ADR-08 (`* * * * *`), new `server/src/workers/` seam; evaluation logic is a pure `evaluateDueAppointments(now)` function (fixed-clock unit-testable); cron started only in the server-run block; dev manual-trigger endpoint for demo/testing. (User chose.)
- **Scope:** video + lifecycle + doctor UI only. Build the `workers/` seam but only the evaluation worker. Defer F07 reminders + F04.03 reconciliation to a follow-up slice. (User chose.)
- **[agent calls, user-approved in design review]** new `VIDEO_WINDOW_CLOSED` (422) code; peer-presence via polling `GET /api/appointments/:id` (role-aware `peerJoined` + `serverNow`); simulated/placeholder P-12 stage (no real media in mock); dev `POST /dev/worker/evaluate` trigger; no `roomName/roomUrl` columns (room id derived as `appt_<id>`); extract Slice C's `safeRefund` to a shared helper reused by the worker.

## Notable findings
- The `Appointment` model had **no participant-join columns** — the schema gap that forced the storage decision; no-show resolution is purely a function of "did each party ever join."
- Room identity is deterministic (`appt_<id>`, doc 14 §3), so the room needs no storage — only the join facts do.
- `cancellation_apology` (doc 14 §5) already maps to `doctor_cancelled`/`doctor_no_show`; `refund_confirmation` on refund-settled; `refund.initiateRefund({ appointmentId })` is directly reusable — so the worker's no-show side-effects reuse Slice C machinery, not duplicate it.
- No `workers/` directory exists yet — the evaluation worker is the FIRST worker; it establishes the seam the deferred notification/reconciliation workers will reuse.
- Video/no-show constants (`VIDEO_TOKEN_PRE_MIN`, `VIDEO_TOKEN_POST_MIN`, `NO_SHOW_GRACE_MIN`) already exist in `constants.js`.
- `appointmentState.service` `LEGAL` map stops at `confirmed`; Slice D extends it (`confirmed→in_progress`, `in_progress→{completed,patient_no_show,doctor_no_show}`).

## Verification
Not verified — design phase only (no code yet).

## Risk / rollback
Planned schema migration (additive nullable columns) + a new server dependency (`node-cron`) are the only non-trivially-reversible items, both pending approval at build time. Main build-time safety: the `daily.mock` provider + `/dev/video/*` + `/dev/worker/*` routes must be impossible to mount in production (env switch defaults to `stub`; `/dev` mounts env-guarded — mirrors ADR-22). Revert at this stage = delete created docs; no DB impact yet.

## Open items / next session
- Write the design doc → spec self-review → user review gate → hand off to writing-plans.
- Canon doc updates to apply (user-approval at the doc-update step): 04 (schema), 05 (`VIDEO_WINDOW_CLOSED`), 11 (ADR-24 video sim + ADR-25 evaluation worker), 15 (`VIDEO_PROVIDER`/`VIDEO_MOCK_SECRET`) + 08/10/03 cascade, 12 (TC rows), 13 (status sweep), 14 (daily.mock note).
- Deferred to a later slice/milestone: F07 reminders + notification worker, F04.03 reconciliation worker, F08 prescriptions (`completed→prescription_issued`), real Daily client SDK + REST adapter + webhook signature, analytics ingestion route, admin module (M4).

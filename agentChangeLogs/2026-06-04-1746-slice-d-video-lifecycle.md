# 2026-06-04-1746 — slice-d-video-lifecycle

**Status:** COMPLETE & GREEN on `feat/slice-d-video-lifecycle` (135 server + 41 client tests, build clean); subagent-driven (17 plan tasks + 3 review-fix tasks); final whole-impl review passed; canon docs updated (user-approved, 10 docs, v-bumps). PENDING: merge disposition (user).
**Goal:** Brainstorm + spec + plan + build Slice D (Video & Appointment Lifecycle) — the fourth and final vertical slice of the M1+M2 patient journey.
**Skill(s) used:** superpowers:brainstorming (user-invoked); will hand off to superpowers:writing-plans
**Ticket / issue:** None
**Branch:** feat/slice-d-video-lifecycle (off main)
**Commits / PR:** None yet
**Last updated:** 2026-06-04-2010
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
| `docs/superpowers/plans/2026-06-04-slice-d-video-lifecycle.md` | Created | Slice D implementation plan (writing-plans output) — 7 phases, ~17 TDD tasks. |
| `server/src/config/env.js` (+ test), `.env.example` | Modified | `VIDEO_PROVIDER` (stub\|mock\|daily, default stub) + `VIDEO_MOCK_SECRET` + `DAILY_DOMAIN`. `d9c19f1`/`345d8a0` |
| `prisma/schema.prisma` + migration `20260604141222_add_video_join_columns` | Modified/Created | Additive `doctorJoinedAt`/`patientJoinedAt` timestamptz on `appointments`. `8b1a937` |
| `server/src/integrations/video/daily.mock.js` (+ test), `video/index.js` | Created/Modified | Dev mock VideoProvider (deterministic room + HMAC token) + `VIDEO_PROVIDER` switch. `a0bcba7`/`febd063` |
| `server/src/services/video.service.js` (+ test) | Created | `issueAppointmentToken` (ownership/state/window guards, `VIDEO_WINDOW_CLOSED` 422) + `recordJoinFromDailyEvent` (first-join-wins, event-timestamp). `c19d40f`/`66a812e`/`aa079f1` |
| `server/src/controllers/appointment.controller.js`, `routes/appointments.js` | Modified | `GET /api/appointments/:id/video-token` (+ `scope` passthrough on list). `1a612b2`/`564d994` |
| `server/src/controllers/webhook.controller.js` (+ test), `routes/webhooks.js` | Modified/Created | `POST /api/webhooks/daily` join handler. `41dcb1a` |
| `server/src/routes/devVideo.js`, `index.js` | Created/Modified | Dev `/dev/video/*` simulator + `/dev/worker/evaluate` (mock-guarded); worker wired in run guard. `7088d1d`/`cc3752c` |
| `server/src/services/appointmentState.service.js` (+ test) | Modified | `LEGAL` extended: `confirmed→in_progress`, `in_progress→{completed,patient_no_show,doctor_no_show}`. `e8c74ce` |
| `server/src/services/refundSideEffects.js` (+ cancellation.service refactor) | Created/Modified | Extracted shared best-effort `safeRefund` for worker reuse. `44b71e8` |
| `server/src/services/evaluation.service.js` (+ test) | Created | `evaluateDueAppointments(now)` — activate/no-show(ADR-12)/complete + hard-cutoff data-gap alert + per-row try/catch. `1207812`/`03a5ac1` |
| `server/src/workers/index.js`, `index.js`, `server/package.json` | Created/Modified | `node-cron` (4.2.1) appointment-evaluation worker (ADR-08), started only in run guard. `cc3752c` |
| `server/src/services/appointment.service.js` (+ test) | Modified | `getForRole` peerJoined/serverNow; doctor `listForRole` patientName + history scope. `91a8fad` |
| `server/src/test/video.integration.test.js` | Created | Real-DB: token in-window 200 / past 422 / webhook joins → worker → completed. `b961346` |
| `client/src/views/VideoRoom.jsx` (+ test) | Created | P-11/P-12 (waiting→live, mock join-sim, slot timer + doctor soft-warning + slot-end+5m cutoff). `b017b95`/`e98b84b` |
| `client/src/views/Upcoming.jsx` (+ test), `App.jsx` | Modified | Activate patient Join Call → `/video/:id` route. `2b8a2b3` |
| `client/src/views/DoctorToday.jsx` (+ test), `components/DoctorCancelModal.jsx`, `App.jsx` | Created/Modified | D-02 today/History tabs + Join Call; D-06 reason-required cancel modal; `/doctor` route. `a2b77e0`/`564d994` |
| ~30 slice files | Modified | Prettier normalization (slice files only). `1548a68` |
| `docs/specification/` 03,04,05,08,10,11,12,13,14,15 | Modified | Canon updates (user-approved): ADR-24 (video sim) + ADR-25 (evaluation worker) in 11; join columns in 04; `VIDEO_WINDOW_CLOSED` in 05; `VIDEO_PROVIDER`/`VIDEO_MOCK_SECRET` in 15; TC-F05-010..015 in 12; status sweep (M2 ~75%, F05/module-9/worker Built) in 13; cascades 03/08/10/14. v-bumps + footers. `dc5562a` |

## Dependencies / config / schema
Applied during build:
- Server dependency: `node-cron` ^4.2.1 (first in-process worker, ADR-08).
- Schema: nullable `doctorJoinedAt` + `patientJoinedAt` (`timestamptz`) on `appointments` — migration `20260604141222_add_video_join_columns` applied to dev DB (additive; partial unique index untouched). Doc-04 cascade pending (canon step).
- Env: `VIDEO_PROVIDER` (`stub|mock|daily`, default `stub`) + optional `VIDEO_MOCK_SECRET` + `DAILY_DOMAIN`. Doc-15 cascade (+08/10/03) pending (canon step).

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

### Review catches (fixed during execution)
- **(Task 1.2 quality)** `recordJoinFromDailyEvent` wrote `new Date()` (server-receipt time); a delayed real-Daily webhook would mis-record the join time → fixed to use the event's `timestamp` (`66a812e`). Also flagged the mock `user_name` role-inference as dev-only with a real-adapter caveat comment (`aa079f1`).
- **(Task 3.3 quality)** the evaluation worker's batch loops had no per-appointment try/catch — one throwing row (e.g. an `INVALID_TRANSITION` race) would abort the whole pass; fixed with per-row try/catch + logger.error (`03a5ac1`). Data-gap alert consciously scoped to zero-join-data (commented; spec-owner question for canon).
- **(Task 5.1 plan bug)** the plan's integration test back-dated the slot only 1 min then asserted `completed` — unreachable (completion needs now ≥ slotEnd+5m), and one appointment can't be both in-window and past-cutoff; corrected to two appointments (live + fully-past).
- **(Final whole-impl review)** 3 design-fidelity gaps (no bugs): dead `listForRole` history branch + missing D-02 History tab/today-filter, and missing VideoRoom slot timer/cutoff — all 3 built per user decision (`564d994`, `e98b84b`).
- **(Task 0.1 spec)** duplicate `DAILY_DOMAIN` + a non-blank mock secret in `.env.example` — fixed (`345d8a0`).
- **(Canon step)** 6 canon docs (04/05/08/10/11/15) had pre-existing **uncommitted** Slice D edits in the working tree at session start (from prior work on this branch); verified faithful + complete, filled the 4 gaps (03/12/13/14), and caught/fixed a blank-line table split in doc 12's new TC-F05 rows before committing (`dc5562a`).

## Verification
**Verified.** Built subagent-driven (fresh implementer per task; controller did per-task spec + code-quality review, full two-stage review on the critical worker/service tasks; final whole-implementation reviewer subagent → backend correct/no critical issues → 3 design-fidelity gaps surfaced + all 3 built per user decision).
- **Server suite:** 135/135 green (33 files) — incl. video.service (7), evaluation.service (6), appointmentState (7), appointment.service (5), daily.mock (2), webhook.controller (daily), and the real-DB `video.integration` (3: token in-window 200, past 422, webhook-joins→worker→completed).
- **Client suite:** 41/41 green (17 files) — incl. VideoRoom (5: waiting/live/timer/ended/doctor-warning), DoctorToday (3: today list, cancel flow, History tab), Upcoming Join-Call activation.
- **Build:** `npm --workspace client run build` clean (114 modules).
- **Migration:** `20260604141222_add_video_join_columns` applied to dev DB (additive nullable columns; partial unique index untouched — verified ADD COLUMN-only).
- **Prettier:** slice files normalized.
- Root `npm run lint` still PRE-EXISTING broken (ESLint 9 flat-config missing) — not Slice D scope.

## Risk / rollback
Planned schema migration (additive nullable columns) + a new server dependency (`node-cron`) are the only non-trivially-reversible items, both pending approval at build time. Main build-time safety: the `daily.mock` provider + `/dev/video/*` + `/dev/worker/*` routes must be impossible to mount in production (env switch defaults to `stub`; `/dev` mounts env-guarded — mirrors ADR-22). Revert at this stage = delete created docs; no DB impact yet.

## Open items / next session
- Write the design doc → spec self-review → user review gate → hand off to writing-plans.
- Canon doc updates to apply (user-approval at the doc-update step): 04 (schema), 05 (`VIDEO_WINDOW_CLOSED`), 11 (ADR-24 video sim + ADR-25 evaluation worker), 15 (`VIDEO_PROVIDER`/`VIDEO_MOCK_SECRET`) + 08/10/03 cascade, 12 (TC rows), 13 (status sweep), 14 (daily.mock note).
- Deferred to a later slice/milestone: F07 reminders + notification worker, F04.03 reconciliation worker, F08 prescriptions (`completed→prescription_issued`), real Daily client SDK + REST adapter + webhook signature, analytics ingestion route, admin module (M4).

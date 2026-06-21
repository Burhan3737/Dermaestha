# 2026-06-17-0158 — video-call-flow-bugfixes

**Status:** Partial
**Goal:** Root-cause and fix the bugs the user hits while live-testing the patient/doctor video-call flow at localhost:5173 (mock mode).
**Skill(s) used:** superpowers:systematic-debugging (invoked via /superpowers:systematic-debugging)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None yet
**Last updated:** 2026-06-21-1901
**Tags:** #bugfix

## Summary
Live-testing the video call surfaced two distinct bugs. **Bug A (fixed this session):** the Vite dev proxy only forwarded `/api`, not `/dev`, so the mock-mode join recorder (`recordJoin` → `fetch('/dev/video/join')`) 404'd silently at the Vite origin and never reached Express — join timestamps were never written, so BOTH parties were stuck forever on "Doctor will be with you shortly". **Bug B (diagnosed, fix pending user decision):** the doctor's "Join Call" routes into the patient-only waiting room (`PatientLayout`), and `VideoRoom`'s leave uses role-blind `window.history.back()`, dumping the doctor on a patient page / `/login` (apparent logout).

## Context / why
User is running the app at localhost:5173 with a patient (default browser) and doctor (incognito/Edge), on a manually-SQL-created confirmed appointment. Symptoms: both see "doctor will be with you shortly" even after joining; doctor lands in patient layout on join; doctor is bounced to a patient page and appears logged out on leave.

## Files changed
| File | Action | What & why |
|---|---|---|
| `client/vite.config.js` | Modified | Add `'/dev'` to the dev-server proxy alongside `'/api'` so the mock-only `/dev/video/*` routes reach Express in local dev (Bug A). Dev-only; prod serves the SPA same-origin so `/dev` already reaches Express there. |
| `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx` | Modified | Bug B: doctor "Join Call" link now targets `/video/:id` (the shared role-aware VideoRoom) instead of `/video/:id/ready` (patient-only WaitingRoom). `video_join_attempt` emit unchanged. |
| `client/src/modules/video/views/VideoRoom/VideoRoom.jsx` | Modified | Bug B: replaced 3 role-blind `window.history.back()` leave sites with role-aware `navigate(leaveTo, { replace: true })` — doctor → `/doctor`, patient → `/video/:id/ready`. Added `useNavigate` import + `navigate`/`leaveTo`/`leave`. **Bug C:** made the mock-mode `!peerJoined` waiting copy role-aware — doctor sees "Waiting for the patient to join…", patient still sees "Doctor will be with you shortly…". |
| `client/test/unit/modules/doctor/views/DoctorToday/DoctorToday.test.jsx` | Modified | Updated the Join-Call-target assertion from `/video/a1/ready` to `/video/a1` (new Option-B contract). |
| `client/test/unit/modules/video/views/VideoRoom/VideoRoom.test.jsx` | Modified | Added a `useLocation` probe + two role-aware leave tests (doctor → `/doctor`, patient → `/video/:id/ready`); added a doctor-waiting-copy test ("Waiting for the patient to join…"). |
| `agentChangeLogs/2026-06-17-0158-video-call-flow-bugfixes.md` | Created | This session log. |
| `agentChangeLogs/index.md` | Modified | Add this session's index line. |

## Dependencies / config / schema
None (Vite proxy is dev-server config, not an app dependency or env var).

## Decisions
- Treat the "both stuck on shortly" symptom as a separate root cause (proxy gap) from the doctor-routing symptom, after curl evidence showed `POST /dev/video/join` returns 404 at :5173 but 200 at :3000.
- Bug A fix applied directly (one-line, dev-only, root cause proven by curl) rather than via subagent; verified by re-running the curl probe.
- Bug B (doctor routing) has TWO viable fix approaches that hinge on a spec-internal contradiction (ADR-34 routes the doctor through `/ready`, but doc 06 lists the waiting room P-11 as patient-only with no doctor get-ready screen). Deferred to user decision (Option B = doctor straight to `/video/:id`, recommended; Option A = make WaitingRoom role-aware).

## Notable findings
- Runtime is mock even though on-disk `.env` shows `VIDEO_PROVIDER=stub` — backend `GET /dev/video/probe123` returns the Express mock-room HTML, so the running process has `VIDEO_PROVIDER=mock`.
- `recordJoin` (`client/src/modules/video/useVideo.js:30`) deliberately uses a raw same-origin `fetch('/dev/video/join')` (not the `/api` client). The code comment assumes same-origin reaches Express — true in prod, false under Vite dev where only `/api` was proxied.
- Presence is one-sided: `peerJoined` (server `appointment/service.js:158-159`) reads the OTHER party's join timestamp, and timestamps are only written when a participant reaches `/video/:id` (the real call), never in the waiting room.
- Downstream risk from Bug B: the no-show worker (`appointment/service.js:637`) keys on `doctorJoinedAt`; a doctor stuck off the call could be falsely marked `doctor_no_show` → auto-refund + apology email.

## Verification
- Pre-fix curl: `POST http://localhost:5173/dev/video/join` → 404; `POST http://localhost:3000/dev/video/join` → 200. `GET :5173/dev/video/probe123` returned the Vite SPA shell (not proxied); `GET :3000/...` returned Express mock-room HTML.
- Post-fix (Bug A): `POST http://localhost:5173/dev/video/join` → 200 (proxied to Express). Confirmed LIVE by user — both patient and doctor screens flip to "● Live — connected".
- Bug B fix done test-first (subagent): new assertions failed red for the right reason (wrong destination), then passed green after the fix. DoctorToday link → `/video/:id`; VideoRoom leave → `/doctor` (doctor) / `/video/:id/ready` (patient).
- Bug B confirmed LIVE by user (doctor "Join Call" now lands straight on the call, waiting-room bug gone). Bug B leave-navigation not yet separately confirmed live.
- Bug C (doctor-joins-first showed patient copy "Doctor will be with you shortly") fixed test-first; doctor-waiting assertion failed red then passed green.
- Full client suite after Bug C: `npm --workspace client run test` → 40 files, 140 tests, 0 failures.
- Bug C not yet confirmed in the live browser by the user (pending).
- ALL THREE (A, B incl. leave, C) confirmed live by the user ("looks good"). Code complete + suite green; commit + spec doc-impact pending.

## Risk / rollback
- Bug A fix is dev-server-only; zero prod impact, zero runtime app code change. Rollback = revert the one-line `client/vite.config.js` edit. Requires Vite dev server restart to take effect (Vite auto-restarts on config change).

## Open items / next session
- Live-confirm Bug B leave-navigation (doctor leave → /doctor, no logout) and Bug C (doctor-waiting copy) in the browser.
- Spec doc-impact (apply only at end, with approval): (1) Option B amends ADR-34's "doctor routes through /ready" clause + doc 13:284; (2) Bug A may warrant a config/ADR note that local dev requires `/dev` proxied (doc 15 / ADR); (3) Bug C adds a doctor-waiting string not defined in doc 02 §F05.03 (which only specifies the patient "Doctor will be with you shortly" copy). Track and confirm at task end.
- Decide on committing the code changes (controller will not push/branch without user approval).
- Continue the bug-finding loop with the user for any further flow issues.

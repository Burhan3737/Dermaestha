# 2026-06-09-2323 — run-app-two-instances

**Status:** Completed
**Goal:** Run two isolated, production-style instances of Dermestha locally — one for the user to test manually (:3000, `dermestha` DB), one for the agent to verify spec flows (:3001, `dermestha_agent` DB).
**Skill(s) used:** run (opted in)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (no code changes intended)
**Last updated:** 2026-06-09-2323
**Tags:** #infra

## Summary
Launching two same-origin Express instances (production-style: built SPA + /api on one port each) against two isolated Postgres databases in the existing Docker container on host port 5433. User instance → port 3000 / DB `dermestha`. Agent instance → port 3001 / DB `dermestha_agent`. Both run with PAYMENT_PROVIDER=mock and VIDEO_PROVIDER=mock so the booking→payment→video flows can be exercised end-to-end. The agent instance is then driven via Playwright to verify flows against the canonical spec suite.

## Context / why
User asked to run the app locally as two separate instances (one each) and to verify, in the agent instance, that everything works per the specs in `docs/specification/`.

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-09-2323-run-app-two-instances.md` | Created | This session log. |
| `devNotes/06_10_2026_0010_next-session-frontend-gap-audit-kickoff.md` | Created, then removed by user | Reusable kickoff prompt for the next (non-dev) session: re-verify findings, author doc-12 test cases, produce a consolidated gap list. User copied the prompt out and deleted the file; no longer persisted in the repo. |

## Dependencies / config / schema
No source/schema changes. Runtime only: created a second database `dermestha_agent` in the existing `dermestha-db-1` Postgres 16 container (host port 5433). Agent instance launched with explicit env (PORT=3001, DATABASE_URL→dermestha_agent, PAYMENT_PROVIDER=mock, VIDEO_PROVIDER=mock, EMAIL_PROVIDER=console).

## Decisions
- Isolated DBs (user choice) so agent test data never collides with the user's manual testing.
- Production-style (user choice): build SPA once, Express serves it + /api per instance.
- Enable mock payment/video providers on both instances — required to drive payment/video flows; stub providers cannot complete them.

## Notable findings
- README/docker-compose.yml reference Postgres port 5432, but the live container and `.env` both use 5433 — internally consistent at runtime; docs are stale.
- Dev `/dev/*` simulated gateways only mount under PAYMENT_PROVIDER=mock / VIDEO_PROVIDER=mock.
- Seed accounts: doctors dr.ayesha@dermestha.dev & dr.bilal@dermestha.dev (password `Password123`), Mon/Wed/Fri 18:00–21:00.
- GAP — CONFIRMED Critical fidelity gap (spec-verified). `DoctorProfile.jsx:22` hard-codes the slot query to today (`useState(todayKarachiYMD())`), no date control; P-06 Booking has no slot picker at all. Violates:
  - F03.01 Future-Slots-Only Rule (doc 02:97): picker must show "future slots within the doctor's set weekly availability" — not just today.
  - doc 06 §3 Slot selection (P-06): "Slots are grouped under day tabs" — multi-day picker required, located in P-06.
  - TC-F03-001 (doc 12, Critical): "Only future 30-min slots within D's weekly availability are shown" — current impl shows zero on a no-availability day.
  - Reproduced live on :3001: profile on Tue shows "No slots available today" (dead end) while `/slots?date=2026-06-10` returns 5 slots and the listing advertises "Next: Wed 10 Jun". Fix scope = FRONTEND ONLY (API `GET /doctors/:id/slots?date=` already supports any date, doc 05:155).
- BUG (re-book after refund) — found while setting up the video test. Booking a slot the SAME patient previously booked-then-refunded fails: payment-intent is idempotent on `Payment @@unique([patientUserId, slotStart])`, so the second booking reuses the stale payment row (still linked to the old `cancelled_refunded` appointment) instead of creating a fresh intent for the newly slot_locked appointment. On the success webhook it resolves to the cancelled appointment → `INVALID_TRANSITION: Cannot move cancelled_refunded → confirmed`. Result: payment row flips to `success`, NO appointment confirms, and the new lock is left orphaned in `slot_locked`. DB evidence (agent DB): 2 appts @2026-06-10 13:00Z (cancelled_refunded + orphan slot_locked), 1 payment whose appointment_id points at the cancelled one but provider_ref = the new checkout ref. Spec #7 (Idempotent-Intent) doesn't cover cancel-then-rebook of same (patient, slot). Needs triage (likely server: scope intent idempotency to active bookings, or re-point/replace the payment on re-lock).
- BUG (mock video join-sim 404) — found during video test. `VideoRoom.jsx:36` posts the join to `token.data.joinSimUrl` (`/dev/video/join`, from video.service.js:48) through the shared `api` client, which prepends `/api` → `POST /api/dev/video/join` → 404 (router mounted at `/dev`, not `/api/dev`, index.js:46). So in mock mode participant joins are NEVER recorded: patient_joined_at/doctor_joined_at stay null → peer "● Live — connected" indicator never lights AND the no-show worker would wrongly mark a present patient `patient_no_show`. Underlying `recordJoinFromDailyEvent` logic is correct (proven by driving `/dev/video/event` directly → both join columns set, room then shows "Live — connected"). Production path (Daily webhook `/api/webhooks/daily`) is a SEPARATE route under /api and unaffected. Fix = client-only: post joinSimUrl as an absolute path bypassing the /api-prefixing client.
- GAP (no first-class logout). `logout()` exists in session.jsx but is wired to a button ONLY in the `Placeholder` component (App.jsx:21 — the `*` catch-all + /admin). Neither PatientLayout (Browse/Appointments + mobile Browse/Appts/Profile) nor doctor SidebarLayout (Today/Availability/History) exposes Log out. Reachable only accidentally: patient-mobile "Profile" → /profile (no route) → Placeholder; doctor "History" → /doctor/history (no route) → Placeholder. The logout action itself works; it just has no proper UI entry point. Also note /profile and /doctor/history are dead nav targets.
- `/doctor/history` nav link + History tab exist (DoctorToday/Patientnav) but no matching route in App.jsx → falls through to `*` Placeholder. Minor dead nav.
- Admin surface (`/admin`) is a Placeholder ("Coming in a later slice"); A-01..A-05, P-09, P-13, D-05 not built — consistent with M1/M2 milestone scope, not failures.

## Verification
- Client SPA built: `npm run build:client` → exit 0, `client/dist/index.html` present.
- DB `dermestha_agent` created in container `dermestha-db-1`; 3 migrations applied (incl. `uniq_active_slot`); seeded; admin bootstrapped (`admin@dermestha.dev`).
- User DB `dermestha`: migrations already current; re-seed idempotent; admin already existed.
- Both instances listening + DB up:
  - `GET http://localhost:3000/api/health` → `{"status":"ok","db":"up"}`
  - `GET http://localhost:3001/api/health` → `{"status":"ok","db":"up"}`
- Spec-flow UI verification on :3001 (Playwright), all PASS unless noted:
  - P-02 listing: 2 doctors, fee paisa→Rs correct (Rs 2,500/3,000), "Next" slot respects Mon/Wed/Fri 18:00.
  - P-04 signup: mandatory consent gate (button disabled until consent), auto-login on success.
  - P-03 profile: renders; only loads TODAY's slots (see findings).
  - P-06 booking: who-for + slot, "Confirm & Pay" gated on slot.
  - P-07 payment: mock PayFast checkout → real signed IPN → atomic confirm → "Booking confirmed".
  - P-08 dashboard: confirmed appt shows feeAtBooking Rs 2,500; "Join Call" disabled (future slot, correct per VIDEO_TOKEN_PRE_MIN).
  - No-double-booking (PRD §3.3 #1): booked slot removed from availability; freed again after refund-cancel.
  - F06 cancel/refund (P-10): net-of-fee modal (Paid 2,500 − fee 63 = refund 2,438); state → `cancelled_refunded`; slot released.
  - P-05 login/logout (verified on request):
    - Valid login role-routes correctly (doctor→/doctor, patient→/); signup auto-logs-in.
    - Invalid credentials → generic alert "Invalid email or password." (no field-level leak); no auth.
    - Logout MECHANISM works: POST /auth/logout clears session; nav reverts to Browse/Log in; /api/auth/me 401.
    - Protected-route guard: logged-out → /appointments redirects to /login (RoleRoute).
    - Session persists across full page load (cookie-backed).
    - Bonus: worker moved the in-window appt confirmed→in_progress; Cancel correctly hidden once in_progress.
  - D-02 doctor today + D-03 weekly availability grid render correctly.
- F05 video (P-11/P-12) — VERIFIED via time-shift technique (booked a valid future slot, then UPDATE slot_start→now+3min/slot_end→now+33min in agent DB to enter the join window):
  - "Join Call" disabled when out-of-window, activates inside [slotStart-10, slotEnd+5] (Upcoming.jsx:51-53). PASS.
  - Video-token route issues token when state confirmed + in window; room renders (waiting state "Doctor will be with you shortly…"), hard-cutoff countdown to slotEnd. PASS.
  - Karachi TZ display correct (18:49Z → "11:49 pm").
  - Peer-joined "● Live — connected" works once joins are recorded (verified by driving /dev/video/event for doctor+patient → patient_joined_at/doctor_joined_at set).
- NOT live-verified (reason): D-04 doctor-side video (same mechanism, not re-driven); password recovery P-05; D-01 forced change (seeded doctors lack flag + admin add-doctor UI not built); F04.03 reconciliation worker (deferred per slice-D).

## Risk / rollback
Low. No code changes. Rollback = stop the two node processes and `DROP DATABASE dermestha_agent`.

## Open items / next session
- Both instances remain running (user :3000, agent :3001) for the user's manual testing.
- Triage the DoctorProfile same-day-only slot gap against doc 06 intent (real UX limitation).
- Optional: dead `/doctor/history` nav link (no route).
- Video/recovery/D-01 flows need time manipulation or admin add-doctor UI to exercise live.

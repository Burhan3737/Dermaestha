# Dermestha — Three-Role Visual Flow Audit

| Field | Value |
| --- | --- |
| Date | 2026-06-15 (session 2026-06-14 evening) |
| Type | FIND + REPORT (no app-code fixes, no committed Playwright specs) |
| Method | Playwright MCP driving the real app on **mock adapters**; single shared browser, **streams run sequentially** with session isolation (logout/login) + DB-level data isolation from the seeded baseline |
| Build under test | `main` @ 32ac5f3 (Slice H · S7 complete; v1 gate Conditional-Go) |
| App launch | `PAYMENT_PROVIDER=mock VIDEO_PROVIDER=mock EMAIL_PROVIDER=console NODE_ENV=development node --env-file=.env server/src/index.js` after `npm run build:client`; `GET /api/health` → 200 |
| Baseline | `node --env-file=.env prisma/scripts/seed-baseline.js` (see §5) |
| Scope note | The four known Conditional-Go gates (DRAFT legal copy F16, email-domain delivery, real-PayFast wiring, Daily webhook-HMAC smoke) and the doc-07 accepted gaps (no modal focus-trap, no WCAG target, no email verification, net-of-fee refunds, DA5 session non-invalidation, deferred audit/state-filter UI, minimal Profile, static featured grid, P-11 Daily-owned device check) are **out of scope** and not re-reported. Only **new** flow issues appear below. |

> **Execution-mode check (Phase 3):** the Playwright MCP server drives a **single shared browser context** (no concurrent isolated contexts), so the three role-streams were run **sequentially**. Correctness is preserved by the data/session isolation baked into the baseline (distinct accounts; admin used a throwaway doctor and never touched the baseline doctor; the patient stream booked new slots; the doctor stream used pre-seeded appointments).

---

## 0. Executive summary

Every navigable flow across the three roles was walked against the running app. **The vast majority work correctly** — booking→pay→confirm→view, the video room (mock), prescriptions + client PDF, both cancellation paths with correct net-of-fee math, the slot-lock race, signup consent gating, forgot/reset password, the full admin panel (doctor lifecycle, medicines, records & audit, settings), and the background workers (the evaluation worker correctly drove `confirmed→in_progress→doctor_no_show`; the audit log captured the entire session).

**One HIGH-severity flow break was found:** the patient booking funnel can only select **today's** slots — there is no day/date navigation anywhere, so booking is impossible whenever today has no bookable slots (a very common real condition). This is invisible to the green E2E suite because the e2e seed always creates a same-day slot.

Beyond that: a cluster of **MEDIUM** UX/navigation gaps (no logout for desktop-patient/doctor/admin; payment-failure leaves an infinite spinner; a dead doctor sidebar "History" link) and several **LOW** polish items.

| Severity | Count |
| --- | --- |
| High | 1 |
| Medium | 3 |
| Low–Med | 3 |
| Low | 5 |
| Info / doc-drift | 2 |

---

## 1. Per-role flow inventory (status per flow)

Status key: **PASS** (works + matches doc) · **BREAK** (broken / dead-end) · **INCONSISTENT** (works but deviates from doc) · **N/T** (not exercisable on the clean baseline; reason given).

### Patient

| # | Flow | Screen(s) / route | Status | Note |
| --- | --- | --- | --- | --- |
| P1 | Landing | P-01 `/` | PASS* | Renders fully. *Featured/hero cards dead-end (ISSUE-5); public `/api/auth/me` 401 console noise (ISSUE-13) |
| P2 | Browse listing | P-02 `/browse` | PASS | Baseline doctor shown, next-slot hint correct |
| P3 | Doctor profile | P-03 `/doctors/:id` | BREAK | Only "Available today"; no day tabs / future-day path (ISSUE-1) |
| P4 | Sign up + consent gate | P-04 `/signup` | PASS | Consent checkbox gates submit; account created + routed |
| P5 | Login + role routing | P-05 `/login` | PASS | Routes patient→/browse, doctor→/doctor, admin→/admin/doctors. (No role field — ISSUE-12) |
| P6 | Forgot + reset password | `/forgot-password`, `/reset-password` | PASS | Enumeration-safe msg; token emailed to console; reset consumes token |
| P7 | Booking (slot + who-for) | P-06 `/book/:id` | BREAK / PASS | No slot picker on the page (reads `?slot=`); "Someone else" expansion works. Funnel break is ISSUE-1 |
| P8 | Pay → confirm | P-07 `/pay/return` | PASS | Mock checkout → "Booking confirmed"; appointment `confirmed` |
| P9 | Payment fail | P-07 | BREAK | Infinite "Awaiting payment confirmation…" (ISSUE-3) |
| P10 | Upcoming dashboard | P-08 `/appointments` | PASS | Join-gating correct; worker `confirmed→in_progress` observed live |
| P11 | Join call (waiting → video) | P-11/P-12 `/video/:id/ready`,`/video/:id` | PASS | Get-ready room + mock video room; **0 console errors** |
| P12 | Past appointments | P-09 `/appointments/history` | PASS | Correct terminal labels (Completed / Cancelled — refunded / — no refund) |
| P13 | View prescription + PDF | P-13 `/appointments/:id/prescriptions` | PASS | Renders Rx; "Download PDF" produces a file client-side |
| P14 | Cancel ≥2h (refund) | P-10 modal | PASS | Breakdown Rs 2,500 − 63 = 2,438; net-of-fee correct |
| P15 | Cancel <2h (no-refund) | P-10 modal | PASS | "No refund… slot stays blocked" warning |
| P16 | Slot-lock race (P1 vs P2) | P-06 | PASS | 2nd patient → "That slot is not available." (SLOT_TAKEN) |
| P17 | 404 / no-leak (cross-tenant) | P-13 of another patient | PASS* | No data leaked (404). *Blank page, no message (ISSUE-10) |
| P18 | Empty / no-slots | P-03 | PASS* | "No slots available today." shown — but it is also the dead-end (ISSUE-1) |
| P19 | Empty upcoming state | P-08 `/appointments` (patient2, no appts) | PASS | "No upcoming appointments." + "Browse doctors" → `/browse` (F05.01 Empty-State Rule) |
| P20 | Logout | `/profile` | PASS* | Works via /profile. *No desktop link to it (ISSUE-2); no redirect after (ISSUE-11) |

### Doctor

| # | Flow | Screen(s) / route | Status | Note |
| --- | --- | --- | --- | --- |
| D1 | Login | P-05 | PASS | Routes to `/doctor` |
| D2 | Forced first-login change (DA3) | D-01 `/doctor/change-password` | PASS | Reset doctor forced to D-01; gate clears on change → `/doctor` |
| D3 | Today's appointments | D-02 `/doctor` | PASS | Correctly empty after worker resolved the seeded slot to `doctor_no_show` (demonstrates the no-show worker) |
| D4 | History | D-02 History **tab** | PASS* | Tab works. *Sidebar "History" link is a dead route (ISSUE-4); raw state enums (ISSUE-9) |
| D5 | Join call | D-04 `/video/:id` | PASS | Shared role-aware `VideoRoom` verified as patient (P11, 0 errors); doctor-side join is covered by **e2e J2** (both contexts join the mock room, joins recorded) |
| D6 | Prescription builder + submit | D-05 `/doctor/appointments/:id/prescribe` | PASS | Read-only patient header, medicine search + free-text, running total, immutability confirm, append (correction) works |
| D7 | Availability edit | D-03 `/doctor/availability` | PASS | Weekly grid renders + interactive (not saved, to protect the baseline doctor) |
| D8 | Doctor-initiated cancel | D-06 modal (on D-02) | PASS | Required internal reason (Cancel disabled until filled); confirm → `doctor_cancelled` + `appointment.doctor_cancelled` audit (doctor actor); refund + apology are best-effort side-effects (F06.02) |
| D9 | Logout | — | BREAK | No logout control in the doctor sidebar at all (ISSUE-2) |

### Admin

| # | Flow | Screen(s) / route | Status | Note |
| --- | --- | --- | --- | --- |
| A1 | Login + landing | `/admin`→`/admin/doctors` | PASS | Default redirect + role routing correct |
| A2 | Add doctor | A-01 | PASS* | Creates Pending doctor. *Photo not enforced as required (ISSUE-6) |
| A3 | Edit doctor | A-01 | PASS | PMC/email omitted from form (immutability); fee edit persists; fee-snapshot note shown |
| A4 | Activate (pending→active) | A-01 | PASS | |
| A5 | Deactivate | A-01 | PASS | Confirm modal with upcoming-count + #9 semantics |
| A6 | Reactivate | A-01 | PASS | |
| A7 | Reset password (DA5) | A-01 | PASS | Sets must-change; verified via D2 |
| A8 | Medicines add | A-02 | PASS | |
| A9 | Medicines deactivate/reactivate | A-02 | PASS* | *No Edit affordance (ISSUE-7) |
| A10 | System-health alerts | A-03 | PASS | "All clear" on clean baseline |
| A11 | Email resend | A-03 | N/T | No `failed` notification jobs on the clean baseline to resend; not manufactured |
| A12 | Records search | A-04 Records | PASS | Table + filters; non-matching filter → "No matching records." |
| A13 | Record detail + dispute | A-04 `/admin/records/:id` | PASS | History/prescriptions/emails; dispute set/clear works |
| A14 | Audit log | A-04 Audit tab | PASS | Full session trail (filters intentionally deferred — accepted) |
| A15 | Settings save | A-05 | PASS | Confirm gate; persists |
| A16 | Logout | — | BREAK | No logout control in the admin sidebar at all (ISSUE-2) |

---

## 2. Issue log

> Severity reflects user impact on a v1 launch. Screenshots are under `.playwright-mcp/` in the repo (referenced where captured).

### ISSUE-1 — [HIGH] Booking funnel is locked to the current Karachi day (no future-day slot selection)

- **Role / screen:** Patient · P-03 doctor profile (`/doctors/:id`) → P-06 booking (`/book/:id`)
- **Doc-expected:** doc 06 §3 "Slot selection (P-06): **Slots are grouped under day tabs**"; doc 02 F03.01 "the picker shows only **future** slots within the doctor's set weekly availability."
- **Actual:** `DoctorProfile.jsx` hardcodes `const [date] = useState(todayKarachiYMD())` (no setter), the section heading is literally "Available today", and it only calls `GET /doctors/:id/slots?date=<today>`. There are **no day tabs / date picker anywhere**. `Booking.jsx` (P-06) has no picker at all — it consumes a `?slot=` URL param the profile produces. When today has no bookable slots (evening, fully-booked, or the doctor isn't available *today*), the patient sees "No slots available today." with **no way to reach a future day** — even though the listing advertises "Next: Mon, 15 Jun, 9:00 am". The backend serves any date (`/slots?date=2026-06-15` returns slots fine), so this is purely a **frontend dead-end**.
- **Repro:** Log in as a patient in the evening (or any time today's window is closed) → Browse → open a doctor profile → "No slots available today." with no further action; the advertised next-day slot is unreachable.
- **Why tests miss it:** E2E J1 + `e2e/support/db.js` `todayWindow()` always seed a *same-day* near-future slot, so the automated journey never needs another day.
- **Verified-capable backend:** `GET /api/doctors/:id/slots?date=YYYY-MM-DD` returns future-day slots correctly.

### ISSUE-2 — [MED] No logout for desktop patients, and none at all for doctors/admins

- **Role / screen:** All · `PatientLayout.jsx`, `SidebarLayout.jsx`
- **Doc-expected:** doc 06 §2 — logged-in patient nav is "Browse / Appointments / **Profile** (bottom tabs on mobile; **top nav on desktop**)"; Profile hosts logout + account details.
- **Actual:** The patient **desktop** top nav renders only Browse + Appointments; the Profile tab (which holds "Log out") lives **only** in the `tabbar only-mobile` bar. The doctor/admin `SidebarLayout` has **no logout control whatsoever** (and no Profile route). Net: the **only** logout affordance in the entire app is the mobile-only patient tab → `/profile`. Desktop patients, and **all** doctors and admins, cannot log out through the UI (worked around in this audit by visiting `/profile` directly).
- **Repro:** Log in as doctor or admin (or as a patient on a ≥768px viewport) → look for a logout/Profile control → none exists in the chrome.

### ISSUE-3 — [MED] Payment failure leaves P-07 on an infinite "Awaiting payment confirmation…" poll

- **Role / screen:** Patient · P-07 (`/pay/return`)
- **Doc-expected:** doc 06 §3 "Payment flow states (P-07)": **Success**, **Failure** ("retry within lock window"), **Lock expired**, **Platform couldn't secure slot**.
- **Actual:** `PaymentReturn.jsx` only branches on `state === 'confirmed'` (success) or a query **error**. On a failed payment the appointment remains `slot_locked` (lock force-expired per ADR-39) and `GET /appointments/:id` returns 200, so the view falls into the generic `state !== 'confirmed'` branch — "Awaiting payment confirmation…" — and the `useBooking` query keeps polling every 2s **forever**. No Failure / Lock-expired state, no retry CTA, no feedback that payment failed.
- **Repro:** Book → mock checkout → **Fail** → P-07 spins indefinitely. (Confirmed: appointment `slot_locked`, payment `failed`, lock expired.)
- **Impact:** This is the real `payment.failed` webhook path, so it affects real PayFast failures/abandonment, not just the mock.

### ISSUE-4 — [MED] Doctor sidebar "History" link is a dead route

- **Role / screen:** Doctor · sidebar link → `/doctor/history`
- **Actual:** `SidebarLayout.jsx` `DOCTOR_LINKS` includes `/doctor/history`, but `doctor.routes.jsx` registers only `/doctor` and `/doctor/availability`. So the link falls through to the SPA catch-all and renders the "Coming in a later slice." placeholder. The doctor's history is only reachable via the **in-page History tab** on `/doctor`.
- **Repro:** Log in as doctor → click "History" in the left sidebar → placeholder page.

### ISSUE-5 — [LOW-MED] Landing featured/hero doctor cards dead-end to "Doctor not found."

- **Role / screen:** Patient (public) · P-01 (`/`)
- **Doc-expected:** doc 06 §3 — the featured grid uses **static placeholder data for v1** (accepted). The doc does not say the cards should be live links to a non-existent profile.
- **Actual:** Every featured card **and** the hero side card link to `/doctors/sample`, which renders "Doctor not found." So the primary acquisition CTAs on the public landing dead-end (gracefully, with nav) for a first-time visitor. The topnav/footer "For doctors" and "About Dermestha" links point to `#` (no-op).

### ISSUE-6 — [LOW-MED] Add-doctor does not enforce the required profile photo

- **Role / screen:** Admin · A-01 add doctor
- **Doc-expected:** doc 02 F10.01 — "Profile photo (file: JPEG/PNG/WebP ≤2MB, **required**, admin upload)".
- **Actual:** A doctor was created with **no photo** and the save succeeded (photo is a separate `POST /api/doctors/:id/photo` upload, not enforced at create). The doctor then lists/cards with an initials fallback.

### ISSUE-7 — [LOW-MED] Medicine catalogue has no Edit affordance

- **Role / screen:** Admin · A-02
- **Doc-expected:** doc 02 F11.03 (edits/renames/price changes propagate); `PATCH /api/admin/medicines/:id` supports field edits.
- **Actual:** Each medicine row exposes only **Deactivate/Reactivate** — no Edit. An admin cannot fix a medicine's name/generic/forms/**price** through the UI (only deactivate + re-add).

### ISSUE-8 — [LOW] No real 404/not-found page

- **Role / screen:** All · any unknown SPA path (e.g. `/totally-bogus-path-xyz`, `/doctor/history`)
- **Actual:** The SPA catch-all renders the same "Coming in a later slice." placeholder (with a stray "Log out" button) as `/profile`, rather than a dedicated not-found page.

### ISSUE-9 — [LOW] Doctor history shows raw state enums

- **Role / screen:** Doctor · D-02 History tab
- **Actual:** States render as raw enums ("cancelled_refunded", "doctor_no_show", "prescription_issued") instead of the friendly labels in doc 06 §3's badge map (the patient side uses the friendly labels). Inconsistent presentation.

### ISSUE-10 — [LOW] Cross-tenant prescription 404 renders a blank page

- **Role / screen:** Patient · P-13 of another patient's appointment
- **Actual:** Correctly **no data leak** (API 404), but the UI shows a bare "Prescriptions" heading with no "not found"/empty-state message.

### ISSUE-11 — [LOW] `/profile` lacks "basic details" + chrome; logout gives no feedback

- **Role / screen:** Patient · `/profile`
- **Doc-expected:** doc 06 registry note — Profile routes to "a minimal account view (**logout + basic details**)".
- **Actual:** Shows only "Coming in a later slice." + a Log out button (no account details), renders with **no nav chrome**, and clicking Log out leaves you on `/profile` with no redirect/confirmation.

### ISSUE-12 — [INFO / doc-drift] Login form has no role field

- **Role / screen:** Patient/Doctor/Admin · P-05
- **Detail:** doc 05 §1 documents `POST /api/auth/login` body as `{ email, password, role }`, but the UI submits email+password only and routing is by the **stored** user role (matching F15.02's intent). The `role` in the documented request body appears vestigial — candidate doc drift for the fix session to confirm against the handler.

### ISSUE-13 — [INFO] Public pages log a `401 /api/auth/me` console error

- **Role / screen:** Public · every anonymous page load
- **Detail:** The SPA's auth bootstrap calls `/api/auth/me`, which returns 401 for anonymous users; the client surfaces it as a console error on each public page. By design, but it is console noise that could mask real errors during QA.

### Positive observations (worth keeping)

- The appointment-evaluation worker correctly drove `confirmed→in_progress` and then `→doctor_no_show` (doctor-absence precedence) within the grace window — observed live.
- Net-of-fee refund math is consistent (modal Rs 2,500 − 63 = 2,438) and matches the seeded payment.
- The slot-lock partial-unique guard surfaced as a clean "That slot is not available." on the P1-vs-P2 race.
- The immutable-prescription append (correction) + the immutability confirmation gate work as specified.
- The audit log captured the **entire** session (auth, system transitions, appointment lifecycle, all admin actions, dispute set/clear) with correct actor/target/timestamp.

---

## 3. e2e Playwright coverage (for the fix session to act on)

> Grounded in a line-by-line read of `e2e/tests/j1…j6`, `e2e/support/{db,auth,seedIds}.js`, and `e2e/global-setup.js`. **No e2e files were changed in this session** — this is the assessment only.

### 3.A — Existing suite (J1–J6): keep / strengthen / update

The suite is 11/11 green and asserts **real** behavior — none of it is wrong. But two specs (and the shared seed) are coupled to the very conditions that hide the bugs, so they must be touched **when the corresponding fix lands**:

| Spec | Verdict | Why / what to change |
| --- | --- | --- |
| `j1` happy-path | **Update on ISSUE-1 fix** | Picks `button.slot.first()`, relying on `global-setup.js` (`minBookingLeadMinutes:30`) + `db.js` `todayWindow()` to guarantee a **same-day** slot. When a day/date picker is added, the slot will sit under a day tab → this step/selector needs updating. |
| `j1` fail-path ("Fail at checkout releases the lock") | **Strengthen (masks ISSUE-3)** | Asserts only `heading 'Booking confirmed' → toHaveCount(0)`, which the infinite "Awaiting payment confirmation…" spinner satisfies. After ISSUE-3 is fixed, assert a **positive** Failure/Lock-expired state + retry CTA. |
| `j6` admin onboarding | **Update on ISSUE-6 fix (coupled)** | Fills every add-doctor field **except the photo** and asserts the doctor appears — i.e. it encodes the "photo not required" behavior. Making the photo required (ISSUE-6) will **break j6**; update it in lockstep (attach a fixture photo). |
| `e2e/support/db.js` + `global-setup.js` | **Extend seed** | `seedAll()` only seeds a same-day-window doctor; `global-setup` forces lead-time 30. To test future-day booking, add a **future-only-availability** doctor (and don't rely on the lead-time widening). *(Aside: this lead=30 write is also why a fresh dev DB shows 30 — the new `seed-baseline.js` normalizes it.)* |
| `j2` video, `j3` prescription, `j4` cancel/refund, `j5` auth/role gates | **Keep as-is** | Drive **pre-seeded** appointments via `seedIds` (not the booking picker) and assert positive outcomes + DB state, so they are independent of the picker/photo bugs. No churn. |

Note: `j5`'s "404 no-leak" asserts the **API** returns 404 (`page.request.get`), not the **UI** — so ISSUE-10 (blank cross-tenant page) is genuinely uncovered (see §3.B).

### 3.B — New specs to add (author **test-first**; several will be red until the fix)

1. **Book a future-day slot (ISSUE-1)** — *red today.* Seed a doctor available on a **future** weekday only; Browse → profile → select a future day → book → pay → confirm. (Plus a component test asserting P-03 exposes day/date navigation.)
2. **Payment-failure UX (ISSUE-3)** — *red today.* book → mock checkout → **Fail** → assert a terminal Failure/Lock-expired state + retry/back CTA within a bounded time (not an infinite poll).
3. **Logout reachability (ISSUE-2)** — assert a logout control is reachable from patient-desktop, doctor, and admin chrome.
4. **Doctor sidebar links resolve (ISSUE-4)** — assert every doctor sidebar link lands on a real route (no catch-all placeholder).
5. **404 page (ISSUE-8)** — assert an unknown route renders a not-found page, not the profile placeholder.
6. **Cross-tenant Rx UI (ISSUE-10)** — extend the no-leak coverage to assert the **UI** shows a not-found/empty state (not a blank heading).
7. **Admin add-doctor photo (ISSUE-6)** + **medicine edit (ISSUE-7)** — once the intended behavior is decided, lock it with a test (and reconcile j6 per §3.A).

> Already well-covered by the existing suite (do not duplicate): doctor-cancel/refund parity is patient-side in `j4`; doctor video join + worker no-show/complete in `j2`; immutable Rx + PDF in `j3`; DA3 forced-change in `j5`+`j6`; role gates in `j5`.

---

## 4. Doc-impact note

This was a find+report pass; **no spec files were edited.** Almost all issues are **code-vs-spec where the spec is correct and the code is wrong** (ISSUE-1/2/3/6 contradict doc 06 §3 / doc 02 F03.01 / F10.01) — these are code fixes, not spec changes. Candidates the fix session should **confirm**, and only then decide whether the *doc* needs an update:

- **doc 05 §1 login body `{ email, password, role }`** (ISSUE-12): if the handler ignores `role`, the doc is stale and should drop it from the documented body.
- **doc 06 registry note "Profile … (logout + basic details)"** (ISSUE-11): the built Profile is a placeholder with no details; either the code should add details or the note should be softened to reflect the v1 placeholder.
- **doc 02 F11.03 medicine edit** (ISSUE-7): the route exists but no UI; decide whether v1 intends UI edit (build it) or doc should note the UI exposes deactivate/reactivate only.

No spec updates are being applied in this session.

---

## 5. Baseline reference (reset to the known state any time)

**Command:**
```
node --env-file=.env prisma/scripts/seed-baseline.js
```
Wipes all domain tables (FK-safe), normalizes `Settings(id=1)` to documented defaults (lead 60m, fallback 0/0), and seeds the baseline below. Idempotent / re-runnable.

**Accounts — password for ALL: `Test123!`**

| Role | Email |
| --- | --- |
| Admin | `baseline.admin@dermestha.test` |
| Patient 1 | `baseline.patient1@dermestha.test` (ToS-accepted) |
| Patient 2 | `baseline.patient2@dermestha.test` (ToS-accepted; slot-lock race partner) |
| Doctor | `baseline.doctor@dermestha.test` (active; weekly availability all 7 days 09:00–21:00) |

**Seeded data:** 1 active medicine ("Baseline Acne Cream"); pre-seeded appointments on the baseline doctor for patient1 — one `confirmed` in the join window (~now+5m), one `prescription_issued` + a linked prescription (view-Rx flow), one `confirmed` ≥2h-future (cancel→refund, with a success Payment), one `confirmed` <2h-future (cancel→no-refund, with a success Payment).

**Caveats for the fix-and-test session:**
- The join-window appointment is **time-relative**: ~15 minutes after a reset the evaluation worker resolves it to `doctor_no_show` (no one joins). **Re-run the seed immediately before exercising the join/doctor-today flows.**
- "completed with a prescription" is seeded as state **`prescription_issued`** (faithful to the §3 state machine — the only state that shows the patient Download-Prescription CTA).
- To exercise the booking happy-path in the UI **today**, the seed gives the baseline doctor all-7-day availability; but because of ISSUE-1, future-day booking is only reachable by constructing `/book/:id?slot=<iso>` until the day-picker is fixed.

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-15 | Initial three-role visual flow audit | Post-Slice H · S7; pre-fix triage input |

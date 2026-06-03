# 2026-06-03-0407 — slice-b-discovery-availability

**Status:** Implementation complete (subagent-driven; all 16 tasks + review fixes; 63 server + 21 client green; final review READY TO MERGE). Pending gated steps: doc-13 sweep + merge/push.
**Goal:** Build Slice B (Discovery & Availability) of the M1+M2 journey — public doctor listing/profile, doctor weekly availability + 30-min slot generation, nav layouts, seeded doctors; screens P-02/P-03/D-03.
**Skill(s) used:** superpowers:brainstorming (user-invoked) → writing-plans → subagent-driven-development (implementer + two-stage review per task) → receiving-code-review
**Ticket / issue:** None
**Branch:** feat/slice-b-discovery-availability (off main @ 9440403)
**Commits / PR:** (pending)
**Last updated:** 2026-06-03-0407
**Tags:** #feature #discovery #availability #frontend

## Summary
Second slice of the 4-slice M1+M2 decomposition (Slice A merged in 9440403). Brainstormed + approved the Slice B design: doctor discovery (listing/profile), availability read/replace with slot generation, three nav layouts, seeded demo doctors. Implementation pending.

## Context / why
Slice A delivered auth + the client foundation. Slice B adds the read-side discovery + doctor availability that booking (Slice C) depends on. Doctors are seeded because admin onboarding is M4.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-03-slice-b-discovery-availability-design.md` | Created | Slice B design (brainstorming output). |
| `agentChangeLogs/2026-06-03-0407-slice-b-discovery-availability.md` | Created | This changelog. |
| `agentChangeLogs/index.md` | Modified | Added Slice B index line. |
| `docs/superpowers/plans/2026-06-03-slice-b-discovery-availability.md` | Created | Slice B implementation plan (writing-plans output). |
| `docs/specification/11-ARCHITECTURE_DECISION_RECORD.md` | Modified | Added ADR-21 (date-fns-tz for Karachi↔UTC); v1.2. |
| `docs/specification/03-ARCHITECTURE_DOCUMENT.md` | Modified | Noted date-fns-tz in stack; v1.2. |
| `docs/specification/05-API_SPECIFICATION_DOCUMENT.md` | Modified | Added `BLOCK_HAS_BOOKINGS` to §3.2 409 examples; v1.2. |
| `server/package.json` + `package-lock.json` | Modified | Added `date-fns-tz` ^3.2.0 (server). Task 0.1, commit `4cd37f6`. |
| `server/src/config/constants.js` | Modified | Added `ACTIVE_APPOINTMENT_STATES`. Task 0.1, commit `4cd37f6`. |
| `prisma/seed.js` | Modified | Seeded 2 demo doctors + Mon/Wed/Fri 18:00–21:00 blocks (idempotent). Task 0.2, commit `8e87649`. |
| `server/src/lib/tz.js` (+ test) | Created | Karachi↔UTC helper (`karachiWallTimeToUtc`, `karachiWeekday`, `KARACHI`). Task 1.1, commit `491bc95`. |
| `shared/schemas/availability.js` + `shared/schemas/index.js` | Created/Modified | Availability/doctor-list/slots Zod DTOs + re-export seam. Task 1.2, commit `cf3bac2`. |
| `server/src/services/availability.service.js` (+ test) | Created | Slot generation + lead-time filter + active-appt exclusion + `BLOCK_HAS_BOOKINGS` guard. Task 1.3, commit `3adc49f`; review fix (full-slot-fit guard + hoisted settings + 4 tests) `005953e`. |
| `server/src/services/doctor.service.js` (+ test) | Created | `listActiveDoctors` (no-leak card shape + nextAvailableSlot hint) + `getPublicDoctor` (404 no-leak) + `getDoctorByUserId`. Task 1.4, commit `1f966cb`. |
| `server/src/controllers/doctor.controller.js`, `server/src/routes/doctors.js`, `server/src/routes/availability.js`, `server/src/index.js` | Created/Modified | Public discovery routes + doctor-own/admin availability + `PUT /availability`; wired behind `mustChangePasswordGate`. Task 1.5, commit `dcb3e02`. |
| `server/src/test/discovery.integration.test.js` | Created | Real-DB integration: listing envelope, profile 200/404, slots, 401 auth guard. Task 1.6, commit `386a76c`. |
| `client/src/lib/format.js` (+ test) | Created | `formatPkr` (paisa→Rs) + `formatKarachi` (UTC→Karachi, native Intl). Task 2.1, commit `aa5ca6b`. |
| `client/src/layouts/PatientLayout.jsx`, `SidebarLayout.jsx` | Created | Patient topnav + mobile tabbar; doctor sidebar. Task 2.2, commit `72ea980`. |
| `client/src/components/DoctorCard.jsx`, `SlotButton.jsx` (+ test) | Created | Listing card + slot button. Task 2.3, commit `091d650`. |
| `client/src/views/DoctorListing.jsx` (+ test) | Created | P-02 public listing (loading/error/empty/populated). Task 2.4, commit `63d8625`. |
| `client/src/views/DoctorProfile.jsx` (+ test) | Created | P-03 profile + same-day slots → Slice-C book placeholder; slots-error state added in review (`2adb905`). Task 2.5, commit `6d37090`. |
| `client/src/views/AvailabilityGrid.jsx` (+ test), `client/src/lib/apiClient.js`, `server/src/services/auth.service.js` (+ test) | Created/Modified | D-03 weekly grid (block↔cell round-trip) + `api.put` + `doctorId` on doctor session. Task 2.6, commit `4d55e2d`; cleanup `bc6edd5`. |
| `client/src/routes.jsx`, `client/src/App.jsx` | Modified | `/` = listing, `/doctors/:id` = profile, `/doctor/availability` = D-03 (RoleRoute doctor-only). Task 2.7, commit `99b850c`. |
| ~40 source files (`server/`, `client/`, `shared/`, `prisma/`) | Modified | Prettier normalization (whitespace-only, user-approved). Task 3.1, commit `663e447`. |

## Dependencies / config / schema
Added `date-fns-tz` ^3.2.0 (server) for Asia/Karachi→UTC slot math (ADR-21) — v3 API (`fromZonedTime`/`formatInTimeZone`) confirmed. No schema change (Doctor/AvailabilityBlock models already existed). Seed gained 2 demo doctors (data, not schema). No migration in Slice B.

## Decisions
- Doctor seeding via `seed.js` (demo doctors + availability). (User chose.)
- Build all 3 nav layouts now (TopNav + BottomTabs + Sidebar). (User chose.)
- P-03 shows slots; Book → Slice-C placeholder. (User chose.)
- Timezone: `date-fns-tz` server-side + native `Intl` client display. (User chose.) → ADR-21.
- P-01 Landing confirmed OUT of Slice B (M4).

## Notable findings
- Slots are generated at read time (not stored), so the availability guard checks live appointments, not slot rows.
- **Review catch (Task 1.3):** the plan's `blocksCoverSlot` orphan guard only checked the slot *start* was inside a block, while `generateSlots` requires the *full* 30-min slot to fit — an inconsistency that could silently orphan an appointment under a shortened, non-slot-aligned block. Fixed with a minutes-based full-fit check (`005953e`).
- **Review catch (Task 2.6):** removed an unreachable `24:00` branch in `cellsToBlocks` (grid renders 08:00–22:00, so hour-23 cells can't be toggled, and server Zod rejects `24:00`); behaviour verified equivalent (`bc6edd5`).
- **Perf (accepted):** `listActiveDoctors` computes `nextAvailableSlot` per card (N×~14-day scan, fanned out via `Promise.all`) — a documented hint-only tradeoff, not a committed slot. Settings fetch hoisted out of the lookahead loop in the fix.
- `auth.service` now exposes `doctorId` on doctor sessions/`/me` (Slice-A security behaviours — timing-equalization, enumeration-safe 401, audit — verified preserved by the reviewer).

## Verification
**Verified.** Built subagent-driven (implementer → spec review → code-quality review per logic task; final whole-impl integration review = READY TO MERGE).
- Server suite: **63/63** green (17 files) — incl. 9 availability.service, 3 doctor.service, 3 tz, 4 discovery integration.
- Client suite: **21/21** green (11 files) — incl. format, DoctorCard, DoctorListing, DoctorProfile, AvailabilityGrid.
- Client build: success (107 modules, clean).
- Final integration review: shape consistency (producer↔consumer), route↔client-call alignment, doctorId plumbing, TZ round-trip, money units — all PASS.

## Risk / rollback
New server dependency (`date-fns-tz`) + ADR-21 doc edit; both reversible. No schema/migration in Slice B. Prettier pass reformatted ~13 unrelated Slice-A files (whitespace-only, user-approved as a one-time normalization).

## Open items / next session
- **Slice B implementation COMPLETE** — 16 plan tasks + 3 review fixes; all suites green; final review READY TO MERGE.
- **PENDING (gated):** doc-13 status sweep (governance — needs user approval of specific edits); merge to `main` + push (mirror Slice A).
- Follow-up (not a blocker): `DoctorProfile` slots-error state was added (`2adb905`) — the only review nit; resolved.
- Next slices: C (Booking + Payment — consumes these slots/`BLOCK_HAS_BOOKINGS`), D (Video).

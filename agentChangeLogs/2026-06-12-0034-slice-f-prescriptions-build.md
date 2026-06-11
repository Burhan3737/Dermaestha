# 2026-06-12-0034 — slice-f-prescriptions-build

**Status:** Completed (build + canon sweep; merge decision pending with user)
**Goal:** Execute the Slice F (Prescriptions, M3) implementation plan subagent-driven on branch `feature/slice-f`.
**Skill(s) used:** superpowers:subagent-driven-development (user chose); plan: `docs/superpowers/plans/2026-06-12-slice-f-prescriptions.md`
**Ticket / issue:** None
**Branch:** feature/slice-f (user-approved)
**Commits / PR:** 25 commits, 5138c01..0b8aa6c (branched from 253637f); not merged, not pushed
**Last updated:** 2026-06-12 (post canon sweep)
**Tags:** #feature #prescriptions #m3 #migration #docs

## Summary

COMPLETE — all 16 plan tasks executed subagent-driven with two-stage review (spec + quality) per task plus a final whole-slice review ("Ready to merge — Yes"). Built: outbox dedupeKey migration (per-prescription `prescription_ready`), medicine module (search + admin CRUD), prescription module (immutable submit with snapshots, atomic tx, chronological read), `completed→prescription_issued` + state-guarded transition write (race fix), patient history scope + hasPrescription, client P-09/P-13/D-05 views + D-02 additions, lazy pdf-lib render boundary. 202 server + 59 client tests green (from 169+41). Canon docs 04/05/11(ADR-28)/12/13(v1.8)/14 swept with user approval (doc 08 skipped — no per-route enumeration).

## Context / why

Design + plan approved in session 2026-06-11-2350. Baseline: 169 server + 41 client tests green on main (Slice E merged).

## Files changed

| File | Action | What & why |
|---|---|---|
| `prisma/schema.prisma` | Modified | T1: NotificationJob `dedupeKey` field + unique widened to (appointmentId, type, dedupeKey) |
| `prisma/migrations/20260612003907_slice_f_outbox_dedupe_key/migration.sql` | Created | T1: hand-authored (no TTY for migrate dev), shadow-DB-verified drift-free by reviewer |
| `server/src/modules/notification/service.js` | Modified | T1: `enqueue` gains `dedupeKey=''` param; upsert on new composite |
| `server/src/modules/notification/test.js` | Modified | T1: composite-key assertions + new dedupeKey test (+create assertion per review) |
| `server/src/test/notification.integration.test.js` | Modified | Race fix: pinned to dr.bilal (parallel files contended for one doctor's first slot) |
| `server/src/test/booking.integration.test.js` | Modified | Review fix: symmetric pin to dr.ayesha (kills the implicit row-order dependency) |
| `shared/schemas/medicine/medicine.js` | Created | T2: search/create/update DTOs (+review: unitPrice int4 ceiling) |
| `shared/schemas/prescription/prescription.js` | Created | T2: create DTO, item XOR medicineId/medicineName (+review: refine path) |
| `shared/schemas/index.js` | Modified | T2: barrel exports |
| `server/src/modules/medicine/service.js` | Created | T3: list (active-only search) / create / update + audit (+review: catch narrowed to P2025) |
| `server/src/modules/medicine/test.js` | Created | T3: 6 unit tests (incl. non-P2025 propagation pin) |
| `server/src/modules/medicine/controller.js` | Created | T4: list/create/update handlers |
| `server/src/modules/medicine/index.js` | Created | T4: medicinesRouter (doctor/admin GET) + adminMedicinesRouter (admin POST/PATCH) |
| `server/src/routes.js` | Modified | T4: mounts /api/medicines + /api/admin/medicines |
| `server/src/modules/appointment/service.js` | Modified | T5: LEGAL gains completed→prescription_issued; T6: TERMINAL hoist, patient history scope, hasPrescription (_count), getForRole subject/patientName fields |
| `server/src/modules/appointment/test.js` | Modified | T5/T6 tests (+review: audit/update-shape assertions, it.each terminal pins; T7 review: updateMany mocks + race-regression test) |
| `server/src/modules/prescription/service.js` | Created | T7: immutable submit (snapshots, in-tx transition+outbox, dedupeKey=rx id); T8: listByAppointment (owner/admin gate, issuedAt asc) |
| `server/src/modules/prescription/test.js` | Created | T7/T8: 11 unit tests (+review: tx-client assertion, notes/followUpDate mapping, VALIDATION_FAILED) |
| `server/src/modules/prescription/controller.js` | Created | T9: create (201) / list ({data}) handlers |
| `server/src/modules/prescription/index.js` | Created | T9: mergeParams router — POST doctor-only, GET patient/doctor/admin |
| `server/src/test/prescription.integration.test.js` | Created | T10: 8 integration tests incl. deterministic Postgres row-lock race proof (+review: price assertion, sentinel-bound cleanup) |
| `client/src/modules/appointment/stateLabel.js` | Created | T11: F08.01 exact label mapping |
| `client/src/modules/appointment/views/Past/*` | Created | T11: P-09 view + tests |
| `client/src/modules/appointment/useAppointment.js` | Modified | T11: scope option (history) |
| `client/src/modules/appointment/views/Upcoming/Upcoming.jsx` | Modified | T11: tab bar insertion only |
| `client/src/modules/appointment/appointment.routes.jsx` | Modified | T11: /appointments/history route |
| `client/src/lib/pdf/renderPrescriptionPdf.{js,test.js}` | Created | T12: §3.5 boundary, lazy pdf-lib (+review fixes in T13 commit) |
| `client/package.json`, `package-lock.json` | Modified | T12: pdf-lib dependency |
| `client/vitest.config.js` | Modified | T12: include pattern broadened to *.test.{js,jsx} (pdf test is .js) |
| `client/src/modules/prescription/*` | Created | T13/T14: usePrescription, P-13 view+tests, D-05 builder+tests, MedicineSearch component, routes (+review fixes) |
| `client/src/routes.jsx` | Modified | T13: prescriptionRoutes spread |
| `client/src/modules/doctor/views/DoctorToday/*` | Modified | T15: Write-prescription link + awaiting badge + 2 tests |
| `docs/specification/04-DATABASE_DOCUMENT.md` | Modified | T16 (approved): dedupe_key column + 3-col unique; doctorSnapshot comment fix (v1.5) |
| `docs/specification/05-API_SPECIFICATION_DOCUMENT.md` | Modified | T16 (approved): 5 endpoints, history scope/hasPrescription/detail fields, guarded-transition semantics, INVALID_STATE replaces never-built ALREADY_PRESCRIBED, F11 routes corrected to built shape (v1.9) |
| `docs/specification/11-ARCHITECTURE_DECISION_RECORD.md` | Modified | T16 (approved): ADR-28 — guarded transition write + outbox dedupeKey relaxation (v1.9) |
| `docs/specification/12-SCOPE_FEATURE_TEST_CASES_DOCUMENT.md` | Modified | T16 (approved): TC-F08-008..014, TC-F11-004..006 (v1.4) |
| `docs/specification/13-PRODUCT_STATUS_TRACKER.md` | Modified | T16 (approved): M3 sweep, modules 10/11 + F08/F11 Built, views 13/24, stale screen-ID + Video-chrome rows fixed (v1.8) |
| `docs/specification/14-INTEGRATION_CONTRACTS_DOCUMENT.md` | Modified | T16 (approved): prescription_ready trigger = every submit, dedupeKey semantics (v1.6) |

## Dependencies / config / schema

Planned: migration `slice_f_outbox_dedupe_key` (notification_jobs.dedupe_key + widened unique); client dependency `pdf-lib`.

## Decisions

None yet (build follows the approved plan; deviations will be recorded here).

## Notable findings

- **Latent Slice E test race (now fixed):** `booking.integration.test.js` and `notification.integration.test.js` both picked the same doctor's first free slot; under Vitest's parallel file execution one fails 422, and its `afterAll` cleanup with an undefined appointmentId (`deleteMany({ where: { appointmentId: undefined } })` = unfiltered delete in Prisma) wiped ALL notification_jobs, failing the other file. Fixed by pinning distinct seeded doctors per file (commits be14804, 7f79460). The undefined-cleanup footgun pattern remains in test afterAll blocks generally — noted, not fixed (out of scope).
- Real-DB dedupe semantics coverage is deliberately deferred to T10's correction test (2 jobs, distinct dedupeKeys) — tracked per quality review. DONE in T10 (distinct-dedupeKey assertion).
- **TOCTOU double-submit race (found by T7 quality review, FIXED):** `transition()`'s UPDATE had no state guard in its WHERE — two concurrent first-issue submits could both commit (duplicate prescriptions + emails). Hardened to a state-guarded `updateMany` + count check (commit 0da789b); proven on real Postgres via a held-row-lock race test in T10 (winner commits, loser 409s and rolls back atomically).
- **HTTP-level concurrency tests can't prove DB races in-process:** supertest + Promise.all serializes through the event loop — the "loser" legitimately becomes a correction (201). The race proof had to be staged at the Postgres level (held `$transaction` row lock racing a real `transition()` call). The first test design observed [201,201] and was correctly BLOCKED by the implementer.
- Declined review suggestions (verified wrong premises): validateQuery extraction "for T9" (T9 has no query validation); P2023 malformed-UUID handling (ids are cuid strings → bogus ids are P2025 → already 404); pdf-lib em-dash "WinAnsi risk" (empirically disproven by reviewer — substitution kept as harmless).
- Final-review minors (recorded, deliberate non-fixes): (1) D-02 Write-prescription/awaiting-badge rows surface in the History tab, not Today — consequence of F05.02's canon today-scope (confirmed/in_progress only); state-driven rendering is correct wherever rows appear. (2) POST /prescriptions returns a bare object while GET wraps {data} — matches the appointment module's detail-vs-list convention; no consumer reads the POST body.
- T14 quality review fixes: MedicineSearch extracted to prescription/components/ (largest-view outlier vs module convention), stable rowId keys, in-flight ref guard on the immutable submit.

## Verification

- `npm test` → **202 passed, 0 failed** (31 files; up from 169 baseline) — run repeatedly, incl. twice consecutively at T10 and at final review
- `npm --workspace client test` → **59 passed, 0 failed** (22 files; up from 41)
- `npm run lint` → clean
- `npx prisma migrate status` → "Database schema is up to date!" (5 migrations)
- `npm run build:client` → success; **pdf-lib code-split into a separate lazy chunk (435 kB raw / 180 kB gzip); main bundle ~300 kB** — §3.5 lazy-load criterion verified
- Per-task two-stage reviews (spec + quality) on all 15 code tasks + final whole-slice review: **Ready to merge — Yes** (2 non-blocking minors recorded below)

## Risk / rollback

Additive schema migration (default '' column + widened unique — backward compatible). Rollback = drop branch; migration is reversible by dropping the column/index.

## Open items / next session

1. ~~Execute Tasks 1–15~~ — done, all reviewed.
2. ~~Task 16 canon-doc edits~~ — approved + applied (0b8aa6c).
3. Merge decision (finishing-a-development-branch): merge feature/slice-f → main (no-ff, matches prior slices) needs user approval; no push without approval.
4. Deferred (recorded, deliberate): D-02 today-tab surfacing decision (F05.02 scope keeps completed rows in History — fine as built, revisit only if doctors ask); POST /prescriptions envelope wart; listbox blur-close + aria-activedescendant (M4 a11y polish); PDF pagination >15 items (M4); final email template copy (M4).

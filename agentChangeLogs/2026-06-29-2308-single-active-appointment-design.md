# 2026-06-29-2308 — single-active-appointment-design

**Status:** Partial
**Goal:** Review the post-tag payment/video changes for flow-breaking bugs, then brainstorm + spec a fix for the unbounded slot-squatting gap (limit a patient to one upcoming appointment).
**Skill(s) used:** code-review (workflow), superpowers:brainstorming (opted in via /brainstorming)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** Branch `feat/single-active-appointment` off `main@03be977`. Spec `0e6a12a`, plan `03be977`; impl `a154903` (server guard), `958e32e` (Booking copy), `4504c2a` (pending-cancel). Not merged/pushed.
**Last updated:** 2026-06-30-0030
**Tags:** #design #spec #bugfix

## Summary
A high-effort workflow code review of the manual-payment pivot (changes since `pre-manual-payment-pivot`) found no flow-breaking bugs in the happy path; the scariest finding (a patient can hold unlimited slots forever) is by-design per ADR-43 but leaves a real squat surface. Brainstormed a fix: limit each patient to ONE upcoming appointment (pending or confirmed), replacing the now-subsumed No-Overlap check, plus exposing patient-cancel on pending holds so the rule stays humane. Wrote the design spec; implementation not started.

## Context / why
ADR-43 removed timed slot-lock expiry, so a `pending` hold occupies a slot until a human cancels it. `lockSlot` only enforces No-Overlap, not a per-patient cap, so one account can squat many future slots. User asked to fix this with a one-appointment-at-a-time rule.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-29-single-active-appointment-design.md` | Created | Design spec for the single-active-appointment limit + pending-cancel enablement |
| `agentChangeLogs/2026-06-29-2308-single-active-appointment-design.md` | Created | This session changelog |
| `agentChangeLogs/index.md` | Modified | Added this session's index line |
| `docs/superpowers/plans/2026-06-29-single-active-appointment.md` | Created | TDD implementation plan (3 tasks: server guard, Booking copy, pending-cancel) |
| `server/src/modules/appointment/service.js` | Modified | `lockSlot`: replaced No-Overlap check with single-active-appointment guard (`ACTIVE_LOCK_EXISTS`, 409, `slotEnd>now`); dropped `OVERLAP` (commit a154903) |
| `server/test/unit/modules/appointment/service.test.js` | Modified | Replaced OVERLAP test with single-active + query-shape tests (a154903) |
| `client/src/modules/booking/views/Booking/Booking.jsx` | Modified | Block-link copy → "Go to your appointments" (commit 958e32e) |
| `client/test/unit/modules/booking/views/Booking/Booking.test.jsx` | Modified | Updated block-link test name/matcher (958e32e) |
| `client/src/modules/appointment/views/Upcoming/Upcoming.jsx` | Modified | Cancel button on pending rows (reuses CancelModal/setCancelId) (commit 4504c2a) |
| `client/test/unit/modules/appointment/views/Upcoming/Upcoming.test.jsx` | Modified | Added pending-cancel flow test (4504c2a) |
| `client/src/modules/booking/views/Booking/Booking.jsx` | Modified | Refreshed stale `ACTIVE_LOCK_EXISTS` catch comment (commit fb5432c) |
| `docs/specification/02-SCOPE_FEATURE_DOCUMENT.md` | Modified | F03.03: Single-Lock+No-Overlap → Single-Active-Appointment Rule (ADR-44 doc-impact) |
| `docs/specification/05-API_SPECIFICATION_DOCUMENT.md` | Modified | lock endpoint + 409 list: `OVERLAP`→`ACTIVE_LOCK_EXISTS` (ADR-44 doc-impact) |
| `docs/specification/06-DESIGN_SYSTEM_THEME_DOCUMENT.md` | Modified | Active-lock guard copy/link + pending Cancel action (ADR-44 doc-impact) |
| `docs/specification/11-ARCHITECTURE_DECISION_RECORD.md` | Modified | Added ADR-44 (single-active-appointment limit) + index + footer |
| `docs/specification/12-SCOPE_FEATURE_TEST_CASES_DOCUMENT.md` | Modified | TC-F03-007 broadened, TC-F03-008 retired, TC-F03-011 copy, +TC-F03-012 (ADR-44) |
| `docs/specification/13-PRODUCT_STATUS_TRACKER.md` | Modified | Footer note: single-active cap shipped (ADR-44) |

## Dependencies / config / schema
None. No schema change — the rule is a service-layer query over existing columns/states.

## Decisions
- **Strict one-upcoming-appointment per patient account** (pending OR confirmed, `slotEnd > now`); spans subjects (booking "for someone else" counts against the same cap) to prevent multi-subject squatting. Accepted v1 tradeoff: no simultaneous self + child upcoming appointments.
- **Replace** the No-Overlap check rather than add alongside — the single-active guard strictly subsumes it; `OVERLAP` error becomes unreachable and is removed.
- **Reuse `ACTIVE_LOCK_EXISTS`** error code + the orphaned client `lockBlocked` handler (copy tweak only).
- **Check-then-insert** (no DB constraint), matching the existing No-Overlap style; concurrent double-lock race accepted as residual.
- **Add patient-cancel to `pending` rows** (server already supports it; UI did not) so a blocked patient can self-unblock.

## Notable findings
- `lockSlot` is the sole appointment-creation path (`prisma.appointment.create` appears once) — one guard cannot be bypassed.
- Client `Booking.jsx` still carries the orphaned `ACTIVE_LOCK_EXISTS` / `lockBlocked` / "go to your pending booking" UI from the pre-pivot Single-Lock guard — re-lit by this change.
- Patient UI exposes Cancel only on `confirmed` rows; server `cancel()` accepts `pending` too — the missing half of the escape hatch.
- Migration `20260627000000_manual_payment_pivot` has a latent enum-mapping bug (refund notification types not remapped); verified harmless to the current dev DB (migration already applied cleanly) and to a fresh prod. Out of scope for this change; noted only.

## Verification
Server suite 27/27 and full client suite 143/143 green (reported by implementers, per-task TDD RED/GREEN evidence in `.superpowers/sdd/task-*-report.md`). Per-task reviews: all 3 Approved. Final whole-branch review (opus, `03be977..4504c2a`): Ready to merge — Yes; no Critical/Important; `OVERLAP` confirmed removed repo-wide. `npx prisma migrate status` → "Database schema is up to date!" (pre-existing, no schema change here).

## Risk / rollback
Design doc + changelog only; no runtime impact. Rollback = delete the two new docs and revert the index line.

## Open items / next session
- **Doc-impact (apply with approval — code is committed):** docs 02, 05, 11 (new ADR), 12, 13. Doc 04 not impacted. `OVERLAP` removed from code; doc 05 still references it (covered by the 05 update).
- **Two cosmetic minors (optional, pre-merge):** (1) `Booking.jsx:29-30` catch comment still says "Single-Lock"/"pending booking" — now stale (blocker can be confirmed); reword. (2) optional Upcoming test for a pending row with a submitted `paymentReference` + Cancel present.
- **Branch not merged/pushed** — awaiting decision (finishing-a-development-branch).

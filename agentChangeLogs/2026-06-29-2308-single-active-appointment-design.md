# 2026-06-29-2308 — single-active-appointment-design

**Status:** Partial
**Goal:** Review the post-tag payment/video changes for flow-breaking bugs, then brainstorm + spec a fix for the unbounded slot-squatting gap (limit a patient to one upcoming appointment).
**Skill(s) used:** code-review (workflow), superpowers:brainstorming (opted in via /brainstorming)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None yet (spec commit pending)
**Last updated:** 2026-06-29-2308
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
Not verified (design only — no code changed). `npx prisma migrate status` → "Database schema is up to date!" (used to confirm the migration finding is not currently biting).

## Risk / rollback
Design doc + changelog only; no runtime impact. Rollback = delete the two new docs and revert the index line.

## Open items / next session
- User to review the committed spec (review gate).
- On approval: invoke writing-plans to produce the implementation plan.
- Spec doc-impact (apply at END, post-code, with approval): docs 02, 05, 11 (new ADR), 12, 13. Doc 04 not impacted.
- `OVERLAP` cleanup sweep across client/tests/docs during implementation.

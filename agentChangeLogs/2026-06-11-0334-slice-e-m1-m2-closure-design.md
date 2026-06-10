# 2026-06-11-0334 — slice-e-m1-m2-closure-design

**Status:** Partial
**Goal:** Brainstorm and spec the road to v1 (complete M1–M4): decompose into slices E→F→G→H and produce the approved Slice E design doc.
**Skill(s) used:** superpowers:brainstorming (user-invoked)
**Ticket / issue:** None
**Branch:** main (docs only; no code changes)
**Commits / PR:** None yet (design doc commit pending)
**Last updated:** 2026-06-11-0334
**Tags:** #design #docs #planning

## Summary

User asked to complete M1–M4 so v1 is ready. Scoped the remaining work from doc 13 + the 2026-06-09 gap report, decomposed it into four slices (E: M1/M2 closure, F: M3 prescriptions, G: M4 admin, H: M4 launch), settled the vendor-credential strategy (Resend key-fallback in E, PayFast keys-only at H, Daily.co key from user at H), and produced the approved Slice E design at `docs/superpowers/specs/2026-06-11-slice-e-m1-m2-closure-design.md`. Implementation plan (writing-plans) is the next step after user spec review.

## Context / why

M1 ~85% / M2 ~75% (slices A–D merged, 180 tests green) but the spec's milestone definitions include deliberately deferred items (reconciliation worker, refund retry, reminders, fidelity gaps G1–G5). M3/M4 at 0%. The gap report's triage drives Slice E's content.

## Files changed

| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-11-slice-e-m1-m2-closure-design.md` | Created | Approved Slice E design (outbox + 3 workers + G1–G5 fixes + Resend adapter) + E→F→G→H roadmap so future sessions need no conversational context |
| `agentChangeLogs/2026-06-11-0334-slice-e-m1-m2-closure-design.md` | Created | This session log |
| `agentChangeLogs/index.md` | Modified | Added this session's entry |
| `docs/superpowers/plans/2026-06-11-slice-e-m1-m2-closure.md` | Created | 16-task TDD implementation plan (writing-plans skill), grounded in source re-reads; includes canon-doc approval gate (Task 16) |
| `docs/superpowers/specs/2026-06-11-slice-e-m1-m2-closure-design.md` | Modified | Reality note added to §6: G5, G2-route, G1-visibility already fixed in the 2026-06-09 session — plan scopes only the open remainder |

## Dependencies / config / schema

None this session (design only). The design *plans*: one Prisma migration (`NotificationJob` model + enums + 2 `Payment` fields), new env/constants (`EMAIL_MAX_ATTEMPTS`, `EMAIL_BACKOFF_BASE_SEC`, `RECONCILIATION_LOOKBACK_H`, `RECONCILIATION_MIN_AGE_MIN`), Resend key-based provider fallback.

## Decisions

- Slice order E→F→G→H (user-approved); each slice gets its own design→plan→build cycle in its own session(s).
- F07 reminders built in Slice E (shares worker machinery with refund retry), not deferred to H.
- Notification persistence = unified `NotificationJob` outbox table (Approach 1); rejected sent-flags (fails F07.03 retry) and early AdminAlert table (M4 surface).
- Resend: real adapter in E with boot-time `RESEND_API_KEY` fallback to console (user decision); PayFast real adapter in H (keys-only launch); Daily.co credentials from user at H.
- Edge #6a reconciliation refund is full/gross (platform fault), not net-of-fee.
- Alert representation for E = audit rows with `targetRef`/`providerRef`; dedicated feed storage decided in Slice G.

## Notable findings

- The 2026-06-09 gap-fix session already landed G5 (`replaceWeeklyBlocks` expired-lock exclusion), G2's route half (slots gate via `getPublicDoctor`), and G1's visibility half (`refundStatus:'failed'` in `initiateRefund`'s catch); the confirmation email is also already fire-and-forget post-commit. Still open: G2 booking half (`lockSlot` unguarded), G3, G4, all three workers.
- `RefundStatus` enum already has `retrying`/`failed`; `REFUND_MAX_ATTEMPTS`/`REFUND_BACKOFF_BASE_SEC` exist with zero consumers — schema/constants anticipated the retry worker.
- No notification/outbox model exists anywhere in the schema; F07.03 is unimplementable without persistence.
- `workers/index.js` comment explicitly reserves seats for the notification + reconciliation workers (ADR-08 pattern).

## Verification

Not verified (no code changed; design grounded in direct reads of doc 00/02/13/15, `prisma/schema.prisma`, `server/src/workers/index.js`, `constants.js`, and the 2026-06-09 gap report).

## Risk / rollback

None — documentation only. Rollback = delete the design doc + this log entry.

## Open items / next session

- User to review the written Slice E design doc.
- Commit the design doc (this session, after review).
- Invoke superpowers:writing-plans for the Slice E implementation plan.
- Slices F/G/H: design cycles in later sessions per the roadmap (§13 of the design doc).
- User-side (no rush): Daily.co account + `DAILY_API_KEY`/`DAILY_DOMAIN` before Slice H; Resend key (+ domain) whenever real email delivery is wanted; PayFast merchant keys before launch.

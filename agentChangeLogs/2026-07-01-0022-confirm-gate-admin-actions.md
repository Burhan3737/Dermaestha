# 2026-07-01-0022 — confirm-gate-admin-actions

**Status:** Partial
**Goal:** Add confirmation dialogs (via the shared `ConfirmDialog`) to consequential admin actions that previously fired immediately on click.
**Skill(s) used:** None (continuation of the confirmation-dialog work; no skill opted in for this batch)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None yet (changes ready for review, awaiting approval to commit)
**Last updated:** 2026-07-01-0022
**Tags:** #feature #ux

## Summary
Audited the app for state-changing actions with no confirmation step. Five consequential admin
actions fired directly on click: A-06 Accept payment, A-06 Reject payment, A-02 Deactivate/Reactivate
medicine, and A-01 Reactivate doctor (deactivate was already gated — reactivate was asymmetric).
Gated all five through the shared `ConfirmDialog` (danger intent for destructive ones — Reject,
Deactivate; spruce for the rest). Verified the Accept/Reject server side effects before implementing.

## Context / why
User flagged admin payment accept/reject as missing a confirmation while navigating the app, and
asked to find any other such areas and decide per-area. Audit + decision recorded below.

## Files changed
| File | Action | What & why |
|---|---|---|
| `client/src/modules/admin/views/AdminReview/AdminReview.jsx` | Modified | Accept/Reject now open a `ConfirmDialog` (Accept = spruce, Reject = danger); errors moved into the dialog (removed the top-level action-error alert) |
| `client/src/modules/admin/views/AdminMedicines/AdminMedicines.jsx` | Modified | Deactivate (danger) + Reactivate (spruce) medicine now gated via `ConfirmDialog` |
| `client/src/modules/admin/views/AdminDoctors/AdminDoctors.jsx` | Modified | Reactivate (Activate button) now gated via `ConfirmDialog` (spruce); deactivate was already gated |
| `client/test/unit/modules/admin/views/AdminReview/AdminReview.test.jsx` | Modified | Accept/Reject tests click through the dialog; assert gating + accent intent |
| `client/test/unit/modules/admin/views/AdminMedicines/AdminMedicines.test.jsx` | Modified | Deactivate test clicks through the dialog; asserts danger accent + gating |
| `client/test/unit/modules/admin/views/AdminDoctors/AdminDoctors.test.jsx` | Modified | Reactivate test clicks through the dialog; asserts spruce accent + gating |

## Dependencies / config / schema
None.

## Decisions
- Scope (user-approved): gate A-06 Accept, A-06 Reject, A-02 Deactivate medicine, A-02 Reactivate
  medicine (for symmetry), A-01 Reactivate doctor. Reuse the shared `ConfirmDialog`.
- Intent mapping: destructive/irreversible → danger (Reject payment, Deactivate medicine); the rest
  → default spruce (Accept payment, Reactivate medicine, Reactivate doctor).
- Confirm-button labels kept distinct from the row buttons (e.g. row "Deactivate" vs dialog
  "Deactivate medicine"; row "Accept" vs dialog "Accept payment") so tests/users disambiguate.
- LEFT UNGATED (deliberate, documented): A-03 alerts resend (explicit "quick action" by design;
  A-04 is the confirmed path); patient Booking "Confirm booking" + "Submit payment reference"
  (primary CTAs, low risk); doctor "Save availability" (reversible, server-guarded); logout; video
  leave (only a post-session button; in-call leave is Daily's own iframe control).

## Notable findings
- Verified `appointment/service.js:adminDecision`: Accept → confirmed + booking-confirmation email +
  analytics; Reject → cancelled (reason "payment not received") + email. `LEGAL` table makes
  `cancelled` terminal and `confirmed`→only→`cancelled`, so BOTH decisions are irreversible — the
  strongest case for a confirm gate.
- Prescription submit is already gated, but via a bespoke inline panel rather than `ConfirmDialog`
  (has an immutability acknowledgement) — left as-is; a future consistency migration, not a gap.

## Verification
- `npm --prefix client test -- --run AdminReview AdminMedicines AdminDoctors`: 16/16.
- `npm --prefix client test -- --run`: full suite **151/151** passing — no regressions.
- `npm run lint`: no errors in any touched file (the repo's pre-existing 13-error baseline is
  unchanged; none in AdminReview/AdminMedicines/AdminDoctors/ConfirmDialog).
- Visual check in the running app: DONE. The :3000 app is a prod build serving `client/dist`, so it
  had to be rebuilt (`npm run build`) + baseline-reseeded first (see note below). Then verified all
  five gates live as admin: Accept (spruce) + Reject (danger) payment open a confirm and leave the
  row pending; Deactivate medicine (danger) opens a confirm; Deactivate doctor (danger) → confirm
  fired end-to-end (status → Deactivated); Reactivate doctor (spruce) → confirm fired end-to-end
  (status → Active, baseline restored). All accents/intents render correctly.

  NOTE: an early visual attempt hit the STALE prod build (pre-rebuild), so an ungated "Accept" click
  ran the OLD code and accepted the pending payment. Recovered by re-running the baseline seed
  (`node prisma/scripts/seed-baseline.js`, full wipe+reseed) — restored the pending payment and reset
  all test data. Final DB state = baseline (verified: doctor Active, payment pending).

## Risk / rollback
Presentation/interaction-only — adds a confirm step before existing mutations; no API/schema change.
Revert by restoring the three admin view files (+ their tests).

## Doc-impact (tracked — to apply at END, after commit + approval)
doc 06 §192 currently lists confirm-gated actions as "cancellations (P-10), doctor cancel (D-06),
admin deactivation (A-01), and the A-05 platform-settings save." Should be extended to include
A-06 Accept/Reject payment, A-02 medicine deactivate/reactivate, and A-01 doctor reactivate.
"Look"-only change → doc 06 only. Pending approval.

## Open items / next session
- Commit (pending approval). Apply the doc 06 §192 update after commit + approval.
- Optional future: migrate the prescription-submit inline confirm to `ConfirmDialog`.

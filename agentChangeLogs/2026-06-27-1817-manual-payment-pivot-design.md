# 2026-06-27-1817 — manual-payment-pivot-design

**Status:** Partial (code implemented + green; spec 00–15 sync pending user approval)
**Goal:** Brainstorm + design the phase-1 pivot to a fully-manual offline payment flow (delete all in-app payment + refund code; admin-verified bank-transfer booking).
**Skill(s) used:** superpowers:brainstorming (user opted in)
**Ticket / issue:** None
**Branch:** main (no code changes yet; design + changelog only)
**Commits / PR:** ~30 commits on `main` (not pushed): design `c140a68`; plans `04b0521`; backend `31a89dc`→`1baeb27`; frontend `df49d9d`→`730bb1d`; e2e `a5333e2`,`2d88b62`. Tag `pre-manual-payment-pivot` at `cba465e`.
**Last updated:** 2026-06-27-1925
**Tags:** #feature #refactor #design

## Summary
Worked through a client-driven scope pivot for phase 1: remove the PayFast gateway, the entire
refund subsystem, and the no-show/evaluation lifecycle, replacing them with a fully-manual flow —
patient books (slot locks → `pending`), pays offline via bank transfer, submits their bank
transaction reference, and the admin accepts (→ `confirmed`) or rejects (→ `cancelled`, slot freed).
Appointments auto-complete by time (`slotEnd + 5min`) via a slimmed cron; prescriptions stay gated on
`completed`. Daily.co drops to the free tier (no webhook). Wrote the approved design doc; no code yet.

## Context / why
Client no longer wants in-app payments for phase 1; bank transfer + manual admin verification is
preferred, and refunds are removed entirely (money handled offline). This also resolves an earlier
blocker discovered this session: Daily.co webhooks (which drove no-show/refund logic) require a paid
plan — removing no-show tracking removes that dependency.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-27-manual-payment-pivot-design.md` | Created | Approved design for the manual-payment pivot (scope, data model, state machine, flows, cron, testing, doc-impact) |
| `docs/superpowers/plans/2026-06-27-manual-payment-pivot-backend.md` | Created | Plan 1 of 2 — backend TDD implementation plan (15 tasks: tag/ADR, schema migration, 4-state machine, lock+fee, /pay reference, admin accept/reject, cancel, prescription gate, slim cron, notifications, deletions, e2e) |
| `docs/superpowers/plans/2026-06-27-manual-payment-pivot-frontend.md` | Created | Plan 2 of 2 — frontend TDD plan (11 tasks: backend UI-support, booking confirm-no-redirect, patient payment-instructions screen, pending card, cancel modal, admin records cleanup, admin review queue + accept/reject, editable bank settings, gateway-return removal, green sweep) — doc 06 conformance enforced |
| `agentChangeLogs/2026-06-27-1817-manual-payment-pivot-design.md` | Created | This session changelog |
| `agentChangeLogs/index.md` | Modified | Added this session's index line |
| `.env.daily` | Created (earlier this session) | Git-ignored dedicated env for the (blocked) live Daily Tier-2 test |
| `.gitignore` | Modified (earlier this session) | Ignore `.env.daily` so the Daily API key cannot be committed |
| `prisma/schema.prisma` (+ migration) | Modified | 4-state enum; +paymentReference/paymentSubmittedAt + Settings bank fields; dropped Payment/PaymentStatus/RefundStatus, join cols, disputed, lockExpiresAt, fallbackFee*; NotificationType enum reworked |
| `server/src/modules/{appointment,admin,notification,prescription,video}/*`, `workers/index.js`, `routes.js`, `config/{env,constants}` | Modified | manual-payment flow, admin accept/reject, time-based completion, slim cron, prescription gate; deleted payment/refund/no-show/Daily-webhook code |
| `server/src/modules/payment/*`, `server/src/integrations/payment/*`, `server/scripts/register-daily-webhook.mjs`, `server/src/dev/devCheckout.js` | Deleted | PayFast gateway + refund + dev checkout removed |
| `client/src/modules/{booking,appointment,admin,doctor}/**` | Modified/Created | PaymentInstructions screen, AdminReview queue, bank settings, pending card, 4-state labels; removed gateway/refund/dispute UI |
| `prisma/scripts/seed-baseline.js`, `e2e/support/db.js`, `e2e/global-setup.js`, `playwright.config.js`, `e2e/tests/j*.spec.js` | Modified | seeds + e2e reworked for the 4-state manual model |
| `.env.example`, `.env.example.dev` | Modified | dropped PAYFAST_*/PAYMENT_PROVIDER/refund/no-show env |
| `<scratchpad>/ADR-manual-payment.md` | Created (by backend agent) | ADR draft — to be applied into doc 11 at the doc-sync step |

## Dependencies / config / schema
No schema migration applied yet. The DESIGN specifies (for the build phase): `AppointmentState` enum
→ `pending/confirmed/completed/cancelled`; add `paymentReference`/`paymentSubmittedAt`; drop
`Payment` model, `doctorJoinedAt`/`patientJoinedAt`, `disputed`, `lockExpiresAt`; bank-instruction
fields added to admin settings. Config to remove later: `PAYFAST_*`, `PAYMENT_PROVIDER`, `REFUND_*`,
`DAILY_WEBHOOK_SECRET`, `NO_SHOW_GRACE_MIN`.

## Decisions
- Lock slot on click (no auto-expiry; only a human frees it). No proof-of-payment image. Bank details
  from admin-editable settings. Patient submits their own bank transaction reference; admin matches.
- No refunds anywhere; all money offline. Patient + doctor + admin can cancel.
- Four states only; time-based auto-completion (`slotEnd + VIDEO_TOKEN_POST_MIN`). Drop
  `prescription_issued`. Daily on free tier (no webhook). Admin gets in-app alert + email on payment
  submission. New UI must conform to doc `06` design tokens/components (no new aesthetics).
- Approach A (minimal reuse of the existing lock/state spine) chosen over explicit new states or a
  payment-claim entity. Future real payments are a revive-and-adapt job (git tag + ADR insurance).

## Notable findings
- Daily.co webhooks require a PAID plan (`403 invalid-plan-type` on registration) — they were the
  load-bearing signal for no-show/refund logic; removing no-show removes the paid dependency.
- The no-show lifecycle was NOT only about refunds: `completed` is the prescription gate
  (`prescription/service.js:35`). Kept `completed`; only the refund side-effect and join-based
  detection are removed.
- The scheduler is in-process `node-cron` (no external infra/cost); the pivot deletes 2 of its 4 jobs.
- Review pass on both plans surfaced gaps now patched: (backend) missing deletions of `reconcileRefund`/`paymentFailed`/`reclaimSafety` integration tests + `doubleBooking`/`admin` test updates; `seed-baseline.js` rewrite (Task 16); explicit env/PAYFAST cleanup (Task 17); orphaned Settings fallback-fee columns (Task 18); `booking_confirmed` analytics moved to admin-accept. (frontend) `AdminRecordDetail.jsx` refund/dispute removal (F12); `DoctorToday.jsx` `canWriteRx` → `completed` only (F13); `Past.jsx`/dead-`appointmentStatus` verification (F14).

## Verification
Implemented via 3 sub-agents (backend lead, frontend lead, e2e/QA), each TDD with its own review cycle, then a controller-run consolidated e2e cycle.
- Server/integration: green (245 passed after backend agent; payment/refund/reconcile/payfast/Daily-webhook suites deleted).
- Client: green (143/144; the 1 failure is a pre-existing, untouched `PrescriptionBuilder` timing flake on this slow machine).
- e2e (Playwright): **17/17 pass** against the reworked manual-payment flow (book → reference → admin accept/reject → confirmed; cancel-no-refund; time-based completion via `/dev/worker/evaluate`; 4-state badges).
- No front/back integration bugs found in the consolidated cycle (as-built contracts relayed between agents held).
- Final integrated `npm test` re-run in progress at handoff.
- `npm run lint` is broken repo-wide (ESLint v9 vs legacy `.eslintrc.json`) — PRE-EXISTING; only 2 pre-existing errors, none from these changes.

## Risk / rollback
No runtime risk yet (docs + ignored env file only). The future implementation is a large deletion
across payment/refund/no-show; mitigations specified in the design: `git tag pre-manual-payment-pivot`
before deletion, ADRs marked superseded (not deleted), and test-first rewrite of the booking/video/
prescription/notification suites. Spec edits are tracked and applied only at the END with approval.

## Open items / next session
- Get user review of the design doc, then invoke superpowers:writing-plans for the implementation plan.
- Apply the §14 spec doc-impact updates only AFTER code is committed and with explicit approval.
- Resolve §16 minor items (pay-screen copy, `video-token` confirmed-only restriction, dev-DB row
  migration).
- Stop the still-running cloudflared tunnel (PID 37652) from the earlier Daily test if not needed.

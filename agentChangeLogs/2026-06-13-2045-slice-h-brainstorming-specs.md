# 2026-06-13-2045 — slice-h-brainstorming-specs

**Status:** Partial
**Goal:** Brainstorm Slice H (the final v1-completion slice) decomposed into independent sub-slices, producing one verified design spec per sub-slice, ahead of parallel plan-writing.
**Skill(s) used:** superpowers:brainstorming (user invoked /brainstorming)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** (in progress)
**Last updated:** 2026-06-13-2110
**Tags:** #feature #infra #spec

## Summary
Slice H ("everything left for v1") was flagged as too large for one design and decomposed, with the user, into 7 independent sub-slices: S1 PayFast adapter, S2 Daily.co adapter, S3 video consultation UI, S4 public surface (landing+legal), S5 email template copy, S6 launch foundation + hardening, S7 E2E QA + launch gate. Plan: brainstorm S1–S6 sequentially (one committed spec each), user reviews each, then dispatch parallel `writing-plans` agents once all six specs are approved; S7 last. S1 (PayFast Pakistan adapter) design is approved and being written to a spec doc.

## Context / why
Slices E/F/G are merged; Slice H concludes the v1 phase. Prior slice design docs forward-referenced "Slice H" as a catch-all bucket (real vendor adapters, analytics, landing, legal, email copy). The work spans multiple independent subsystems, so it was decomposed to enable independent specs + parallel planning.

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-13-2045-slice-h-brainstorming-specs.md` | Created | This session log |
| `agentChangeLogs/index.md` | Modified | Add this session's index line |
| `docs/superpowers/specs/2026-06-13-slice-h-s1-payfast-adapter-design.md` | Created | S1 PayFast Pakistan adapter design spec (brainstorming output) |
| `docs/superpowers/specs/2026-06-13-slice-h-s2-dailyco-adapter-design.md` | Created | S2 Daily.co adapter design spec (brainstorming output) |
| `docs/superpowers/specs/2026-06-13-slice-h-s3-video-consultation-ui-design.md` | Created | S3 video consultation UI design spec (brainstorming output) |
| `docs/superpowers/specs/2026-06-13-slice-h-s4-public-surface-design.md` | Created | S4 public surface (landing + legal) design spec (brainstorming output) |
| `docs/superpowers/specs/2026-06-13-slice-h-s5-email-template-copy-design.md` | Created | S5 email template copy design spec (brainstorming output, incl. all 8 drafts) |
| `docs/superpowers/specs/2026-06-13-slice-h-s6-launch-foundation-hardening-design.md` | Created | S6 launch foundation + hardening design spec (brainstorming output) |

## Dependencies / config / schema
Planned (specced, not yet built) for S1: env var rework — add `PAYFAST_SECURED_KEY`, `PAYFAST_MERCHANT_NAME`, `PAYFAST_STORE_ID`, `PAYFAST_MODE`; `PAYMENT_PROVIDER` enum adds `payfast`; retain `PAYFAST_PASSPHRASE` (dev-mock only); drop `PAYFAST_MERCHANT_KEY` (SA-only).

## Decisions
- Slice H decomposed into 7 independent sub-slices (analytics writer → S6 foundation; analytics emits folded into the feature slices that own each surface, so no cross-slice dependency).
- Vendor adapters split into S1 (PayFast) + S2 (Daily.co).
- **S1 gateway is PayFast *Pakistan* (payfast.pk / apps.net.pk)** — NOT PayFast South Africa, which the current docs/env vars wrongly assume. Researched the PK API (no merchant docs available); flagged all unverified assumptions.
- S1 confirmation = dual-channel (browser redirect + `CHECKOUT_URL` server callback), verify-by-recompute, funnel into the existing idempotent `confirmPaidAppointment`; manual-admin reconciliation as backstop.
- S1 refund + status-query degrade to operator-assisted manual-admin (new `manual_required` refund status; quiet single alert, no retry-spin); backend hooks built now (incl. an admin `record-refund` endpoint), admin UI deferred to S6.
- **S2 (Daily.co):** full research pass — API almost entirely confirmed from official docs. Adapter gains `verifyWebhook(req)` that verifies the HMAC (`X-Webhook-Timestamp` + `X-Webhook-Signature`, base64 HMAC-SHA256 over `ts + "." + rawBody`) AND normalizes the versioned envelope into `NormalizedVideoEvent`. Role mapped from the meeting token's `user_id` (`doctor`/`patient`, echoed back) — fixes the ADR-24-flagged `user_name` substring hack, deleted from prod. `createRoom` idempotent (GET-first); room `exp`+`eject_at_room_exp`. New `DAILY_WEBHOOK_SECRET`; register webhook with `retryType: exponential` (avoid circuit-breaker auto-disable). Raw-body capture on the webhook route; signed-string raw-vs-JSON.stringify validated against a live delivery (gated).
- **S3 (video UI):** visuals already mocked → behavior/wiring only (no visual companion). Discovered doc 13's "Daily SDK wrapper: Built" is overstated — `VideoRoom.jsx` is placeholder chrome with NO Daily SDK. Approved: render the live call with **Daily Prebuilt** (`createFrame`, themed) — Daily owns tiles/controls/reconnection/3G; app owns chrome + P-11. P-11 = lightweight get-ready screen, device check via Daily prejoin (no app getUserMedia; minor mockup deviation). One role-aware `VideoRoom` for P-12/D-04. D-02 full today's view + D-06 cancel modal wired. KPI #3 emits via a new client `lib/analytics/track.js` (owned by S3; S6 owns the server endpoint + AnalyticsEvent writer; S4 reuses the helper). `@daily-co/daily-js` lazy-chunked.
- **S4 (public surface):** landing = verbatim mockup port at `/`; doctor listing relocates `/` → `/browse`. Legal pages (`/legal/terms`, `/legal/privacy`) built with a structured DRAFT body + "pending legal review" banner; final lawyer copy is a pre-launch gate (consent checkbox already links to these paths). KPI #1 ownership split: S4 emits `landing_view` + `booking_started` (client, reusing S3's `track.js`); `booking_confirmed` → S6 server-side in `confirmPaidAppointment`.
- **S5 (email copy):** transport already built (Slice E) → copy only. Plain-text v1. Extract shared `email/templates.js` (`{subject, body(vars)}` + `formatPKR` + footer) consumed by both resend + console adapters (replaces the `key:value` debug dump). All 8 templates' copy drafted + embedded in the spec (English, calm voice; amounts paisa→rupees in the copy layer; null lines omitted). Placeholders flagged: support email + footer entity name.
- **S6 (foundation + hardening):** six infra items. Analytics: new `POST /api/analytics/events` (public, rate-limited, catalog-validated) + `analytics.record` writer + server-side `booking_confirmed` in `confirmPaidAppointment` (the S3/S4↔S6 seam; client `track.js` owned by S3). Error tracking: **Sentry SaaS, DSN-gated + mandatory PII scrubbing** (beforeSend, sendDefaultPii:false), wired alongside the existing audit bridge; `SENTRY_DSN` env (renames doc's `ERROR_TRACKING_DSN`). DB indexes: `AuditLog(targetRef)` + `Appointment(slotStart)`. Settings: boot-time idempotent `ensureSettings()` upsert (id=1). **Zod: standardize on v3 + make `shared` a workspace** (single hoisted copy; remove the errorHandler ZodError duck-typing — repo-wide blast radius, guarded by tests). Verified: root had hoisted zod@4.4.3 (shared isn't a workspace) vs server zod@3.25.76.

## Notable findings
- PayFast Pakistan is a different company from PayFast SA: token handshake (`GetAccessToken` → `PostTransaction`), Bearer-token auth, `md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID)` signature (no passphrase), amounts in **rupees** (we store paisa), hosts on `apps.net.pk`. The SA `MD5+passphrase+ITN-postback` model in our docs/code maps to almost nothing.
- **Programmatic refund API and status-query API are NOT confirmed to exist** for PayFast PK — likely manual/portal-only. This gates the F06.03 refund-retry and F04.03 reconciliation workers; hence the manual-admin degradation.
- Live drift: `env.js` validates only `PAYFAST_MERCHANT_ID` + `PAYFAST_PASSPHRASE`; doc 15 also promises `PAYFAST_MERCHANT_KEY` + `PAYFAST_MODE` (not in the Zod schema).

## Verification
Not verified (design/spec phase — no code changes yet).

## Risk / rollback
None yet (docs only). Spec-doc (00–15) updates are tracked and will be applied only at task end with user approval per governance.

## Execution phase (started 2026-06-13-2110)
All six design specs (S1–S6) written, committed, and user-approved. User set the execution workflow:
- **Standing-rule overrides (user-authorized for this work):** controller MAY create branches, commit, push, merge to main, and commit/edit the canonical 00–15 spec docs — all WITHOUT per-step approval. Constraint: every decision backed by credible sources.
- **Per-task loop, sequential S1→S6:** one Opus lead subagent per task writes its plan then implements via its OWN subagents on a dedicated branch, commits code + its plan (NOT changelog, NOT design specs, NOT 00–15). It reports changelog entries + required 00–15 edits to the controller. Controller records the changelog, reviews + commits the 00–15 edits, verifies suites green, pushes + merges to main, then re-reviews remaining plans (update only if learnings require).
- **STOP after S6 merged** — S7 (E2E QA + launch gate) is brainstormed collaboratively with the user, NOT auto-executed.
- Cross-slice build-order: S3 lands `lib/analytics/track.js` (reused by S4); S6 owns `/api/analytics/events` + writer + server-side `booking_confirmed`.

## S1 — PayFast Pakistan adapter (IMPLEMENTED + MERGED to main, merge `b987472`, 2026-06-13)

Lead Opus subagent wrote the plan (`docs/superpowers/plans/2026-06-13-slice-h-s1-payfast-adapter.md`) + implemented via its own TDD subagents on branch `feature/slice-h-s1-payfast` (9 commits `019d216`→`ee38355`). Controller verified + merged.

**Code files changed (subagent's report, captured here):**
- `prisma/schema.prisma` (M) — `RefundStatus` enum +`manual_required`; `prisma/migrations/20260613181905_slice_h_refund_manual_required/migration.sql` (C) — `ALTER TYPE ... ADD VALUE`.
- `server/src/config/env/env.js` (+`.test.js`) (M) — +`PAYFAST_SECURED_KEY`/`MERCHANT_NAME`/`STORE_ID`, `PAYFAST_MODE` (enum, default sandbox); `PAYMENT_PROVIDER` +`payfast`. `.env.example` (M) — PayFast block SA→PK, dropped `PAYFAST_MERCHANT_KEY`.
- `server/src/integrations/payment/payfast.js` (C) + `payfast.test.js` (C) — real PK adapter (token handshake checkout, verifyWebhook+verifyReturn, manual-degrade refund/queryPaymentStatus); `index.js` (M, typedef +verifyReturn/manual_required + 3-way selection); `payfast.mock.js`/`payfast.stub.js` (M, +verifyReturn).
- `server/src/modules/payment/{controller.js,index.js,service.js}` (M) + `controller.test.js` (C) + `test.js` (M) — verify-return route `POST /api/payments/verify-return`; `reconcileOne` unknown→one-time `payment.manual_review_required` audit; `refundInFull` manual note. `server/src/routes.js` (M) — mount paymentReturnRouter.
- `server/src/modules/appointment/{service.js,test.js}` (M) — `initiateRefund` manual_required branch (no retry, `payment.refund_manual_required` audit, `refund_delayed` once).
- `shared/schemas/admin/admin.js` (M) +`recordRefundSchema`; `server/src/modules/admin/{service.js,controller.js,index.js,test.js}` (M) — `recordManualRefund` (idempotent, audit `payment.manual_refund_recorded`, enqueue `refund_confirmation`), `POST /api/admin/payments/:appointmentId/record-refund`, +2 manual-intervention events in the F12 alert feed.
- `docs/superpowers/plans/2026-06-13-slice-h-s1-payfast-adapter.md` (C) — the plan.

**Decisions / findings:**
- `RefundStatus` is a Prisma enum → real schema change + migration (design §9 open item resolved). Prisma 6 runs `ADD VALUE` non-transactionally; `migrate status` clean.
- **Ratified judgment call:** subagent added `payment.refund_manual_required` to the F12 alert feed (beyond the spec's explicit `payment.manual_review_required`). Controller APPROVES — a refund needing manual settlement must be discoverable or the §5 record-refund hook has no trigger.
- `reconcileOne` "once" idempotency via an existing-audit-row check (no `Payment.meta` column) — avoids a 2nd migration; confirm/refund/fail paths unchanged.
- createCheckout browser handoff (GET vs auto-submit form-POST) unresolved → §8 #6 gate; current GET handoff is the single correction seam.
- **Constraint catch:** a Task-5 sub-subagent created a stray `agentChangeLogs/` file + edited `index.md` despite instructions; the lead reverted both (uncommitted, never in any branch commit). Controller confirmed no `agentChangeLogs/`/`docs/specification/`/`docs/superpowers/specs/` path is in any branch commit.
- Pre-existing (not introduced): `npm run lint` broken repo-wide (ESLint 9 vs legacy `.eslintrc.json`).

**Verification (controller-independent):** `npm test` → 36 files / **267 passed** (248→+19); `npm --workspace client test` → 30 files / **97 passed**; `prisma migrate status` → "up to date"; branch diff carries no forbidden paths. Merged `--no-ff` (`b987472`).

**Canon-doc sweep (controller-reviewed + committed):** a doc-sweep subagent applied surgical edits to **8 docs** (02 F12 alerts, 04 `RefundStatus`+`manual_required`, 05 two routes + 7 alert kinds, 07 §3 #9 merchant checklist, 11 **ADR-32**, 13 adapter→Built(PK), 14 PayFast SA→PK rewrite + `verifyReturn`/`manual_required`, 15 env rework); controller then hand-edited **03 + 08** (the flagged contradiction — PayFast PK has no refund/status API → manual path + manual-review surfacing). All version-bumped + footnoted. Reviewed in full and committed by the controller (per the authorized workflow; doc 00 change protocol followed).

## S2 — Daily.co video adapter (IMPLEMENTED + MERGED to main, merge `f6d3bd5`, 2026-06-14)

Lead Opus subagent: plan (`docs/superpowers/plans/2026-06-13-slice-h-s2-dailyco-adapter.md`) + implemented via 4 TDD subagents on branch `feature/slice-h-s2-daily` (9 commits `67ad9e6`→`a84d078`). Final whole-branch review APPROVED (0 critical/important). Controller verified + merged.

**Code files (subagent report, captured):**
- `server/src/integrations/video/daily.js` (C) + `daily.test.js` (C, 13 tests) — real adapter: idempotent `createRoom` (GET-reuse→POST private room w/ exp+eject_at_room_exp→400-race→GET), `issueToken` (`user_id=role` anchor, `is_owner`), `verifyWebhook` (constant-time base64 HMAC over `ts + "." + rawBody`; normalize versioned envelope → `NormalizedVideoEvent`; role from `payload.user_id`, `owner` fallback; tokenless/test-ping → null). Mirrors `payfast.js`.
- `video/index.js` (M) — selection `daily→dailyReal`; typedef +`verifyWebhook` + `createRoom` opts + `NormalizedVideoEvent`. `daily.stub.js` (M, verifyWebhook throws), `daily.mock.js` (M, dev verifyWebhook normalizes simulator shape — dev role-from-user_name lives here now) + `daily.mock.test.js` (M, +3).
- `modules/video/service.js` (M) — `recordJoinFromDailyEvent` takes normalized event; **ADR-24 `user_name` role-inference hack DELETED from prod**; first-join-wins kept. `controller.js` (M) — verify → `video.webhook_rejected` audit + 401 on bad sig; record normalized otherwise. `index.js` (M) — `/daily` route mounts `express.json({verify})` for `rawBody`. `test.js` (M).
- `server/src/index.js` (M) — **global JSON parser carve-out** for `/api/webhooks/daily` (express.json idempotency fix; controller-reviewed — scoped to that one path, PayFast webhook unaffected). `dev/devVideo.js` (M) — both dev record paths normalize via `verifyWebhook`. `config/env/env.js` (M) — +`DAILY_WEBHOOK_SECRET`. `server/scripts/register-daily-webhook.mjs` (C) — one-time ops helper (`retryType:exponential`). Plan doc (C).

**Decisions / findings:**
- Raw-body capture required carving the daily path out of the GLOBAL parser (express.json is idempotent → a second route parser's `verify` never runs). Controller reviewed `server/src/index.js`: scoped to `/api/webhooks/daily` only; verified by the 287-test suite incl. video.integration.
- `recordJoinFromDailyEvent` had 3 call sites (controller + 2 in devVideo) — all moved to normalized contract.
- `.left` timestamp + Daily test-ping-signing + `GET /rooms/:name` 404 shape are UNVERIFIED → live-delivery gate (doc 07). New error codes `VIDEO_ROOM_FAILED`/`VIDEO_TOKEN_FAILED` (502).
- Pre-existing (confirmed again, not introduced): `npm run lint` broken repo-wide (ESLint 9 vs `.eslintrc.json`).
- Minor (non-blocking): `daily.mock` `eventId` can be null vs typedef `string` (dev-only, never read).

**Verification (controller-independent):** `npm test` → 37 files / **287 passed** (267→+20); `npm --workspace client test` → 30 / **97 passed** (a first client run errored transiently under heavy machine load — re-run clean). No forbidden paths in branch diff. Merged `--no-ff` (`f6d3bd5`).

## S3 — Video consultation UI (IMPLEMENTED + MERGED to main, merge `1ea70ac`, 2026-06-14)

Lead Opus subagent: plan (`docs/superpowers/plans/2026-06-13-slice-h-s3-video-consultation-ui.md`) + implemented via TDD subagents on `feature/slice-h-s3-video-ui` (7 commits `414e374`→`394a4d3`). Controller verified + merged.

**Code files (subagent report, captured):**
- `client/src/lib/analytics/track.js` (C) + `.test.js` (C) — fire-and-forget `track(type, meta)` → `api.post('/analytics/events', {type,networkType,meta})` `.catch(()=>{})`. **S3-owned KPI seam reused by S4/S6.**
- `client/src/modules/video/useDailyCall.js` (C) + `.test.jsx` (C) — lazy `import('@daily-co/daily-js')`, themed `createFrame`+`join`, `joined-meeting`→`video_join_success`, cleanup/`destroy`.
- `client/src/modules/video/views/WaitingRoom/` (C, +test) — P-11 get-ready (`/video/:id/ready`), 10-min-gated Join → `/video/:id`. `views/VideoRoom/VideoRoom.jsx` (M, +test) — folds in `useDailyCall` on the real path (`joinSimUrl===null`), retains mock placeholder + dev sim, removed dead Mic/Cam. `video.routes.jsx` (M) — +ready route.
- `client/src/modules/appointment/views/Upcoming/` (M, +test) — P-08 Join → ready + `video_join_attempt`. `client/src/modules/doctor/views/DoctorToday/` (M, +test) — D-02 Join → ready + emit.
- `client/package.json` + `package-lock.json` (M) — `@daily-co/daily-js ^0.91.0` (lazy-chunked). Plan doc (C).

**Decisions / findings:**
- `apiClient` already prepends `/api` → `track.js` posts to `'/analytics/events'` (resolves to `POST /api/analytics/events`); spec prose §4 showing `/api/analytics/events` would double-prefix — clarification for docs 05/14.
- **D-02 (`DoctorToday`) was already substantially built** (today's list, 10-min Join gate, awaiting-Rx badge, write-Rx action, History, `DoctorCancelModal` wired) — S3's delta was only the ready-route redirect + emit. The S3 spec overstated D-02 as net-new (doc 13 understated as-built). Reconcile doc 13.
- `video_join_success` fires only on real Daily `joined-meeting` (not the mock/CI path), matching design. P-11 uses `PatientLayout` for both roles (doctor-specific layout = follow-up, out of scope).
- **Node engine:** `@daily-co/daily-js@0.91.0` wants Node ≥22.14.0; build env is 22.12.0 — warning only (install/tests/build all pass); flag for CI/deploy Node pinning (doc 07/10 follow-up).
- Test-harness fixes (test-file-only): `vi.hoisted` for the Daily mock factory; `api.post.mockResolvedValue(undefined)` for mock-mode — production code unchanged.

**Verification (controller-independent):** `npm --workspace client test` → 33 files / **112 passed** (97→+15); `npm test` → **287 passed** (server untouched by S3); `npm --workspace client run build` → success, `daily-esm-*.js` (260 kB) is a SEPARATE chunk (main bundle not bloated). No forbidden paths. Merged `--no-ff` (`1ea70ac`).

## S4 — Public surface (landing + legal) (IMPLEMENTED + MERGED to main, merge `a94ccce`, 2026-06-14)

Lead Opus subagent: plan (`docs/superpowers/plans/2026-06-13-slice-h-s4-public-surface.md`) + 5 TDD subagents on `feature/slice-h-s4-public` (6 commits `f3c1b2a`→`d99c223`). Controller verified + merged.

**Code files (subagent report, captured):**
- `client/src/modules/marketing/views/Landing/` (C: Landing.jsx + .css + .test.jsx) + `marketing.routes.jsx` (C) — P-01 verbatim port at `/`; `landing_view` emit; logged-in-patient `/`→`/browse` redirect.
- `client/src/modules/legal/` (C) — `LegalPage` component + `Terms.jsx`/`Privacy.jsx` (structured DRAFT + "pending legal review" banner) + `legal.routes.jsx` (public `/legal/terms`,`/legal/privacy`) + test.
- Routing relocation: `doctor.routes.jsx` (M, listing `/`→`/browse`) + `doctor.routes.test.jsx` (C); `routes.jsx` (M, aggregate marketing+legal); `PatientLayout` (M, Browse→/browse); `auth/Login` + `SignUp` (M, `DASHBOARD.patient`→/browse) + Login.test (M); `Upcoming.jsx` + `PaymentReturn.jsx` (M, stray `<Link to="/">` listing CTAs → /browse).
- `client/src/modules/booking/useBooking.js` (M) + `Booking.test.jsx` (M) — `booking_started` emit on slot-lock success (reuses S3's `track.js`).
- Plan doc (C). **No server changes.** `track.js` REUSED (not recreated — controller-verified untouched).

**Decisions / findings:**
- Hero secondary CTA: mockup's "How it works" anchor → relabeled "Create your account" → `/signup` (spec §2 mandates Browse+Signup CTAs); the anchor stays reachable via topnav. One intentional hero deviation.
- Logged-in **patient** `/`→`/browse` redirect (acquisition page not shown to authed patients); doctor/admin see landing as a safe fallback. `RoleRoute` mismatch fallback now lands on `/` (landing) — behaviorally safe; flagged.
- Featured-doctors grid is static placeholder (per spec "static for v1").
- **Lint situation clarified:** `npm run lint` reports 12 pre-existing `react-hooks/purity` errors in untouched files — **confirmed identical on `main`** (NOT introduced by S4; differs from the earlier "ESLint 9 vs .eslintrc" report — config evidently runs now). S4's own files lint clean. Repo-wide follow-up (S6/hardening or separate).

**Verification (controller-independent):** `npm --workspace client test` → 36 files / **123 passed** (112→+11); `npm test` → **287** (server untouched); `npm --workspace client run build` → success (351 modules). No forbidden paths; `track.js` untouched. Merged `--no-ff` (`a94ccce`).

**Pre-launch gate (carried):** final lawyer-reviewed ToS + Privacy copy must replace the DRAFT before go-live (signup consent links to these pages).

## Open items / next session
- Then S2 → S3 → S4 → S5 → S6 via the same loop.
- Tracked spec-doc impact per slice lives in each spec's §"Spec-doc impact" table (applied at each slice's merge, by the controller).
- After S6 merged: STOP, brainstorm S7 with user.

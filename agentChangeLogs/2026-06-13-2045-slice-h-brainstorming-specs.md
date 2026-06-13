# 2026-06-13-2045 — slice-h-brainstorming-specs

**Status:** Partial
**Goal:** Brainstorm Slice H (the final v1-completion slice) decomposed into independent sub-slices, producing one verified design spec per sub-slice, ahead of parallel plan-writing.
**Skill(s) used:** superpowers:brainstorming (user invoked /brainstorming)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** (in progress)
**Last updated:** 2026-06-13-2045
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

## Open items / next session
- Write + commit S1 spec; user review.
- Brainstorm S2–S6 specs (one each), then dispatch parallel `writing-plans` agents.
- S7 (E2E QA + launch gate) brainstormed/executed last.
- Tracked spec-doc impact for S1: docs 04, 05, 07, 11 (new ADR), 13, 14, 15.

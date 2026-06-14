# Dermestha v1 — Release Recommendation (Slice H · S7 launch gate)

| Field | Value |
| --- | --- |
| Date | 2026-06-14 |
| Author | S7 E2E QA + launch gate (controller-run) |
| Scope | v1 (F01–F16); doc 09 §7 exit criteria + §9 release-recommendation format |
| Verdict | **CONDITIONAL GO** |

> Point-in-time report. Source-of-truth statuses live in doc 13; enumerated cases in doc 12. This consolidates what was executed, what was fixed, and the remaining launch gates.

---

## 1. Test execution summary

| Layer | Result |
| --- | --- |
| Unit + integration (Vitest) | **320 server+shared / 45 files; 123 client / 36 files — all passing** (incl. 3 new real-Postgres integration tests S7 added) |
| Automated E2E — Playwright (mock adapters), the 6 Critical journeys J1–J6 | **11 / 11 passing** (`npm run test:e2e`) |
| Assisted-manual browser pass (non-Critical / UI) | P-01 landing, /legal/terms, /legal/privacy, P-02 browse, login + role-routing, admin A-01/A-03/A-04/A-05 — **all render + function** |
| Live-vendor — Daily.co REST (real API) | `createRoom` + idempotent reuse + `issueToken` + room-URL/auth — **validated against the live account** |
| Live-vendor — PayFast | mock signed-IPN path (Tier 1) only; real UAT requires a merchant account (gate §4) |
| Production build | `npm --workspace client run build` — success; `@daily-co/daily-js` lazy-chunked |
| Migrations | `prisma migrate status` — up to date; single `zod@3` copy |

## 2. Critical-journey coverage (J1–J6, E2E-proven on mock adapters)

| Journey | Covers | Status |
| --- | --- | --- |
| J1 book → pay → confirm (+ fail-path) | F03, F04, invariants #2/#6/#7 | ✅ |
| J2 video lifecycle (join → in_progress/completed/no-show) | F05, ADR-12/25 | ✅ |
| J3 prescription issue → patient view + PDF | F08, invariants #3/#4/#5 | ✅ |
| J4 cancel/refund (≥2h refunded / <2h no-refund) | F06, invariant #10 | ✅ |
| J5 auth/role gates (admin block, DA3 loop, 404-no-leak) | F15, doc 08 §A01 | ✅ |
| J6 admin onboarding → forced password change | F10, F15 | ✅ |

## 3. Defects found + resolved in S7 (the gate's value)

Driving the real browser against a real DB surfaced a **class** of pre-existing crash that 312 mocked-Prisma unit tests could not see — *deleting a `slot_locked` appointment that a `Payment` row FK-references* (`Payment.appointment` is `ON DELETE RESTRICT`). All resolved (TDD, proven by 3 new integration tests), under a coherent policy:

| ID | Sev | Site | Fix |
| --- | --- | --- | --- |
| BUG-1 | High | `payment.failed` + `reconcileOne`-failed | `markFailedAndReleaseLock` — mark Payment `failed` + force-expire lock; no delete, no migration (slot frees via lazy-reclaim, ADR-23) |
| FIX-A | High (latent) | `createWithReclaim` | Reclaim only `failed`/absent blockers; a **pending** payment → `SLOT_TAKEN 409`, left for reconciliation / `manual_review_required` (never silently delete possibly-paid money) |
| FIX-B | High (latent) | `refundInFull` (edge #6a) | `deleteMany`→`updateMany` (force-expire lock); refund + records preserved |
| BUG-2 | Low (dev-only) | mock `recordJoin` | raw `fetch('/dev/video/join')` (was `/api/...` 404); prod unaffected |

Code search confirms this is now the **last** instance of that crash class. **No open Critical/High defects remain.**

## 4. doc 09 §7 exit-criteria status

| Criterion | Status |
| --- | --- |
| All Critical/High TCs Verified | ✅ (E2E J1–J6 + integration + manual; doc 12 annotated) |
| No open Critical/High bugs | ✅ (the 3 High found were fixed + re-verified) |
| 10 data-integrity invariants exercised | ✅ (existing suite + J1/J3/J4 + the 3 new integration tests) |
| Vitest suite green on the RC | ✅ (320 / 123) |
| Audit log records booking/cancel/webhook/settings | ✅ (verified incl. via the A-03 feed) |
| **UAT sign-off (client + doctor rep)** | ⛔ **PENDING — human gate** |

## 5. Pre-launch gates (must close before production; not S7-closable)

1. **PayFast Pakistan merchant verification (doc 07 §3).** No public sandbox; needs a merchant account: UAT `MERCHANT_ID`/`SECURED_KEY`/`MERCHANT_NAME` + which product (Hosted-Checkout md5 vs REST HMAC-SHA256) + test instrument/OTP mobile. Research confirmed our **md5 signature is correct**, but flagged: `STORE_ID` unfounded; refund/status REST APIs **do** exist (revisit the manual-degradation if the merchant product exposes them); S1 adapter missing `CUSTOMER_MOBILE_NO`/`EMAIL`/`VERSION`/`ORDER_DATE`; IPN payload still unverified.
2. **Daily.co webhook-HMAC live smoke (doc 07 §10).** REST adapter **validated live** this session; remaining: register the webhook (`server/scripts/register-daily-webhook.mjs`, `retryType:exponential`) against a public URL, capture `DAILY_WEBHOOK_SECRET`, and confirm a real `participant.joined` delivery passes `verifyWebhook` (validates the signed-string raw-body byte format).
3. **F16 legal content** — replace the DRAFT ToS/Privacy with final lawyer-reviewed copy (the signup consent links to them).
4. **Email** — set the real support address + footer entity (S5 placeholders); verified Resend domain + `RESEND_FROM` for patient inboxes.
5. **Sentry** — set `SENTRY_DSN` (+ confirm `beforeSend` PII scrubbing) if enabling external error tracking.
6. **Runtime** — pin prod Node **≥ 22.14** (`@daily-co/daily-js` + `@sentry/node` engines).
7. **Settings + indexes** — automatic via `ensureSettings()` at boot + the S6 migration (no manual step).
8. **Dev-DB hygiene** — production starts from a clean DB; the local dev DB's accumulated test doctors / stale alerts are dev-only clutter, not shipped.

## 6. Defect metrics (this cycle)

- Critical/High found: **3** (BUG-1, FIX-A, FIX-B) — all **Closed (Verified)**.
- Low/dev-only: **1** (BUG-2) — Closed.
- Open at cycle end: **0** Critical/High.
- Invariant coverage: **10/10** with ≥1 Verified test.
- Regression failures: **0**.

## 7. Recommendation

**CONDITIONAL GO.** Every machine-verifiable exit criterion is met — the critical journeys are E2E-green, the full suite passes, the 10 invariants are covered, the Daily REST integration is validated live, and the three High-severity money-path defects the gate surfaced are fixed and re-verified. Promotion to production is gated only on the **human/vendor items in §5** — chiefly **UAT sign-off**, the **PayFast merchant credentials**, and the **Daily webhook-HMAC live smoke** — none of which are closable without external access. No engineering blockers remain.

---

## Appendix A — Journey ↔ canon traceability matrix

| Journey step | Screen (doc 06) | Route (doc 05) | Feature/rule (doc 02) | Invariant (doc 04) | Verified by |
| --- | --- | --- | --- | --- | --- |
| Lock slot | P-06 | `POST /api/appointments/lock` | F03.03 Slot-Lock | #1, #7 | J1, integration |
| Pay → confirm | P-07 | `POST /api/webhooks/payfast` (+`/payments/verify-return`) | F04 | #2, #6 | J1, `paymentFailed.integration` |
| Failed payment | P-07 | webhook `payment.failed` | F04 / F03.03 | — | J1 fail-path, `paymentFailed.integration` |
| Join video | P-11→P-12 / D-04 | `GET …/video-token`, `POST /api/webhooks/daily` | F05 | — | J2, live-Daily REST |
| Issue Rx | D-05 → P-13 | `POST …/prescriptions` | F08 | #3,#4,#5 | J3 |
| Cancel/refund | P-08/P-10 | `POST …/cancel` | F06 | #10 | J4, `reconcileRefund.integration` |
| Role gates | — | `requireRole`, `/admin/*` | F15 | — | J5 |
| Onboard doctor | A-01 → D-01 | `POST /api/doctors` | F10, F15 | #8 | J6 |

*(Traceability pass found no missing canon cross-references requiring patching — the existing ID cross-refs walk each journey end-to-end.)*

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-14 | Initial release recommendation | Slice H · S7 launch gate |

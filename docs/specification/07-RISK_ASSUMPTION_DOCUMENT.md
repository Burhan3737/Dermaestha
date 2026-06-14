# 07 — Risk & Assumption Document

| Field            | Value                                                             |
| ---------------- | ----------------------------------------------------------------- |
| Document ID      | `07-RISK_ASSUMPTION_DOCUMENT`                                     |
| Status           | Canonical                                                         |
| Version          | 1.6                                                               |
| Last updated     | 2026-06-14                                                        |
| Sources absorbed | `docs/product/PRD.md §5.2, §2.3, §3; server/ + client/ TODO scan` |
| Related docs     | 01, 02, 08                                                        |

---

## Index

1. [Purpose](#purpose)
2. [Assumptions](#1-assumptions)
3. [Known risks](#2-known-risks)
4. [Open questions](#3-open-questions)
5. [Revision footer](#revision-footer)

---

## Purpose

This document captures the business and technical assumptions the team is operating under, reproduces every risk row from PRD §5.2 faithfully, and surfaces open questions that remain unresolved going into v1. All assumptions are grounded in the PRD; none are invented.

---

## 1. Assumptions

The following assumptions are in force for v1. Each is grounded in an explicit PRD statement or in a deliberate deferral that implies acceptance of the current state.

- **3–5 PMC-verified dermatologists are sourced by the client before launch (Week-1 deliverable).** The PRD lists "Doctor onboarding bottleneck — launch needs 3–5 derms" as a High-likelihood, Critical-impact risk and marks doctor profiles and availability as a client deliverable due Week 1 (PRD §5.2; §5.1 M4). Without this, there is no launch.

- **The client runs payment-aggregator merchant KYC independently, in parallel with dev.** The PRD flags merchant KYC delay (1–2 weeks) as a High-likelihood, High-impact blocker on M2 and explicitly records it as a Week-1 client deliverable (PRD §5.2). The build assumes KYC completes before the M2 deadline.

- **Email-only reach is sufficient to validate the launch hypothesis.** SMS and WhatsApp notifications are explicitly deferred to v1.1 as non-goals (PRD §2.3). The team assumes the six email trigger types (booking confirmation, reminders, prescription-ready, refund, cancellation apology) are sufficient for early adopters.

- **Indefinite PII and prescription retention is acceptable for v1.** There is no in-app patient-account deletion or data-export flow. The PRD acknowledges this as a privacy and PR risk and documents it as a v1.1 deliverable (PRD §2.3; §3.6; §5.2 row "Indefinite patient PII / prescription retention"). The assumption is that the Privacy Policy text (M4 deliverable) adequately informs patients.

- **DRAP/PMDC regulatory compliance is out of scope; the platform is an MVP for hypothesis validation, not a regulated medical service.** This is explicitly deferred in §2.3 and flagged as a Medium-likelihood, High-legal-impact risk in §5.2. No regulatory approval or compliance layer is in scope.

- **A single-service deploy with no redundancy is acceptable at ~100 consultations/week.** The PRD states single-service deploy meets v1 scale economics (under USD 50/month constraint per §3.2) and notes the platform auto-restarts on crash (PRD §5.2 row "Single-service deploy = no redundancy").

- **Out-of-band initial-password sharing for doctors is acceptable.** The PRD explicitly designs DA1 around the admin setting a doctor's initial password and sharing it out-of-band (WhatsApp, phone, or in person). This is acceptable for 3–5 launch doctors; doctor email-token password setup is deferred (PRD §2.3; DA1; DA5).

- **Doctor clinical judgment is the sole safeguard on prescriptions; no platform-side clinical validation is applied.** Prescription free-text fields allow flexibility but no clinical validation logic exists in v1. The PRD acknowledges this as an accepted MVP risk (PRD §5.2 row "Prescription format has no clinical validation").

- **Net-of-gateway-fee refunds are acceptable to patients.** The refund amount equals the amount paid minus the payment-gateway transaction fee. The PRD explicitly surfaces this to the patient in the cancellation modal and the refund-status view (PRD §3.3 #5; §4.1 policy #5; §5.2 row "Net-of-gateway-fee refund causes patient pushback").

- **No email-verification step at patient sign-up is acceptable.** Patients self-report their email address; duplicate-email uniqueness is enforced but actual email ownership is not verified in v1. Email verification is deferred (PRD §2.2 P2).

- **ToS/Privacy Policy versioning and re-prompt-on-update is deferred to v1.1.** v1 records a single acceptance timestamp at sign-up only. The assumption is that this is legally and operationally sufficient for the MVP period (PRD §2.3).

- **No WCAG conformance target is set for v1.** The PRD acknowledges accessibility risk for a low-tech-literacy, mobile-first audience and defers a WCAG 2.1 AA baseline to a fast-follow after launch hypothesis validation (PRD §2.3).

---

## 2. Known risks

### 2.1 PRD §5.2 risk table (reproduced faithfully)

Every row below is taken verbatim from PRD §5.2.

| Risk                                                                               | Likelihood | Impact                                                                         | Mitigation                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment-aggregator merchant KYC delay (1–2 weeks)                                  | High       | High — blocks M2 milestone                                                     | Client starts merchant application immediately in parallel with dev; documented as Week 1 client deliverable                                                                                                                                                                    |
| Video quality poor on 3G                                                           | Medium     | High — breaks core promise                                                     | Explicit mobile-network testing in M2; vendor selected partly for known 3G performance                                                                                                                                                                                          |
| Doctor onboarding bottleneck — launch needs 3–5 derms                              | High       | Critical — no launch without doctors                                           | Client deliverable due Week 1: doctor profiles + availability for 3–5 derms                                                                                                                                                                                                     |
| DRAP/PMDC regulatory exposure                                                      | Medium     | High legally                                                                   | Explicitly out of scope per §2.3; flagged as deferred risk; not mitigated in v1                                                                                                                                                                                                 |
| Indefinite patient PII / prescription retention with no in-app deletion path in v1 | Medium     | Medium — privacy and PR risk; potential pressure from a data-protection regime | Documented as a v1.1 deliverable; client informed during onboarding via the Privacy Policy text                                                                                                                                                                                 |
| Prescription format has no clinical validation                                     | Medium     | Medium — patient safety                                                        | Free-text fields allow flexibility but no validation; doctor's clinical judgment is the sole safeguard in v1. Acceptable as MVP risk.                                                                                                                                           |
| Refund delay (5–7 days) causes patient complaints                                  | Medium     | Low                                                                            | Patient dashboard shows transparent refund status + gateway reference. Wallet (v1.2+) would mitigate.                                                                                                                                                                           |
| Net-of-gateway-fee refund causes patient pushback                                  | Low        | Low                                                                            | Cancellation modal and refund-status view explicitly explain the deduction. Reviewed post-launch; switchable to gross refund without architectural change if complaint rate is meaningful.                                                                                      |
| Video provider outage during peak hours                                            | Low        | High when it occurs                                                            | Status banner + reschedule offer. Known gap — no fallback video provider in v1.                                                                                                                                                                                                 |
| Payment webhook delivery failures                                                  | Medium     | High if undetected                                                             | Hourly reconciliation query against the aggregator; admin alerted on mismatch                                                                                                                                                                                                   |
| Single-service deploy = no redundancy                                              | Medium     | Medium                                                                         | Acceptable at v1 scale (~100/week); platform auto-restarts on crash; revisited when traffic justifies                                                                                                                                                                           |
| Admin password / bootstrap compromise                                              | Low        | Critical                                                                       | Bootstrap script is run once on first deploy; admin password is rotated immediately after bootstrap; admin account does not have an email-based password reset path in v1                                                                                                       |
| Out-of-band initial-password sharing for doctors leaks credentials                 | Medium     | Medium                                                                         | Forced password change on first login (DA3) limits exposure window to the doctor's first session                                                                                                                                                                                |
| Video free-tier minutes insufficient at launch scale                               | Medium     | Medium — breaks the "<USD 50/month" §3.2 constraint                            | ~100 consults/week × 30 min × 2 participants ≈ 26k participant-min/month likely exceeds a 10k-minute free tier. Architecture must confirm the chosen provider's billing unit (room-minutes vs participant-minutes) and paid-tier cost against the §3.2 budget before selection. |

### 2.2 Code TODO/FIXME scan

A grep was run across `server/` and `client/src/` (all `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` files, excluding `node_modules`). **No TODO or FIXME markers were found in the application source code.** One match existed inside `server/node_modules/zod/` (a third-party library file), which is not application code. No additional risk rows were added from the scan.

### 2.3 Slice G as-built risks (not from PRD §5.2)

These rows surfaced during the Slice G (admin-panel) build and are recorded here to keep §2.1 a faithful verbatim reproduction of PRD §5.2.

| Risk                                                                                       | Likelihood | Impact     | Mitigation                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dual-Zod version skew — root `zod@4` (used by `shared/` schemas) vs server `zod@3`         | Low        | Medium     | **RESOLVED (Slice H · S6).** The repo now resolves a single `zod@3` copy: `shared/` is a workspace declaring `zod ^3.23.0`, and a root `overrides.zod ^3.23.0` collapses the only `zod@4` (a transitive dep via `eslint-plugin-react-hooks → zod-validation-error`). `instanceof ZodError` is reliable across the boundary, so the `errorHandler` duck-typing was removed (ADR-37).                      |
| DA5 admin password-reset does not invalidate live sessions                                 | Low        | Medium     | `mustChangePassword` is read from the session snapshot taken at login, so a concurrently-logged-in doctor keeps access until session TTL (default 7 days); deleting the session row is the manual remedy. Accepted at 3–5 doctor scale.                                                |
| Unhandled-exception audit rows have no sampling / rate-limit (ADR-30)                       | Low        | Low–Medium | A hot-failing route can flood `audit_log` and the F12 alert feed. No mitigation in v1; acceptable at current traffic. Revisit with per-source sampling if a route fails in a tight loop.                                                                                              |
| `AuditLog.targetRef` and `Appointment.slotStart` are unindexed                             | Low        | Medium     | **RESOLVED (Slice H · S6).** Both indexes are now live via migration `20260613213051_slice_h_s6_indexes` (`@@index([targetRef])`, `@@index([slotStart])`); see doc 04 §4c/§4d.                                                                                                          |

---

## 3. Open questions

The following items are unresolved decisions or ambiguities that affect v1 risk posture.

1. **Video provider billing unit.** The PRD explicitly flags that architecture must confirm whether the chosen video provider bills by room-minutes or participant-minutes before vendor selection, because ~26k participant-minutes/month at v1 scale likely exceeds a 10k-minute free tier (PRD §5.2 last row). This must be resolved before M2 to avoid a cost overrun against the USD 50/month infrastructure constraint (§3.2).

2. **Fallback transaction-fee model defaults.** The admin-configurable fallback fee percentage and fixed PKR amount (used when the aggregator does not report a per-transaction fee) have no specified default in the PRD beyond "a documented default" (PRD §2.2 A6). The exact defaults must be agreed and documented before M2 to ensure accurate refund-amount calculations from day one.

3. **Admin bootstrap credential rotation procedure.** The PRD states the admin password is rotated immediately after the bootstrap script runs (PRD §5.2 row "Admin password / bootstrap compromise"), but the rotation procedure and documentation location (deploy runbook) are deferred to the architecture/operations phase. This must be defined before launch to avoid the critical-impact risk remaining open.

4. **v1.1 PII deletion timeline commitment.** The PRD records indefinite PII/prescription retention as a Medium-likelihood, Medium-impact risk and defers the deletion/data-export flow to v1.1 (PRD §2.3; §3.6). If the v1.1 timeline is not committed before launch, the risk posture is materially higher — depending on which data-protection regime Pakistan's regulatory environment evolves toward.

5. **ToS/Privacy re-prompt deferred to v1.1.** Any update to the Terms of Service or Privacy Policy text between v1 launch and the v1.1 re-prompt feature means existing users will not be notified of policy changes. The team should agree on an acceptable interim policy-change procedure (e.g., email notification outside the app) covering the gap period (PRD §2.3; §5.1 v1.1 items).

6. **WCAG accessibility gap acknowledgment.** The PRD defers WCAG 2.1 AA conformance to a fast-follow and acknowledges the risk for a low-tech-literacy, mobile-first audience (PRD §2.3). Before launch, the team should agree on a minimum accessibility standard for the core booking/payment/join flow so the gap period has a defined boundary.

7. **`Settings(id=1)` production bootstrap gap.** ~~The settings singleton row must exist before the first settings access (F14), but it is created only by `prisma/seed.js`.~~ **RESOLVED (Slice H · S6).** `ensureSettings()` runs at server boot (`server/src/index.js`) and idempotently upserts `Settings(id=1)` (schema defaults fill the row), so a fresh DB serves GET/PUT `/api/admin/settings` without a manual deploy step. See doc 10.

8. **Audit-tab filter UI deferred (Slice G).** The server `/api/admin/audit` endpoint accepts filters (`eventType` / `actorType` / `userId` / `email` / date) and the records endpoint accepts a state filter, but the A-03 / A-04 admin UI renders pagination only for the audit tab and no state-filter control. Decide: build the filter UI in a follow-up, or accept the filter-less feed as a v1 limitation.

9. **PayFast Pakistan merchant-verification checklist (launch gate).** The PayFast-PK external contract in the real `payfast` adapter (doc 14 §2) is **researched, not vendor-confirmed**. The S7 research pass (Slice H) sharpened several items below, but go-live still requires a **merchant account — there is no public sandbox**, so the adapter must NOT go live (`PAYMENT_PROVIDER=payfast` against the live host) until the merchant/KYC owner confirms each open item against PayFast's official integration spec:
   1. **Signature algorithm + field list & order** — `md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID)` is now **CONFIRMED correct** by the S7 research (previously LOW confidence).
   2. **`CHECKOUT_URL` IPN contract** — **still unverified**: is it a server-to-server callback? exact payload, content-type, source IP range to allowlist, and the success/failure status field name + values.
   3. **Refund REST API** — research confirms a refund REST API **does exist** (contrary to the ADR-32 "no refund API" assumption). Revisit the manual-degradation path (`refundStatus='manual_required'` recorded via the admin route) once the specific merchant product is known — if the product exposes the refund API, automate it instead of the out-of-band fallback.
   4. **Status-query REST API** — research confirms a payment-status REST API **does exist**. Same revisit: if the merchant product exposes it, reconciliation can query status rather than only surfacing stuck payments for manual review (`payment.manual_review_required`).
   5. **Sandbox + production credentials** — `MERCHANT_ID`, `SECURED_KEY`, `MERCHANT_NAME` for both environments. **`STORE_ID` is unfounded** by the S7 research (no evidence PayFast-PK uses it) — confirm whether it is actually required before relying on it. Separately, the S1 adapter is **missing fields the init payload likely needs** — `CUSTOMER_MOBILE_NO`, `CUSTOMER_EMAIL_ADDRESS`, `VERSION`, `ORDER_DATE` — to confirm and add.
   6. **Confirmed base URLs / paths** — assumed `ipguat.apps.net.pk` (sandbox) / `ipg1.apps.net.pk` (live), base path `/Ecommerce/api/Transaction/`.
   7. **Amount unit & precision on the wire** — assumed rupees-decimal (e.g. `"2500.00"`); the adapter converts paisa↔rupees at the boundary.
   8. **Browser handoff mechanism** — GET redirect vs an app-served auto-submit form-POST page.

10. **Daily.co live-delivery launch gate.** The real `daily` video adapter (doc 14 §1/§3) is wired. The S7 cycle (Slice H) **validated the REST adapter live against the real Daily account** — `createRoom` + idempotent room reuse + `issueToken` + the room URL/auth — so items 2 and the createRoom/auth aspects below are now confirmed. The **one remaining item is the webhook-HMAC live-delivery smoke**: register the webhook and confirm a real `participant.joined` delivery passes `verifyWebhook`. The adapter must NOT go live (`VIDEO_PROVIDER=daily`) until that smoke passes:
    1. **HMAC signed-string serialization** — validate the `timestamp + "." + rawBody` signed string (raw received bytes vs `JSON.stringify`) against a real Daily webhook delivery — the one byte-sensitive risk. _(Still open — needs a real delivery.)_
    2. **`GET /v1/rooms/:name` 404 shape** — **validated live (S7):** the not-found response was confirmed, so idempotent room reuse / create-race branches resolve correctly.
    3. **Room lifecycle after `exp`** — `createRoom({ notAfterIso })` (slot-bounded, `eject_at_room_exp`) was created/validated live; confirm the at/after-`exp` eject behaviour during the live webhook smoke.
    4. **Test-ping signature** — confirm whether the create-time `{ "test": "test" }` verification ping is signed. _(Part of the webhook smoke.)_
    5. **`.left` timestamp field** — confirm the participant-left payload's timestamp field (the adapter currently falls back to the envelope `event_ts`). _(Part of the webhook smoke.)_
    6. **Webhook registration** — register the webhook with `retryType: 'exponential'` (the default `circuit-breaker` DISABLES the webhook after 3 consecutive failures) via `server/scripts/register-daily-webhook.mjs`, capture `DAILY_WEBHOOK_SECRET`, and provide `DAILY_API_KEY` / `DAILY_DOMAIN`, then drive a real `participant.joined` through `verifyWebhook`. _(The remaining launch gate.)_

11. **Node ≥22.14.0 required by `@daily-co/daily-js@0.91.0` (Slice H · S3).** The video-UI dependency `@daily-co/daily-js@^0.91.0` (client) declares an engines floor of Node ≥22.14.0; the build environment was on 22.12.0 (an install-time engine **warning** only, not a failure). Follow-up: pin the CI and deploy (Docker) Node version to ≥22.14.0 so the engine constraint is satisfied and never escalates. (The runtime image is currently `node:22-slim` — doc 10 §Dockerfile — which tracks the latest 22.x and already satisfies the floor; the action is to make the pin explicit/verified rather than rely on the tag's current resolution.)

---

## Revision footer

| Date       | Change           | Why                                                           |
| ---------- | ---------------- | ------------------------------------------------------------- |
| 2026-06-01 | Initial creation | Faithful re-presentation of PRD.md §5.2/§2.3 + code TODO scan |
| 2026-06-13 | Added §2.3 Slice G as-built risks (Zod skew, DA5 session invalidation, unsampled exception audit, unindexed audit/slot columns) + open questions 7–8 (settings bootstrap gap, audit-tab filter UI deferral) | Slice G as-built sweep |
| 2026-06-13 | Added open question 9 — the PayFast Pakistan merchant-verification checklist as a launch gate (signature, CHECKOUT_URL IPN, refund/status APIs, credentials, base URLs, amount unit, browser handoff) | Slice H · S1 (PayFast Pakistan adapter; ADR-32) |
| 2026-06-14 | Added open question 10 — the Daily.co live-delivery launch gate (HMAC signed-string raw-body validation, `GET /v1/rooms/:name` 404 shape, room lifecycle after `exp`, test-ping signing, `.left` timestamp field, webhook `retryType=exponential` registration + `DAILY_API_KEY`/`DAILY_DOMAIN`/`DAILY_WEBHOOK_SECRET`) | Slice H · S2 (Daily.co video adapter; ADR-33) |
| 2026-06-14 | Added open question 11 — `@daily-co/daily-js@0.91.0` requires Node ≥22.14.0 (build env was 22.12.0, install-time warning only); pin CI/deploy Node accordingly | Slice H · S3 (video consultation UI; ADR-34) |
| 2026-06-14 | Marked three follow-ups RESOLVED: §2.3 Zod skew (single zod@3 via `shared` workspace + root override; duck-typing removed — ADR-37), §2.3 unindexed `targetRef`/`slotStart` (migration `20260613213051_slice_h_s6_indexes`), §3 open question 7 settings bootstrap (`ensureSettings()` at boot) | Slice H · S6 (launch foundation + hardening) |
| 2026-06-14 | Sharpened open question 9 (PayFast) with the S7 research — md5 signature CONFIRMED correct; `STORE_ID` unfounded; refund + status REST APIs DO exist (revisit manual-degradation per merchant product); S1 adapter missing `CUSTOMER_MOBILE_NO`/`CUSTOMER_EMAIL_ADDRESS`/`VERSION`/`ORDER_DATE`; IPN payload still unverified; needs a merchant account (no public sandbox). Updated open question 10 (Daily) — REST adapter (createRoom/idempotency/issueToken/URL/auth) validated live; remaining item is the webhook-HMAC live-delivery smoke | Slice H · S7 (E2E QA + launch gate) |

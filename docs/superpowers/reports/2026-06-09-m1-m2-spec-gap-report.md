# M1/M2 — Code-vs-Spec Gap Report

| Field | Value |
|---|---|
| Date | 2026-06-09 |
| Scope | Built surface only: F01, F02, F03, F04, F05, F06, F09, F15 |
| Method | Green-baseline run + 6 parallel per-feature audits, **every finding re-read in source by the controller** (verification-before-completion) |
| Companion | `agentChangeLogs/2026-06-09-1857-m1-m2-spec-gap-analysis.md` |

---

> **Update 2026-06-09 (first-pass fixes applied, TDD):** **G1, G2, G5, H1** fixed in code and **O2** applied to doc 05; suite now **180 green** (139 server + 41 client, +4 new tests). Still open/catalogued: **G3, G4, H2–H4** (fidelity) and the entire **Part 2** build-new menu. See the session changelog for the red→green evidence.

## Verdict — "Are M1 and M2 complete?"

**The four slices (A→D) that *were planned* for M1+M2 are complete, merged, and green** — 176 tests pass (135 server incl. 6 DB-backed integration suites + 41 client), verified this session. **But the spec's full definition of M1/M2 is broader than what those slices scoped.** Each slice deliberately deferred spec'd items (reconciliation worker, reminders, real vendor adapters, admin doctor onboarding). So:

- ✅ **No Critical correctness bugs** in the built money/state core. The non-negotiable invariants (no-double-booking, atomic booking+payment, fee/refund snapshots, idempotency keys, single state-machine writer, slot-stays-blocked on late cancel) are implemented faithfully and tested.
- ⚠️ **1 Major + 4 Minor fidelity gaps** where built code diverges from the spec it implements (Part 1).
- 📋 **A sizeable deferred-features menu** — the real reason "M1/M2 complete" doesn't fully hold against the spec (Part 2).

**Bottom line:** the app *works as built and the built data flows are correct*; what's missing is spec'd capability that was never started, plus a handful of small divergences.

---

## Verification basis

| Check | Result |
|---|---|
| `npx prisma migrate status` | "Database schema is up to date!" (3 migrations, DB `localhost:5433`) |
| `npm test` (server/shared) | **135 passed / 33 files** (incl. booking, video, discovery, auth, app, doubleBooking integration) |
| `npm --workspace client test` | **41 passed / 17 files** |
| Per-gap source re-read | Every `file:line` below opened and confirmed by the controller, not taken from agent reports |

> Env fix required to run: `.env` `DATABASE_URL` was pointing at a dead Docker bridge IP (`172.18.0.2:5432`); the DB container is healthy on `localhost:5433`. Updated locally (git-ignored). This is the durable fix the Slice-D changelog recommended.

---

## Part 1 — Fidelity gaps (built code diverges from spec) → the "fix" list

| ID | Sev | Feature | Gap (observed vs expected) | Evidence | Spec ref |
|----|-----|---------|----------------------------|----------|----------|
| **G1** | **Major** | F06 Refund | **Refund failures are silent and non-retried.** On a refund-provider error, `safeRefund` logs + writes a `payment.refund_failed` audit row but **never sets `payments.refundStatus`** (it's updated only on the success path), so the dashboard refund-status view (F06.01 / edge #31) can't show a failed/retrying refund. No retry/backoff loop exists — `REFUND_MAX_ATTEMPTS` / `REFUND_BACKOFF_BASE_SEC` are defined with **zero consumers**. Spec edge #30 promises auto-retry-with-backoff + admin-alert-on-exhaustion. | `refund.service.js:35-38` (status set only on success), `refundSideEffects.js:7-21`, `constants.js:19-20` (unused) | 02 F06.03 / edge #30-#31; 05 §4 (retry/backoff note) |
| **G2** | Minor | F02/F09 | **`GET /doctors/:id/slots` has no active-doctor check.** Returns `200` (slots/`[]`) for an inactive or non-existent doctor, while `GET /doctors/:id` returns `404` — an existence-leak parity inconsistency. More importantly, since `booking.service` re-validates against the same unguarded `generateSlots`, a **deactivated doctor's slots would remain bookable** — invariant #9 ("deactivation blocks new bookings") is not enforced in code. Latent today (no in-app deactivation exists yet). | `availability.service.js:35-37` (no active filter), `routes/doctors.js:24` | 02 F02.02 / F10.03 (#9); 05 §4 |
| **G3** | Minor | F05 | **Doctor "today" list is not date-bounded.** Default doctor scope returns *all* upcoming `confirmed`/`in_progress` appointments, not just today's, whereas F05.02 specifies "today's appointments" (history under a separate tab). The D-02 client view may filter, but the server scope is broader than spec. | `appointment.service.js:52-55` | 02 F05.02 |
| **G4** | Minor | F01 | **Forgot-password is response-safe but not timing-equalized.** The response is byte-identical (`{ok:true}`) for known/unknown emails (spec-compliant), but a *known* email does token-gen + DB write + `await emailProvider.send` while an *unknown* email returns immediately — a measurable timing oracle. Login, by contrast, runs a dummy-hash to equalize timing. Spec F01.03 strictly requires only response parity, so this is hardening, not a strict violation. | `auth.service.js:67-78`, `auth.controller.js:57-78` | 02 F01.03; 08 (enumeration) |
| **G5** | Minor | F09 | **Availability-replace guard misses the lazy expired-lock exclusion.** `replaceWeeklyBlocks` counts an expired-but-unswept `slot_locked` as an active booking (its query lacks the `NOT {slot_locked, lockExpiresAt<now}` clause that `generateSlots` has), so a stale lock on a future slot could spuriously trigger `BLOCK_HAS_BOOKINGS`. Edge-only; normally cleared by rebooking. | `availability.service.js:91-98` vs `:64` | 02 F09.01 edge #14; ADR-23 |

### Observations (not gaps — no action required, noted for awareness)
- **`feeAtBooking` source wording:** code snapshots the *charged amount* at confirmation (`payment.service.js:74`), which equals `Doctor.fee` read at intent (`:27`). Spec wording says "snapshot Doctor.fee at confirmation." Behaviourally equivalent and arguably safer (always equals what the patient paid); worth a one-line spec-wording reconciliation, not a code change.
- **`karachiWeekday` uses a hard-coded `+05:00` offset** rather than `date-fns-tz` (`tz.js`). Correct (Pakistan has no DST) but is exactly the brittleness ADR-21 set out to avoid. The actual wall-time→UTC conversion correctly uses `fromZonedTime`.
- **`nextAvailableSlot` is N×14 sequential queries per listing page** (`doctor.service.js:26-35`) — a perf concern against the "≤2s on 3G" rule at scale, not a correctness issue.
- **Daily webhook (`POST /api/webhooks/daily`) is unsigned** (PayFast's IS signature-verified). Deferred per ADR-24 (real Daily adapter pending) — fine for the dev mock, must be closed before production.
- **Confirmation email is `await`ed before the webhook `200`** (`payment.service.js:84-96`) — a *hung* (not failed) email could delay the PayFast ack. Best-effort/failure is handled; latency isn't.
- **Bad-signature webhook audit row carries no `targetRef`/`providerRef`** (`webhook.controller.js`), weakening admin correlation in the future alert feed.

---

## Part 2 — Spec'd-but-unbuilt inventory → the "implement" menu

These are spec'd data flows with **no implementation** (or dev-only mocks). They are the real delta behind "M1/M2 not fully complete." Deliberately deferred per the slice decisions — *choose which to build*.

| Item | What's missing | Milestone | Why it matters |
|------|----------------|-----------|----------------|
| **F04.03 Reconciliation worker** | Hourly PayFast re-query of unconfirmed payments; edge-#6a refund-to-original-payer | **M2** | **Highest value.** Today there is **no fallback if a `payment.success` IPN is never delivered** — a paid-at-gateway / never-confirmed-locally appointment would silently expire. `workers/index.js` only registers the evaluation cron; `listUnconfirmed` has zero callers. |
| **F06 Refund retry/backoff worker** | Exponential-backoff retry + admin-alert-on-exhaustion + patient delay email | **M2** | Pairs with G1. Constants exist; no worker. |
| **F07 Reminders / notification worker** | 24h + 1h reminders, retry/backoff, reminder invalidation | M1→M4 | No notification service or scheduler exists; only post-commit best-effort sends. |
| **Real PayFast adapter** | Concrete network adapter (currently `payfast.mock` / throwing stub) | M2 | Mock drives a real signed-IPN loop; the vendor REST call is the only missing seam. |
| **Real Daily.co adapter + webhook signature** | Concrete room/token REST + client media SDK + signed webhook | M2 | `daily.mock` simulates; real media + signature pending (ADR-24). |
| **Real Resend email send** | Replace `console.dev` logging adapter with Resend (`resend.stub` throws 501) | M1→M4 | All 6 email triggers currently log to console only. |
| **F15 DA1 — admin doctor onboarding** | `POST /api/doctors` (create User+Doctor, `mustChangePassword=true`) | M1/M4 | **No in-app way to create a doctor** — doctors come only from `prisma/seed.js`. Consequently the DA3 forced-change gate is never triggered (seed sets `mustChangePassword:false`). |
| **F15 DA5 — admin doctor password reset** | `POST /api/doctors/:id/reset-password` | M4 | No admin-mediated reset; route absent. |
| **Analytics / KPI events** | Landing→booking + video-join-by-network telemetry | M2→M4 | No event emission anywhere. |
| **F08 Prescriptions (M3)** | Prescription + medicine services/routes, client PDF, `completed→prescription_issued` | M3 | 0% — entire milestone. |
| **F10–F14 Admin panel (M4)** | Doctor mgmt, medicine catalogue, alert feed, records/audit search, settings | M4 | 0% — `audit.service.record()` exists but no query API/alert feed surfaces it. |
| **P-01 Landing + F16 Legal (M4)** | Public landing page; `/legal/terms`, `/legal/privacy` | M4 | 0%. |

---

## Part 3 — Verified solid (what you don't need to worry about)

Confirmed correct by source re-read + green tests — listed so triage can skip them:

- **No double-booking (#1):** partial unique index `uniq_active_slot` present in `migration.sql:264-266`, `WHERE state IN (...)` matches `ACTIVE_APPOINTMENT_STATES` exactly; P2002 reclaim distinguishes expired-lock from a true race (`SLOT_TAKEN` 409).
- **Atomic booking+payment (#2):** single `$transaction` commits `confirmed` + payment success (`payment.service.js:69-81`); replay/late-failure guarded.
- **`feeAtBooking` snapshot (#6) + idempotent intent (#7):** fee frozen at confirmation; payment intent unique on `(patientUserId, slotStart)`.
- **Net-of-fee refund + idempotency (#5/#10):** reported gateway fee wins (incl. a reported `0`) else Settings fallback; `refundIdempotencyKey @unique`; refund floored at 0; cancel modal and dashboard share one quote.
- **Late-cancel slot stays blocked:** `cancelled_no_refund` ∈ active states + index WHERE-clause (`constants.js:32`, `migration.sql:266`).
- **Single state-machine writer:** `appointmentState.service.transition` is the only `state` writer; LEGAL map matches doc 05 §5; `completed→prescription_issued` correctly absent (M3).
- **No-show resolution (ADR-12) + hard guarantee (ADR-25):** doctor-absence precedence holds; no appointment stays `in_progress` past `slot_end+5m`.
- **Video token window (±10/+5 min), first-join-wins + event-timestamp.**
- **Auth core:** argon2id, SHA-256 single-use 1h reset tokens, login timing-equalized, DA3 gate + allowlist, `requireRole` on every authenticated route (server-side), session cookie `httpOnly`+`SameSite=Lax`+`Secure`-in-prod.
- **Discovery/availability:** active-only no-leak listing, 404-no-leak profile, read-time 30-min slot gen, Karachi→UTC direction + weekday 0=Sun, full-30-min-fit `BLOCK_HAS_BOOKINGS` guard.

---

## Recommended triage order (if/when you choose to act)

1. **G1 + F06 refund retry** (Major) — money-visible; failed refunds currently vanish from the UI.
2. **F04.03 reconciliation worker** (unbuilt) — the only safety net for a lost payment IPN.
3. **G2 active-doctor check** — close before any deactivation/admin feature ships.
4. **G3/G4/G5** — small, low-risk hardening.
5. Then choose from the Part 2 menu by milestone priority.

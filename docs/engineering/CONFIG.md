# Dermestha — Configuration & Tuning Constants

**Document type:** Pinned operational constants
**Companion to:** `docs/engineering/ARCHITECTURE.md` (§17). Resolves every value the PRD called "an architecture decision."
**Status:** v1 — implementation-ready

> Two tiers: **(A) Settings-tunable at runtime** live in the `settings` table (A6), no redeploy. **(B) Deploy-time constants** live in env (`.env.example`) or `server/src/config/constants.js`. Everything the PRD §3.6 *mandated be specified* is here with a concrete value — change by editing this file + the config, not by guessing in code.

---

## 1. Timing windows
| Constant | Value | Tier | Source |
|---|---|---|---|
| Slot-lock TTL | **10 min** | B | PRD §4.3 |
| Min booking lead | **60 min** (floor 30) | A (`minBookingLeadMinutes`) | PRD §4.x, edge filter |
| Slot granularity | **30 min** | B | D1 |
| No-show grace | slot-start **+15 min** | B | PRD §4.3 |
| Video token window | slot-start **−10 min** → slot-end **+5 min** | B | §3.4 |
| `in_progress` hard cutoff | slot-end **+5 min** (never later) | B | §3.4, §10 |
| Reminder offsets | **24 h** and **1 h** before slot | B | P4 |
| Missing-Rx alert | `completed` + **12 h** → A3 alert (`awaiting_prescription`) | B | PRD §4.3 |
| Password-reset token | **1 h**, single-use | B | P2 |

## 2. Rate limits & lockout (§3.6 — mandated to be specified)
| Surface | Limit | On breach |
|---|---|---|
| Login | **5 failures / account / 15 min** → lockout | `429 ACCOUNT_LOCKED`; audit-logged; sustained → A3 |
| Login (per IP) | 20 / 15 min | `429 RATE_LIMITED` |
| Sign-up | 5 / IP / hour | `429 RATE_LIMITED` |
| Forgot-password | 5 / account / hour | enumeration-safe `200`; counted silently |
| Payment-intent | 10 / patient / hour | `429 RATE_LIMITED` (protects PayFast quota, beyond #7 idempotency) |

- **Lockout duration:** 15 min rolling. Threshold breaches → `audit_log` (`event_type=login_lockout`); sustained abuse surfaced to A3.
- Library: `express-rate-limit` (memory store acceptable single-instance; see §5).

## 3. Worker cadence (`node-cron`, in-process)
| Worker | Schedule | Notes |
|---|---|---|
| Reconciliation | **hourly** (`0 * * * *`) | PayFast unconfirmed-payments query, last 24 h (edge #6/#6a) |
| Notification | **every minute** (`* * * * *`) | dispatch due emails; **re-check appointment state immediately before send**; suppress reminders if no longer `confirmed`/`in_progress` |
| Appointment-evaluation | **every minute** (`* * * * *`) | `confirmed→in_progress` at slot-start; resolve `completed`/no-show in grace window; never strand `in_progress` past slot-end+5m |

**Single-instance assumption (v1):** workers run in the one app process; **no leader election** (deliberate — "don't over-engineer"). If the app ever scales horizontally, gate workers behind a Postgres advisory lock or move them to scheduled tasks — this row is the one place that changes. Memory-backed rate-limit also assumes single instance.

## 4. Refund retry (#10, edge #30)
- Strategy: **exponential backoff**, base 30 s, factor 2, **max 5 attempts** (≈30 s→8 min).
- Each attempt reuses the per-appointment `refundIdempotencyKey` (one settlement guaranteed).
- On exhaustion: `refundStatus=failed` + **A3 admin alert**. No in-app manual retry; admin acts in the gateway dashboard.

## 5. Auth & crypto
| Constant | Value | Source |
|---|---|---|
| Password hash | **argon2id** (bcrypt acceptable) | §7 |
| argon2 params | memoryCost 19456 KiB, timeCost 2, parallelism 1 (tune to host) | OWASP baseline |
| Session cookie | **HTTP-only, Secure, SameSite=Lax** | §3.6 |
| Session store | `connect-pg-simple`, `createTableIfMissing: false` (Prisma owns `session` DDL) | §7 |
| Session TTL | 7 days rolling | — |

## 6. Money & locale
- Currency: **PKR**, stored/transmitted as **integer paisa**. Display ÷100 with thousands separators.
- Timezone: store UTC (`timestamptz`); render **Asia/Karachi** (no DST).
- Fallback gateway-fee model (when PayFast reports none, policy #5): `fallbackFeePctBps` (basis points) + `fallbackFeeFixed` (paisa), both in `settings` (A6).

## 7. Migration caveats (read before first `prisma migrate`)
1. **Pin `prisma@6.x`** (e.g. `prisma@6.19.x` + `@prisma/client@6.x`). Prisma 7 removed in-schema `datasource.url` in favour of `prisma.config.ts` + driver adapters — a heavier setup this v1 does not need. Validated clean on 6.19.3.
2. **No-double-booking is a hand-added partial index.** After `prisma migrate dev --name init`, edit the generated `migration.sql` and append the `uniq_active_slot` index from `prisma/schema.prisma`'s header. Prisma's DSL cannot express the `WHERE state IN (...)` clause; do not skip this — it is invariant #1.
3. `dosage_forms` is a Postgres text[]; confirm the target host supports array columns (RDS/Aurora/Railway PG all do).

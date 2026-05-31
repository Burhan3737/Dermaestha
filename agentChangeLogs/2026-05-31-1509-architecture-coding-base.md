# Changelog — architecture-coding-base — 2026-05-31

## Files created
| File | Change |
|---|---|
| `prisma/schema.prisma` | NEW. Full Prisma schema from ARCHITECTURE.md §5: 6 enums (Role, DoctorStatus, AppointmentState[10 states], PaymentStatus, RefundStatus, AuditActorType) + 12 models (User, Doctor, AvailabilityBlock, Appointment, Payment, Prescription, PrescriptionItem, Medicine, AuditLog, AnalyticsEvent, Settings, Session). Declarable uniques for invariants #7/#8/#10. Header comment documents the hand-added `uniq_active_slot` partial index (#1). `prisma validate` passed on 6.19.3. |
| `docs/API.md` | NEW. API conventions (error envelope, HTTP status map, pagination, money/time), endpoint inventory across 10 surface groups (auth, doctors, availability/slots, booking/appointments, payments/webhooks, prescriptions, medicines, admin, analytics, legal/SPA), the §4.3 state-machine transition table, and two verification checklists (requirement-ID coverage; §3.3 invariant→mechanism). |
| `docs/CONFIG.md` | NEW. Pinned constants: timing windows, rate limits/lockout thresholds (§3.6-mandated), worker cron cadence + single-instance assumption, refund backoff, argon2/session-cookie params, money/locale, migration caveats (Prisma 6 pin, partial-index step, text[] support). |
| `docs/INTEGRATIONS.md` | NEW. JSDoc `@typedef` contracts for PaymentProvider/VideoProvider/EmailProvider; PayFast IPN signature + payload shapes; Daily room/token/participant-event shapes; Resend 6-email merge-var catalog; analytics event catalog; shared error envelope note. |
| `.env.example` | NEW. 12-factor contract: core, DATABASE_URL (with Prisma 6 pin note), SESSION_SECRET, PAYFAST_*, DAILY_*, RESEND_*, ERROR_TRACKING_DSN, plus tunable defaults mirroring CONFIG.md. |
| `agentSessions/architecture-coding-base-2026-05-31.md` | NEW. Session report. |
| `agentSessions/index.md` | NEW. Index with this session's one-liner. |
| `changelogs/architecture-coding-base-2026-05-31.md` | NEW. This file. |

## Files modified
| File | Change |
|---|---|
| `docs/ARCHITECTURE.md` | Surgical edits only: (1) header — added "Contract-level specs" pointer line + bumped Status to v1.1; (2) §5 critical-constraint #1 — appended one sentence on the Prisma partial-index migration caveat; (3) appended new **§17 Companion Specifications** index table. No other prose touched. |

## Verification run
- `npx prisma@6 validate --schema prisma/schema.prisma` with dummy `DATABASE_URL` → "The schema is valid 🚀".

---

## Session narrative (merged from the former `agentSessions/` report)

### Goal
Make `docs/ARCHITECTURE.md` ready to start coding from — fill the contract-level gaps a developer would otherwise have to invent. Skill used: `system-design` (opted in); output shape = companion spec docs; depth = specs + first runnable artifacts.

### Situation
- Repo is **greenfield** (zero app code; docs + 25 mockups + `tokens.css`/`components.css`).
- PRD owns the requirements (full state machine §4.3, the 10 invariants §3.3, 24 screens, DA1–DA6).
- ARCHITECTURE.md was correct but **high-altitude** (~75–80% coding-ready). Gap = resolution, not correctness.
- 7 gaps closed: API endpoint inventory · runnable Prisma schema · state-machine transition table · pinned config constants · integration payload contracts · API conventions (error envelope/status map) · analytics + email catalogs.

### Key findings / decisions
1. **Pin `prisma@6.x`.** Prisma 7.8 removed in-schema `datasource.url` (wants `prisma.config.ts` + driver adapters) — heavier than v1 needs. Schema validated clean on 6.19.3.
2. **No-double-booking (#1) needs a hand-edited migration.** Prisma's DSL can't express the partial `WHERE state IN (...)` unique index; documented in schema header, CONFIG.md §7, and ARCHITECTURE.md §5.
3. **`slot_available` is not a stored enum value** — availability = absence of a row; first persisted state is `slot_locked`.

### Open items / next session
- Scaffold `package.json` (workspaces), Vite client, Express server, same-origin serving, Dockerfile — out of this session's scope.
- Confirm PayFast IPN signature algorithm + Daily token claims against live sandbox docs during M2.
- **CLAUDE.md note for human:** suggested adding a "Project Context → Server" entry once scaffolding lands (Prisma 6 pin; partial-index migration step). Pending review.

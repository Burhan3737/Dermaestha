# PROJECT_RULES.md

Coding rules for Dermestha. Load before writing any code. Values (timing windows, thresholds) live in `docs/engineering/CONFIG.md` — reference them, don't hard-code them.

---

## Language & Style

- JavaScript ES modules end-to-end. No TypeScript, no `tsconfig`, no transpile step.
- Type safety via `// @ts-check` + JSDoc + root `jsconfig.json`. Apply it to invariant modules: state machine, slot-lock, refund math.
- Validation with Zod at every API boundary (shared schemas in `shared/schemas/`). No ad-hoc manual validation in controllers.

## Layering

- Strict `model → controller → service`. All business logic lives in `server/src/services/`.
- Controllers are thin: validate (Zod) → call service → return response. No logic in controllers.
- Workers call services; they never reimplement logic.
- The appointment state machine is defined in **one place only**: `server/src/services/appointmentState.service.js`. No other file defines allowed transitions.

## Data Conventions

- All timestamps `timestamptz`, stored in **UTC**. UI converts to `Asia/Karachi`; never store localised times.
- Money as **integer PKR** (paisa-safe). Never floats or decimals for monetary values at any layer.
- Never denormalize the doctor's name onto appointments. Reference by FK, join at read time. `[ARCH §5 #3]`
- `doctors.pmc_number` and `doctors.email` are **immutable post-create**. No service or migration may update them. `[ARCH §5 #8]`

## Critical Invariants (non-negotiable)

1. **No double-booking** — partial unique index `uniq_active_slot` on `(doctor_id, slot_start)` with a `WHERE state IN (...)` clause. **Prisma's DSL cannot express this `WHERE` clause** — hand-edit the generated migration SQL every time. See `prisma/schema.prisma` header and `CONFIG.md §7`. `[ARCH §5 #1]`
2. **Atomic booking + payment** — appointment update + payment write in one `prisma.$transaction`. Never split. `[ARCH §5 #2]`
3. **Idempotency keys** — `payments.intent_key` UNIQUE `(patient_user_id, slot_start)`; `payments.refund_idempotency_key` UNIQUE. Set at creation, never changed. `[ARCH §5 #7/#10]`
4. **Snapshots at write time** — `appointments.fee_at_booking`, `prescription_items.price`, `prescriptions.doctor_snapshot`, `prescriptions.patient_id_snapshot`. Never updated retroactively. `[ARCH §5 #3/#5/#6/P8]`
5. **Prescription immutability** — no `UPDATE`/`DELETE` route, service method, or Prisma call for prescriptions. Corrections insert a new linked row. `[ARCH §5 #4]`
6. **Audit log append-only** — all writes via `audit.service.record(...)` only. No update or delete path exists anywhere. `[ARCH §8]`

## Auth & Authorization

- Sessions via `express-session` + `connect-pg-simple`. **Not JWT.**
- Cookie: HTTP-only, Secure, SameSite=Lax. Passwords hashed with argon2.
- **Single authz boundary: `requireRole(...)` middleware at the router level.** Never duplicated in handlers. Never enforced only on the frontend. `[ARCH §7, §11]`
- Role-routing after login is UX only; the server is the enforcement point.

## Integration Adapters

- Each vendor has a JSDoc `@typedef` contract (`PaymentProvider`, `VideoProvider`, `EmailProvider`). Services call only the interface — never a vendor SDK directly. `[ARCH §8]`
- Swapping a vendor = new adapter file + config switch. Zero changes outside the adapter.
- Gateway-reported fee drives refund amount, cancellation estimate, and dashboard display identically. When no fee is reported, fall back to Settings A6 parameters. `[ARCH §12]`

## Workers

- All three workers call the service layer. Audit actor type is `system`.
- Notification worker: re-check appointment state immediately before dispatch. Suppress sends for appointments no longer `confirmed`/`in_progress`.
- Appointment-evaluation: **never leave an appointment `in_progress` past `slot_end + 5min`** under any circumstance. Missing participant data → non-penalizing terminal state + admin alert. `[ARCH §10]`

## Frontend

- `tokens.css` CSS custom properties are the single theming source of truth. Components reference token roles (`var(--color-brand)`), never raw hex.
- No MUI/Material UI.
- Shared components (`client/src/components/`) defined once, composed everywhere. Variants via props → BEM modifier classes. Never redefine in a view.
- Views never re-implement navigation chrome; use the three layout wrappers.
- Prescription PDF rendered client-side behind a single `renderPrescriptionPdf(json)` boundary in `client/src/lib/`. The seam must stay isolated for the v1.2 server-side swap. `[ARCH §6]`
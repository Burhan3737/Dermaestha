# Slice F — Prescriptions (M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete M3 against the spec: a doctor issues an immutable, itemised, price-snapshotted prescription after a completed consultation (F08); the patient is emailed via the existing outbox, sees it in a new Past-appointments view, and downloads a client-rendered PDF; medicine catalogue read + admin CRUD routes back the builder (F11, backend only).

**Architecture:** New `prescription` and `medicine` server modules (feature-first, ADR-26). Submit runs one `$transaction`: create prescription + item snapshots → `transition(completed→prescription_issued)` (skipped for corrections) → in-tx `prescription_ready` enqueue. One migration adds `dedupe_key` to `notification_jobs` (unique widens to `(appointment_id, type, dedupe_key)`) so each prescription — including policy-#9 corrections — emails exactly once. Client: P-09 Past view, P-13 prescription view, D-05 builder, D-02 additions; PDF bytes are produced only in `client/src/lib/pdf/renderPrescriptionPdf.js` over lazily-imported pdf-lib.

**Tech Stack:** Node 20 ESM + Express, Prisma 6 (PostgreSQL), Vitest (unit: mocked Prisma in module-local `test.js`; integration: real DB in `server/src/test/`), Zod DTOs in `shared/schemas/`, React 19 + TanStack Query + react-router 6, pdf-lib (client, lazy).

**Spec:** `docs/superpowers/specs/2026-06-11-slice-f-prescriptions-design.md`

---

## Reality check (verified 2026-06-12 in source)

- `Prescription`, `PrescriptionItem`, `Medicine` models already exist in `prisma/schema.prisma` (snapshot semantics, `price Int?` = null → "not priced"). Seed has 3 demo medicines + 2 demo doctors (`dr.ayesha@dermestha.dev` / `Password123`, active).
- `NotificationType` already contains `prescription_ready`; `notification_jobs` unique is `@@unique([appointmentId, type])` — Task 1 relaxes it.
- `appointment/service.js` `LEGAL` has no `completed:` entry (line ~238); `listForRole` patient branch returns only `UPCOMING`; `getForRole` detail lacks `subjectAge`/`subjectRelation`/`patientName`.
- Client `DoctorToday.jsx` already has Today/History tabs (`tabs`/`tab`/`tab--active` CSS classes exist; `badge--warning` exists in `components.css`).
- Baseline: `npm test` → **169 passed** (server+shared), `npm --workspace client test` → **41 passed**.

**Execution preconditions:**
- DB container healthy; `.env` `DATABASE_URL` points at `localhost:5433`; DB is seeded (`npm run db:seed` is idempotent).
- **Branch:** creating a branch requires user approval (CLAUDE.md). At execution start, ask the user: branch `feature/slice-f` (recommended, matches prior slices) or work on `main`. Do not create a branch without their answer.

---

### Task 1: Outbox `dedupeKey` — migration + `enqueue` parameter

**Files:**
- Modify: `prisma/schema.prisma` (NotificationJob model)
- Modify: `server/src/modules/notification/service.js` (`enqueue`)
- Modify: `server/src/modules/notification/test.js`
- Created by tool: `prisma/migrations/<timestamp>_slice_f_outbox_dedupe_key/migration.sql`

- [ ] **Step 1: Update the existing enqueue tests + add the dedupeKey test.** In `server/src/modules/notification/test.js`, the `notification.enqueue` describe block has two tests asserting the upsert `where`. Update both to the new composite (default `dedupeKey: ''`), and add a third:

The first test's assertion becomes:

```js
    expect(prisma.notificationJob.upsert).toHaveBeenCalledWith({
      where: {
        appointmentId_type_dedupeKey: {
          appointmentId: 'a1',
          type: 'booking_confirmation',
          dedupeKey: '',
        },
      },
      update: {},
      create: {
        type: 'booking_confirmation',
        appointmentId: 'a1',
        recipientEmail: 'p@t.test',
        scheduledFor: NOW,
        vars: { patientName: 'P' },
        dedupeKey: '',
      },
    });
```

(The second test only asserts *which client* was called — no `where` change needed.) Append the new test inside the same describe:

```js
  it('a dedupeKey makes the same (appointment, type) enqueue-able again — per-prescription emails', async () => {
    prisma.notificationJob.upsert.mockResolvedValue({ id: 'n2' });
    await enqueue({
      type: 'prescription_ready',
      appointmentId: 'a1',
      recipientEmail: 'p@t.test',
      scheduledFor: NOW,
      dedupeKey: 'rx_1',
    });
    expect(prisma.notificationJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          appointmentId_type_dedupeKey: {
            appointmentId: 'a1',
            type: 'prescription_ready',
            dedupeKey: 'rx_1',
          },
        },
      }),
    );
  });
```

- [ ] **Step 2: Run to verify the changed tests fail**

Run: `npx vitest run server/src/modules/notification/test.js`
Expected: FAIL — upsert called with `appointmentId_type`, not `appointmentId_type_dedupeKey`.

- [ ] **Step 3: Schema change.** In `prisma/schema.prisma` `model NotificationJob`: add the field after `vars` and replace the unique + its comment:

```prisma
  /// Distinguishes repeatable sends of the same type for one appointment (Slice F:
  /// one prescription_ready per prescription). '' for singleton types (Slice E semantics).
  dedupeKey      String             @default("") @map("dedupe_key")
```

and change:

```prisma
  /// Idempotent enqueue: a webhook replay cannot duplicate a job. Slice F relaxes
  /// this if prescription_ready needs to repeat per prescription (YAGNI now).
  @@unique([appointmentId, type])
```

to:

```prisma
  /// Idempotent enqueue: a replay cannot duplicate a job. dedupeKey='' keeps Slice E
  /// types singleton-per-appointment; prescription_ready uses the prescription id.
  @@unique([appointmentId, type, dedupeKey])
```

- [ ] **Step 4: Run the migration**

Run: `npm run prisma:migrate -- --name slice_f_outbox_dedupe_key`
Expected: "Your database is now in sync with your schema" + new folder under `prisma/migrations/`.

- [ ] **Step 5: Implement.** In `server/src/modules/notification/service.js`, replace `enqueue` (keep its JSDoc shape, adding `dedupeKey`):

```js
/**
 * Persist one outbox row. Idempotent on (appointmentId, type, dedupeKey): a replay is a no-op.
 * dedupeKey defaults to '' (singleton per type); pass a unique key (e.g. prescription id) for
 * repeatable types. Pass `client` to join the caller's $transaction (the outbox guarantee).
 * @param {{ type: string, appointmentId: string, recipientEmail: string,
 *   scheduledFor: Date, vars?: object, dedupeKey?: string, client?: any }} args
 */
export async function enqueue({
  type,
  appointmentId,
  recipientEmail,
  scheduledFor,
  vars,
  dedupeKey = '',
  client = prisma,
}) {
  return client.notificationJob.upsert({
    where: { appointmentId_type_dedupeKey: { appointmentId, type, dedupeKey } },
    update: {},
    create: { type, appointmentId, recipientEmail, scheduledFor, vars, dedupeKey },
  });
}
```

- [ ] **Step 6: Run module tests + full suite**

Run: `npx vitest run server/src/modules/notification/test.js` → PASS.
Run: `npm test` → 170 passed (169 + 1 new; payment/appointment tests mock the notification module, so they are unaffected). Run: `npx prisma migrate status` → "Database schema is up to date!"

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations server/src/modules/notification
git commit -m "feat(notification): outbox dedupeKey — repeatable prescription_ready per prescription (Slice F)"
```

---

### Task 2: Shared Zod DTOs — medicine + prescription

**Files:**
- Create: `shared/schemas/medicine/medicine.js`
- Create: `shared/schemas/prescription/prescription.js`
- Modify: `shared/schemas/index.js`

- [ ] **Step 1: Create `shared/schemas/medicine/medicine.js`:**

```js
// @ts-check
import { z } from 'zod';

/** GET /api/medicines?search= */
export const medicineSearchQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
});

/** POST /api/admin/medicines (F11.02). unitPrice is PKR paisa. */
export const medicineCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  genericName: z.string().trim().min(1).max(200).optional(),
  dosageForms: z.array(z.string().trim().min(1).max(60)).min(1),
  unitPrice: z.number().int().positive(),
});

/** PATCH /api/admin/medicines/:id (F11.03). Partial edit + deactivate toggle. */
export const medicineUpdateSchema = medicineCreateSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });
```

- [ ] **Step 2: Create `shared/schemas/prescription/prescription.js`:**

```js
// @ts-check
import { z } from 'zod';

/** One builder row (F08.02): catalogue pick (medicineId) XOR free-text (medicineName). */
const itemSchema = z
  .object({
    medicineId: z.string().min(1).optional(),
    medicineName: z.string().trim().min(1).max(200).optional(),
    dosage: z.string().trim().min(1).max(200),
    duration: z.string().trim().min(1).max(200),
    instructions: z.string().trim().min(1).max(500),
  })
  .refine((i) => !!i.medicineId !== !!i.medicineName, {
    message: 'Provide exactly one of medicineId or medicineName',
  });

/** POST /api/appointments/:id/prescriptions */
export const prescriptionCreateSchema = z.object({
  items: z.array(itemSchema).min(1),
  notes: z.string().trim().max(2000).optional(),
  followUpDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'followUpDate must be YYYY-MM-DD')
    .optional(),
});
```

- [ ] **Step 3: Add to the barrel** (`shared/schemas/index.js`):

```js
export * from './medicine/medicine.js';
export * from './prescription/prescription.js';
```

- [ ] **Step 4: Run suite, commit**

Run: `npm test` → 170 passed (declarative DTOs; exercised by Tasks 3–10).

```bash
git add shared/schemas
git commit -m "feat(schemas): medicine + prescription DTOs (F08/F11)"
```

---

### Task 3: Medicine service

**Files:**
- Create: `server/src/modules/medicine/service.js`
- Test: `server/src/modules/medicine/test.js`

- [ ] **Step 1: Write the failing tests** (`server/src/modules/medicine/test.js`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    medicine: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));

import { prisma } from '../../lib/prisma/prisma.js';
import * as audit from '../../services/audit/audit.service.js';
import { list, create, update } from './service.js';

beforeEach(() => vi.clearAllMocks());

describe('medicine.list (F11.01)', () => {
  it('returns active-only, name-sorted; search hits name and genericName', async () => {
    prisma.medicine.findMany.mockResolvedValue([]);
    await list({ search: 'ada' });
    expect(prisma.medicine.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { name: { contains: 'ada', mode: 'insensitive' } },
          { genericName: { contains: 'ada', mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  });

  it('without search filters only on isActive', async () => {
    prisma.medicine.findMany.mockResolvedValue([]);
    await list({});
    expect(prisma.medicine.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  });
});

describe('medicine.create / update (F11.02/.03)', () => {
  it('create persists and writes the medicine.created audit row', async () => {
    prisma.medicine.create.mockResolvedValue({ id: 'm1' });
    const data = { name: 'Tretinoin', dosageForms: ['cream'], unitPrice: 20000 };
    await create({ data, actorId: 'admin1' });
    expect(prisma.medicine.create).toHaveBeenCalledWith({ data });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'medicine.created',
        actorType: 'admin',
        actorId: 'admin1',
        targetRef: 'm1',
      }),
    );
  });

  it('update edits in place (incl. isActive=false) and audits the changed fields', async () => {
    prisma.medicine.update.mockResolvedValue({ id: 'm1', isActive: false });
    await update({ id: 'm1', data: { isActive: false }, actorId: 'admin1' });
    expect(prisma.medicine.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { isActive: false },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'medicine.updated',
        targetRef: 'm1',
        meta: { fields: ['isActive'] },
      }),
    );
  });

  it('update of an unknown id maps to 404 NOT_FOUND', async () => {
    prisma.medicine.update.mockRejectedValue(new Error('P2025'));
    await expect(update({ id: 'nope', data: { unitPrice: 1 }, actorId: 'a' })).rejects.toMatchObject(
      { code: 'NOT_FOUND', status: 404 },
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/medicine/test.js`
Expected: FAIL — "Cannot find module './service.js'" (or equivalent).

- [ ] **Step 3: Implement** (`server/src/modules/medicine/service.js`):

```js
// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import * as audit from '../../services/audit/audit.service.js';

/** Builder dropdown source (F11.01): active catalogue only; deactivated medicines vanish
 *  from here but never from existing prescriptions (snapshot rule #5). */
export async function list({ search } = {}) {
  return prisma.medicine.findMany({
    where: {
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { genericName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
  });
}

export async function create({ data, actorId }) {
  const med = await prisma.medicine.create({ data });
  await audit.record({
    eventType: 'medicine.created',
    actorType: 'admin',
    actorId,
    targetRef: med.id,
  });
  return med;
}

export async function update({ id, data, actorId }) {
  const med = await prisma.medicine.update({ where: { id }, data }).catch(() => null);
  if (!med) throw new AppError('NOT_FOUND', 'Medicine not found.', 404);
  await audit.record({
    eventType: 'medicine.updated',
    actorType: 'admin',
    actorId,
    targetRef: id,
    meta: { fields: Object.keys(data) },
  });
  return med;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/modules/medicine/test.js` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/medicine
git commit -m "feat(medicine): catalogue service — active-only search, admin create/update with audit (F11)"
```

---

### Task 4: Medicine controller + routers + mount

**Files:**
- Create: `server/src/modules/medicine/controller.js`
- Create: `server/src/modules/medicine/index.js`
- Modify: `server/src/routes.js`

- [ ] **Step 1: Controller** (`server/src/modules/medicine/controller.js`):

```js
// @ts-check
import * as medicineService from './service.js';

export async function list(req, res, next) {
  try {
    res.json({ data: await medicineService.list({ search: req.query.search }) });
  } catch (e) {
    next(e);
  }
}

export async function create(req, res, next) {
  try {
    res
      .status(201)
      .json(await medicineService.create({ data: req.body, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function update(req, res, next) {
  try {
    res.json(
      await medicineService.update({
        id: req.params.id,
        data: req.body,
        actorId: req.session.userId,
      }),
    );
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 2: Routers** (`server/src/modules/medicine/index.js`) — mirrors `doctor/index.js` incl. its local `validateQuery` helper:

```js
// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import { validate } from '../../middleware/validate/validate.js';
import {
  medicineSearchQuerySchema,
  medicineCreateSchema,
  medicineUpdateSchema,
} from '../../../../shared/schemas/index.js';

// Validate req.query into req.query (Zod) without a body. Small inline middleware.
const validateQuery = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(r.error);
  req.query = r.data;
  next();
};

export const medicinesRouter = Router();
// GET /api/medicines?search=  (doctor/admin: builder dropdown source)
medicinesRouter.get(
  '/',
  requireRole('doctor', 'admin'),
  validateQuery(medicineSearchQuerySchema),
  c.list,
);

export const adminMedicinesRouter = Router();
// POST /api/admin/medicines  (admin; A-02 UI lands in Slice G)
adminMedicinesRouter.post('/', requireRole('admin'), validate(medicineCreateSchema), c.create);
// PATCH /api/admin/medicines/:id  (admin; edit + deactivate)
adminMedicinesRouter.patch('/:id', requireRole('admin'), validate(medicineUpdateSchema), c.update);
```

- [ ] **Step 3: Mount.** In `server/src/routes.js`, add the import next to the other module imports:

```js
import { medicinesRouter, adminMedicinesRouter } from './modules/medicine/index.js';
```

and after the `app.use('/api/availability', availabilityRouter);` line:

```js
  app.use('/api/medicines', medicinesRouter);
  app.use('/api/admin/medicines', adminMedicinesRouter);
```

- [ ] **Step 4: Run full suite (boot is covered by app integration tests)**

Run: `npm test` → 175 passed, no regressions.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/medicine server/src/routes.js
git commit -m "feat(medicine): GET /api/medicines + admin CRUD routes (F11 backend)"
```

---

### Task 5: State machine — `completed → prescription_issued`

**Files:**
- Modify: `server/src/modules/appointment/service.js` (`LEGAL`, line ~238)
- Modify: `server/src/modules/appointment/test.js`

- [ ] **Step 1: Write the failing test** (append to `server/src/modules/appointment/test.js`; the file's existing prisma/audit mocks cover this — `transition` is already imported in the destructure at the top):

```js
describe('transition: prescription issuance (F08.02)', () => {
  it('allows completed → prescription_issued', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'completed' });
    prisma.appointment.update.mockResolvedValue({ id: 'a1', state: 'prescription_issued' });
    const out = await transition({
      appointmentId: 'a1',
      to: 'prescription_issued',
      actorType: 'doctor',
    });
    expect(out.state).toBe('prescription_issued');
  });

  it('rejects any transition OUT of prescription_issued (terminal)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'prescription_issued' });
    await expect(
      transition({ appointmentId: 'a1', to: 'completed', actorType: 'system' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });
});
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `npx vitest run server/src/modules/appointment/test.js`
Expected: 1 FAIL — `Cannot move completed → prescription_issued` (the terminal-rejection test passes already; keep it as a regression pin).

- [ ] **Step 3: Implement.** In the `LEGAL` map in `server/src/modules/appointment/service.js`, add after the `in_progress:` entry and update the comment:

```js
/** Legal transitions (doc 05 §5). Slice C: slot_locked/confirmed. Slice D: in_progress. Slice F: completed. */
const LEGAL = {
  slot_locked: new Set(['confirmed']),
  confirmed: new Set([
    'cancelled_refunded',
    'cancelled_no_refund',
    'doctor_cancelled',
    'in_progress',
  ]),
  in_progress: new Set(['completed', 'patient_no_show', 'doctor_no_show']),
  completed: new Set(['prescription_issued']),
};
```

- [ ] **Step 4: Run module tests + full suite**

Run: `npx vitest run server/src/modules/appointment/test.js` → PASS. `npm test` → 177 passed.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/appointment
git commit -m "feat(appointment): completed → prescription_issued transition (F08.02)"
```

---

### Task 6: Appointment read-model — patient history scope, `hasPrescription`, detail subject fields

**Files:**
- Modify: `server/src/modules/appointment/service.js` (`listForRole`, `getForRole`)
- Modify: `server/src/modules/appointment/test.js`

- [ ] **Step 1: Write/extend the failing tests.** In `server/src/modules/appointment/test.js`:

(a) The existing test `'patient list returns upcoming rows with doctor card fields, no PII leak'` — add `_count: { prescriptions: 0 }` to its mock row object and `hasPrescription: false` to the `toEqual` expectation.

(b) Append a new describe:

```js
describe('listForRole patient history (F08.01 / P-09)', () => {
  it("scope=history returns terminal states newest-first with hasPrescription", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a2',
        slotStart: new Date('2099-01-02T13:00:00Z'),
        slotEnd: new Date('2099-01-02T13:30:00Z'),
        state: 'prescription_issued',
        feeAtBooking: 250000,
        forSelf: true,
        subjectName: null,
        doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
        _count: { prescriptions: 2 },
      },
    ]);
    const out = await listForRole({ role: 'patient', userId: 'u1', scope: 'history' });
    expect(out[0].hasPrescription).toBe(true);
    expect(out[0].state).toBe('prescription_issued');
    const arg = prisma.appointment.findMany.mock.calls[0][0];
    expect(arg.where.state.in).toContain('cancelled_refunded');
    expect(arg.where.state.in).not.toContain('confirmed');
    expect(arg.orderBy).toEqual({ slotStart: 'desc' });
  });
});
```

(c) If any existing doctor-branch `listForRole` test asserts on mapped rows, add `_count: { prescriptions: 0 }` to its mock rows (mapped output gains `hasPrescription: false`).

(d) Append a `getForRole` field test (the existing getForRole tests' mocks need `patient: { fullName: ... }` added to their appointment include payloads):

```js
describe('getForRole subject fields (D-05 header)', () => {
  it('returns subjectAge/subjectRelation/patientName for the builder header', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      patientUserId: 'u1',
      doctorId: 'd1',
      slotStart: new Date('2099-01-04T13:00:00Z'),
      slotEnd: new Date('2099-01-04T13:30:00Z'),
      state: 'completed',
      feeAtBooking: 250000,
      forSelf: false,
      subjectName: 'Ali',
      subjectAge: 9,
      subjectRelation: 'son',
      doctorJoinedAt: null,
      patientJoinedAt: null,
      doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
      patient: { fullName: 'Parent P' },
    });
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    const out = await getForRole({ id: 'a1', role: 'doctor', userId: 'u-doc' });
    expect(out.subjectAge).toBe(9);
    expect(out.subjectRelation).toBe('son');
    expect(out.patientName).toBe('Parent P');
  });
});
```

- [ ] **Step 2: Run to verify the new/changed tests fail**

Run: `npx vitest run server/src/modules/appointment/test.js` → targeted FAILs.

- [ ] **Step 3: Implement in `server/src/modules/appointment/service.js`:**

(a) Hoist `TERMINAL` to module scope — move the array literal currently declared inside `listForRole`'s doctor branch up next to `const UPCOMING = [...]`:

```js
const UPCOMING = ['confirmed', 'in_progress'];
const TERMINAL = [
  'completed',
  'prescription_issued',
  'patient_no_show',
  'doctor_no_show',
  'cancelled_refunded',
  'cancelled_no_refund',
  'doctor_cancelled',
];
```

(delete the inner declaration).

(b) Patient branch of `listForRole` — support `scope` and `_count`:

```js
  if (role === 'patient') {
    const rows = await prisma.appointment.findMany({
      where:
        scope === 'history'
          ? { patientUserId: userId, state: { in: TERMINAL } }
          : { patientUserId: userId, state: { in: UPCOMING } },
      orderBy: { slotStart: scope === 'history' ? 'desc' : 'asc' },
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            photoUrl: true,
            user: { select: { fullName: true } },
          },
        },
        _count: { select: { prescriptions: true } },
      },
    });
    return rows.map(toPatientRow);
  }
```

and extend `toPatientRow` with one line at the end of the returned object:

```js
    hasPrescription: a._count.prescriptions > 0,
```

(c) Doctor branch — add to the `findMany` include:

```js
    include: { patient: { select: { fullName: true } }, _count: { select: { prescriptions: true } } },
```

and to its row mapping:

```js
    hasPrescription: a._count.prescriptions > 0,
```

(d) `getForRole` — add `patient: { select: { fullName: true } }` to the query `include`, and three fields to the `detail` object after `subjectName`:

```js
    subjectAge: a.subjectAge,
    subjectRelation: a.subjectRelation,
    patientName: a.patient?.fullName ?? null,
```

- [ ] **Step 4: Run module + full suite + client suite** (client consumes `/appointments` — additive fields only, but verify):

Run: `npx vitest run server/src/modules/appointment/test.js` → PASS. `npm test` → 179 passed. `npm --workspace client test` → 41 passed.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/appointment
git commit -m "feat(appointment): patient history scope + hasPrescription + builder header fields (F08.01/F05.02)"
```

---

### Task 7: Prescription service — immutable submit

**Files:**
- Create: `server/src/modules/prescription/service.js`
- Test: `server/src/modules/prescription/test.js`

- [ ] **Step 1: Write the failing tests** (`server/src/modules/prescription/test.js`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    doctor: { findUnique: vi.fn() },
    appointment: { findUnique: vi.fn() },
    medicine: { findMany: vi.fn() },
    prescription: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../appointment/service.js', () => ({ transition: vi.fn().mockResolvedValue({}) }));
vi.mock('../notification/service.js', () => ({ enqueue: vi.fn().mockResolvedValue({}) }));

import { prisma } from '../../lib/prisma/prisma.js';
import * as appointmentState from '../appointment/service.js';
import * as notification from '../notification/service.js';
import { submit } from './service.js'; // Task 8 adds listByAppointment to this import

beforeEach(() => vi.clearAllMocks());

const DOCTOR = {
  id: 'd1',
  pmcNumber: 'PMC-1001',
  specialization: 'Acne',
  user: { fullName: 'Dr A' },
};
const APPT = {
  id: 'a1',
  doctorId: 'd1',
  patientUserId: 'u1',
  state: 'completed',
  forSelf: false,
  subjectName: 'Ali',
  subjectAge: 9,
  subjectRelation: 'son',
  patient: { email: 'p@t.test', fullName: 'Parent P' },
};

function arrangeTx() {
  const tx = {
    prescription: {
      create: vi.fn().mockResolvedValue({ id: 'rx1', items: [] }),
    },
  };
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  return tx;
}

describe('prescription.submit (F08.02)', () => {
  beforeEach(() => {
    prisma.doctor.findUnique.mockResolvedValue(DOCTOR);
    prisma.appointment.findUnique.mockResolvedValue(APPT);
    prisma.medicine.findMany.mockResolvedValue([
      { id: 'm1', name: 'Adapalene Gel', unitPrice: 30000 },
    ]);
  });

  it('snapshots catalogue name+price server-side; free-text gets price null (#5)', async () => {
    const tx = arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [
        { medicineId: 'm1', dosage: '1x', duration: '7 days', instructions: 'at night' },
        { medicineName: 'Custom Balm', dosage: '2x', duration: '5 days', instructions: 'morning' },
      ],
    });
    const data = tx.prescription.create.mock.calls[0][0].data;
    expect(data.items.create).toEqual([
      {
        medicineName: 'Adapalene Gel',
        dosage: '1x',
        duration: '7 days',
        instructions: 'at night',
        price: 30000,
      },
      {
        medicineName: 'Custom Balm',
        dosage: '2x',
        duration: '5 days',
        instructions: 'morning',
        price: null,
      },
    ]);
    expect(data.doctorSnapshot).toEqual({
      name: 'Dr A',
      pmcNumber: 'PMC-1001',
      specialization: 'Acne',
    });
    expect(data.patientIdSnapshot).toEqual({
      forSelf: false,
      name: 'Ali',
      age: 9,
      relation: 'son',
    });
  });

  it('first issue transitions completed → prescription_issued inside the tx', async () => {
    arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
    });
    expect(appointmentState.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'prescription_issued' }),
    );
  });

  it('a correction (state already prescription_issued) does NOT transition but DOES enqueue', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...APPT, state: 'prescription_issued' });
    arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
    });
    expect(appointmentState.transition).not.toHaveBeenCalled();
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'prescription_ready', dedupeKey: 'rx1' }),
    );
  });

  it('enqueues prescription_ready in the SAME tx with the doc 14 §5 vars', async () => {
    const tx = arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
    });
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'prescription_ready',
        appointmentId: 'a1',
        recipientEmail: 'p@t.test',
        dedupeKey: 'rx1',
        client: tx,
        vars: expect.objectContaining({
          patientName: 'Parent P',
          doctorName: 'Dr A',
          prescriptionUrl: expect.stringContaining('/appointments/a1/prescriptions'),
        }),
      }),
    );
  });

  it('forSelf appointment snapshots the account-holder name', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      ...APPT,
      forSelf: true,
      subjectName: null,
      subjectAge: null,
      subjectRelation: null,
    });
    const tx = arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
    });
    expect(tx.prescription.create.mock.calls[0][0].data.patientIdSnapshot).toEqual({
      forSelf: true,
      name: 'Parent P',
    });
  });

  it('rejects a non-owner doctor with 404 (no-leak)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...APPT, doctorId: 'd-other' });
    await expect(
      submit({
        appointmentId: 'a1',
        doctorUserId: 'u-doc',
        items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('rejects wrong state (confirmed) with 409 INVALID_STATE', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...APPT, state: 'confirmed' });
    await expect(
      submit({
        appointmentId: 'a1',
        doctorUserId: 'u-doc',
        items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  it('rejects an unknown medicineId with 400 (race / hand-crafted request)', async () => {
    prisma.medicine.findMany.mockResolvedValue([]);
    await expect(
      submit({
        appointmentId: 'a1',
        doctorUserId: 'u-doc',
        items: [{ medicineId: 'm-gone', dosage: '1x', duration: '7d', instructions: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/prescription/test.js`
Expected: FAIL — "Cannot find module './service.js'".

- [ ] **Step 3: Implement** (`server/src/modules/prescription/service.js`):

```js
// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { env } from '../../config/env/env.js';
import * as appointmentState from '../appointment/service.js';
import * as notification from '../notification/service.js';

/** Owner gate (404-no-leak, same answer as a missing appointment). */
async function ownedAppointment(appointmentId, doctorUserId) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: doctorUserId },
    select: { id: true, pmcNumber: true, specialization: true, user: { select: { fullName: true } } },
  });
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: { select: { email: true, fullName: true } } },
  });
  if (!doctor || !appt || appt.doctorId !== doctor.id) {
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  return { doctor, appt };
}

/**
 * Immutable submit (F08.02). One $transaction: create + items → first-issue transition →
 * prescription_ready outbox row (dedupeKey = prescription id, so corrections email too).
 * NO update/delete function exists in this module — immutability by absence (§3.3 #4).
 * @param {{ appointmentId: string, doctorUserId: string,
 *   items: Array<{ medicineId?: string, medicineName?: string, dosage: string,
 *     duration: string, instructions: string }>, notes?: string, followUpDate?: string }} args
 */
export async function submit({ appointmentId, doctorUserId, items, notes, followUpDate }) {
  const { doctor, appt } = await ownedAppointment(appointmentId, doctorUserId);
  // Completed-Gate Rule + Chronological Corrections Rule (policy #9).
  if (appt.state !== 'completed' && appt.state !== 'prescription_issued') {
    throw new AppError('INVALID_STATE', 'Prescription requires a completed consultation.', 409);
  }

  // Medicine Snapshot Rule (#5): name+price resolved server-side; client prices never trusted.
  // A deactivated medicine still resolves — deactivation only hides it from the dropdown.
  const ids = items.filter((i) => i.medicineId).map((i) => i.medicineId);
  const meds = ids.length ? await prisma.medicine.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(meds.map((m) => [m.id, m]));
  const itemRows = items.map((i) => {
    if (i.medicineId) {
      const m = byId.get(i.medicineId);
      if (!m) throw new AppError('VALIDATION', `Unknown medicine: ${i.medicineId}`, 400);
      return {
        medicineName: m.name,
        dosage: i.dosage,
        duration: i.duration,
        instructions: i.instructions,
        price: m.unitPrice,
      };
    }
    return {
      medicineName: i.medicineName,
      dosage: i.dosage,
      duration: i.duration,
      instructions: i.instructions,
      price: null,
    };
  });

  // Identity snapshots (#3 / Identity Snapshot Rule): durable copies at issue-time.
  const doctorSnapshot = {
    name: doctor.user.fullName,
    pmcNumber: doctor.pmcNumber,
    specialization: doctor.specialization,
  };
  const patientIdSnapshot = appt.forSelf
    ? { forSelf: true, name: appt.patient.fullName }
    : {
        forSelf: false,
        name: appt.subjectName,
        age: appt.subjectAge,
        relation: appt.subjectRelation,
      };

  return prisma.$transaction(async (tx) => {
    const created = await tx.prescription.create({
      data: {
        appointmentId,
        doctorSnapshot,
        patientIdSnapshot,
        notes: notes ?? null,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        items: { create: itemRows },
      },
      include: { items: true },
    });
    if (appt.state === 'completed') {
      await appointmentState.transition({
        appointmentId,
        to: 'prescription_issued',
        actorType: 'doctor',
        actorId: doctorUserId,
        client: tx,
      });
    }
    await notification.enqueue({
      type: 'prescription_ready',
      appointmentId,
      recipientEmail: appt.patient.email,
      scheduledFor: new Date(),
      dedupeKey: created.id,
      vars: {
        patientName: appt.patient.fullName,
        doctorName: doctor.user.fullName,
        prescriptionUrl: `${env.APP_BASE_URL}/appointments/${appointmentId}/prescriptions`,
      },
      client: tx,
    });
    return created;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/modules/prescription/test.js` → 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/prescription
git commit -m "feat(prescription): immutable submit — snapshots, first-issue transition, in-tx prescription_ready (F08.02)"
```

---

### Task 8: Prescription service — chronological read

**Files:**
- Modify: `server/src/modules/prescription/service.js`
- Modify: `server/src/modules/prescription/test.js`

- [ ] **Step 1: Add failing tests** (append to `server/src/modules/prescription/test.js`; change the import line to `import { submit, listByAppointment } from './service.js';` — importing the not-yet-existing export is exactly what makes this red: ESM linking fails until Step 3 adds it):

```js
describe('prescription.listByAppointment (F08.01)', () => {
  const RX = [{ id: 'rx1', issuedAt: new Date('2099-01-01T10:00:00Z'), items: [] }];

  it('patient-owner reads chronologically (issuedAt asc) with items', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', patientUserId: 'u1', doctorId: 'd1' });
    prisma.prescription.findMany.mockResolvedValue(RX);
    const out = await listByAppointment({ appointmentId: 'a1', role: 'patient', userId: 'u1' });
    expect(out).toEqual(RX);
    expect(prisma.prescription.findMany).toHaveBeenCalledWith({
      where: { appointmentId: 'a1' },
      orderBy: { issuedAt: 'asc' },
      include: { items: true },
    });
  });

  it('doctor-owner and admin read; a stranger gets 404 (no-leak)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', patientUserId: 'u1', doctorId: 'd1' });
    prisma.prescription.findMany.mockResolvedValue(RX);
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    await expect(
      listByAppointment({ appointmentId: 'a1', role: 'doctor', userId: 'u-doc' }),
    ).resolves.toEqual(RX);
    await expect(
      listByAppointment({ appointmentId: 'a1', role: 'admin', userId: 'u-adm' }),
    ).resolves.toEqual(RX);
    await expect(
      listByAppointment({ appointmentId: 'a1', role: 'patient', userId: 'u-other' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run server/src/modules/prescription/test.js`.

- [ ] **Step 3: Implement** (append to `server/src/modules/prescription/service.js`):

```js
/**
 * Chronological read (F08.01): all prescriptions for one appointment, oldest first —
 * corrections (policy #9) are all visible and each is downloadable separately.
 * This JSON is exactly what the client PDF renders (§3.5).
 */
export async function listByAppointment({ appointmentId, role, userId }) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientUserId: true, doctorId: true },
  });
  const visible =
    appt &&
    ((role === 'patient' && appt.patientUserId === userId) ||
      (role === 'doctor' &&
        (await prisma.doctor.findUnique({ where: { userId }, select: { id: true } }))?.id ===
          appt.doctorId) ||
      role === 'admin');
  if (!visible) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  return prisma.prescription.findMany({
    where: { appointmentId },
    orderBy: { issuedAt: 'asc' },
    include: { items: true },
  });
}
```

- [ ] **Step 4: Run module tests + full suite** → `npx vitest run server/src/modules/prescription/test.js` PASS (10); `npm test` → 189 passed.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/prescription
git commit -m "feat(prescription): chronological read with owner/admin gate (F08.01)"
```

---

### Task 9: Prescription controller + router + mount

**Files:**
- Create: `server/src/modules/prescription/controller.js`
- Create: `server/src/modules/prescription/index.js`
- Modify: `server/src/routes.js`

- [ ] **Step 1: Controller** (`server/src/modules/prescription/controller.js`):

```js
// @ts-check
import * as prescriptionService from './service.js';

export async function create(req, res, next) {
  try {
    const created = await prescriptionService.submit({
      appointmentId: req.params.id,
      doctorUserId: req.session.userId,
      ...req.body,
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
}

export async function list(req, res, next) {
  try {
    res.json({
      data: await prescriptionService.listByAppointment({
        appointmentId: req.params.id,
        role: req.session.role,
        userId: req.session.userId,
      }),
    });
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 2: Router** (`server/src/modules/prescription/index.js`) — `mergeParams` so `:id` from the mount path reaches the handlers:

```js
// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import { validate } from '../../middleware/validate/validate.js';
import { prescriptionCreateSchema } from '../../../../shared/schemas/index.js';

export const prescriptionsRouter = Router({ mergeParams: true });
// POST /api/appointments/:id/prescriptions  (doctor-owner; immutable submit)
prescriptionsRouter.post('/', requireRole('doctor'), validate(prescriptionCreateSchema), c.create);
// GET /api/appointments/:id/prescriptions  (patient-owner / doctor-owner / admin)
prescriptionsRouter.get('/', requireRole('patient', 'doctor', 'admin'), c.list);
```

- [ ] **Step 3: Mount.** In `server/src/routes.js` add the import:

```js
import { prescriptionsRouter } from './modules/prescription/index.js';
```

and immediately BEFORE the `app.use('/api/appointments', appointmentsRouter);` line:

```js
  // Nested prescription routes; mounted before the appointments router so the
  // two-segment path is owned explicitly (mergeParams carries :id through).
  app.use('/api/appointments/:id/prescriptions', prescriptionsRouter);
```

- [ ] **Step 4: Run full suite** → `npm test` → 189 passed (routing exercised by Task 10's integration test).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/prescription server/src/routes.js
git commit -m "feat(prescription): POST/GET /api/appointments/:id/prescriptions routes (F08)"
```

---

### Task 10: Integration test — full prescription flow (real DB)

**Files:**
- Create: `server/src/test/prescription.integration.test.js`

- [ ] **Step 1: Write the test.** Login as the seeded doctor (`dr.ayesha@dermestha.dev` / `Password123`), sign up a patient, create a `completed` appointment directly via Prisma (driving in_progress→completed via workers is Slice D's covered ground — not re-tested here), then exercise the HTTP surface:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const request = (await import('supertest')).default;
const { createApp } = await import('../index.js');
const { prisma } = await import('../lib/prisma/prisma.js');

const app = createApp();
const uniq = () => `slicef_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

describe('prescription flow — immutable submit, corrections, snapshot durability', () => {
  let doctorAgent, patientAgent, otherDoctorAgent;
  let patientEmail, patientUserId, doctorId, appointmentId, medicineId, firstRxId;

  beforeAll(async () => {
    // Seeded doctors (prisma/seed.js): Password123, active.
    const docUser = await prisma.user.findUnique({ where: { email: 'dr.ayesha@dermestha.dev' } });
    const doc = await prisma.doctor.findUnique({ where: { userId: docUser.id } });
    doctorId = doc.id;

    doctorAgent = request.agent(app);
    await doctorAgent
      .post('/api/auth/login')
      .send({ email: 'dr.ayesha@dermestha.dev', password: 'Password123' })
      .expect(200);

    otherDoctorAgent = request.agent(app);
    await otherDoctorAgent
      .post('/api/auth/login')
      .send({ email: 'dr.bilal@dermestha.dev', password: 'Password123' })
      .expect(200);

    patientEmail = uniq();
    patientAgent = request.agent(app);
    const signup = await patientAgent.post('/api/auth/signup').send({
      fullName: 'Rx Parent',
      email: patientEmail,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    expect(signup.status).toBeLessThan(300); // 200/201 — don't pin the exact code here
    patientUserId = (await prisma.user.findUnique({ where: { email: patientEmail } })).id;

    // Dedicated test medicine (repriced later; never mutate seeded rows).
    medicineId = (
      await prisma.medicine.create({
        data: { name: `SliceF Test Med ${Date.now()}`, dosageForms: ['cream'], unitPrice: 50000 },
      })
    ).id;

    // A completed past consultation for a third party (P8 who-for).
    appointmentId = (
      await prisma.appointment.create({
        data: {
          doctorId,
          patientUserId,
          slotStart: new Date(Date.now() - 2 * 3600 * 1000),
          slotEnd: new Date(Date.now() - 90 * 60 * 1000),
          state: 'completed',
          feeAtBooking: 250000,
          forSelf: false,
          subjectName: 'Ali',
          subjectAge: 9,
          subjectRelation: 'son',
        },
      })
    ).id;
  });

  it('doctor submits: prescription + snapshots + state + outbox job, all committed', async () => {
    const res = await doctorAgent.post(`/api/appointments/${appointmentId}/prescriptions`).send({
      items: [
        { medicineId, dosage: '1x daily', duration: '7 days', instructions: 'after meals' },
        { medicineName: 'Custom Balm', dosage: '2x', duration: '5 days', instructions: 'morning' },
      ],
      notes: 'Avoid sun exposure.',
    });
    expect(res.status).toBe(201);
    firstRxId = res.body.id;
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.find((i) => i.medicineName === 'Custom Balm').price).toBeNull();
    expect(res.body.patientIdSnapshot).toEqual({
      forSelf: false,
      name: 'Ali',
      age: 9,
      relation: 'son',
    });

    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt.state).toBe('prescription_issued');

    const jobs = await prisma.notificationJob.findMany({
      where: { appointmentId, type: 'prescription_ready' },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].dedupeKey).toBe(firstRxId);
    expect(jobs[0].vars.prescriptionUrl).toContain(`/appointments/${appointmentId}/prescriptions`);
  });

  it('a correction creates a SECOND prescription + second email job; state unchanged', async () => {
    const res = await doctorAgent.post(`/api/appointments/${appointmentId}/prescriptions`).send({
      items: [{ medicineId, dosage: '2x daily', duration: '10 days', instructions: 'corrected' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(firstRxId);

    const jobs = await prisma.notificationJob.findMany({
      where: { appointmentId, type: 'prescription_ready' },
    });
    expect(jobs).toHaveLength(2);
    expect((await prisma.appointment.findUnique({ where: { id: appointmentId } })).state).toBe(
      'prescription_issued',
    );
  });

  it('catalogue reprice/rename/deactivate never alters the stored snapshot (#5)', async () => {
    await prisma.medicine.update({
      where: { id: medicineId },
      data: { name: 'RENAMED', unitPrice: 99900, isActive: false },
    });
    const list = await patientAgent.get(`/api/appointments/${appointmentId}/prescriptions`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    const item = list.body.data[0].items.find((i) => i.price !== null);
    expect(item.medicineName).not.toBe('RENAMED');
    expect(item.price).toBe(50000);
  });

  it('deactivated medicine is gone from the builder dropdown', async () => {
    const res = await doctorAgent.get('/api/medicines').query({ search: 'SliceF Test Med' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('a non-owner doctor gets 404 (no-leak); patient cannot POST (403)', async () => {
    const foreign = await otherDoctorAgent
      .post(`/api/appointments/${appointmentId}/prescriptions`)
      .send({ items: [{ medicineName: 'X', dosage: '1', duration: '1', instructions: 'x' }] });
    expect(foreign.status).toBe(404);

    const patientPost = await patientAgent
      .post(`/api/appointments/${appointmentId}/prescriptions`)
      .send({ items: [{ medicineName: 'X', dosage: '1', duration: '1', instructions: 'x' }] });
    expect(patientPost.status).toBe(403);
  });

  it('patient history list shows the appointment with hasPrescription=true', async () => {
    const res = await patientAgent.get('/api/appointments').query({ scope: 'history' });
    expect(res.status).toBe(200);
    const row = res.body.data.find((a) => a.id === appointmentId);
    expect(row.state).toBe('prescription_issued');
    expect(row.hasPrescription).toBe(true);
  });

  afterAll(async () => {
    await prisma.notificationJob.deleteMany({ where: { appointmentId } });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { appointmentId } },
    });
    await prisma.prescription.deleteMany({ where: { appointmentId } });
    await prisma.appointment.deleteMany({ where: { id: appointmentId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: appointmentId } });
    await prisma.medicine.deleteMany({ where: { id: medicineId } });
    await prisma.user.deleteMany({ where: { email: patientEmail } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run it against the live dev DB**

Run: `npx vitest run server/src/test/prescription.integration.test.js` → PASS (6 tests).

- [ ] **Step 3: Full suite** → `npm test` → 195 passed.

- [ ] **Step 4: Commit**

```bash
git add server/src/test/prescription.integration.test.js
git commit -m "test(prescription): immutable submit, corrections, snapshot durability, access gates (integration)"
```

---

### Task 11: Client — `stateLabel`, history scope, patient tabs + P-09 Past view

**Files:**
- Create: `client/src/modules/appointment/stateLabel.js`
- Create: `client/src/modules/appointment/views/Past/Past.jsx`
- Create: `client/src/modules/appointment/views/Past/Past.test.jsx`
- Modify: `client/src/modules/appointment/useAppointment.js`
- Modify: `client/src/modules/appointment/views/Upcoming/Upcoming.jsx` (tab bar only)
- Modify: `client/src/modules/appointment/appointment.routes.jsx`

- [ ] **Step 1: Write the failing tests** (`client/src/modules/appointment/views/Past/Past.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Past } from './Past.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';
import { stateLabel } from '../../stateLabel.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn() } }));
vi.mock('../../../../context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Past />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

const row = (state, extra = {}) => ({
  id: `a-${state}`,
  slotStart: '2099-01-04T13:00:00.000Z',
  slotEnd: '2099-01-04T13:30:00.000Z',
  state,
  feeAtBooking: 250000,
  forSelf: true,
  subjectName: null,
  doctorName: 'Dr A',
  specialization: 'Acne',
  doctorPhotoUrl: null,
  hasPrescription: false,
  ...extra,
});

describe('stateLabel (F08.01 exact mapping)', () => {
  it.each([
    ['completed', 'Completed'],
    ['prescription_issued', 'Completed'],
    ['patient_no_show', 'Missed (no-show)'],
    ['doctor_no_show', 'Cancelled by doctor — refund issued'],
    ['doctor_cancelled', 'Cancelled by doctor — refund issued'],
    ['cancelled_refunded', 'Cancelled — refunded'],
    ['cancelled_no_refund', 'Cancelled — no refund'],
  ])('%s → %s', (state, label) => {
    expect(stateLabel(state)).toBe(label);
  });
});

describe('P-09 Past appointments', () => {
  it('fetches scope=history and renders labelled rows', async () => {
    api.get.mockResolvedValue({ data: [row('cancelled_refunded')] });
    setup();
    await waitFor(() => expect(screen.getByText('Cancelled — refunded')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/appointments?scope=history');
  });

  it('shows Download Prescription only for prescription_issued', async () => {
    api.get.mockResolvedValue({
      data: [row('prescription_issued', { hasPrescription: true }), row('completed')],
    });
    setup();
    await waitFor(() => expect(screen.getAllByText('Completed')).toHaveLength(2));
    const links = screen.getAllByRole('link', { name: /download prescription/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toContain('/appointments/a-prescription_issued/prescriptions');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --workspace client test` → FAIL ("Cannot find module ... Past.jsx" / stateLabel).

- [ ] **Step 3: Implement.**

(a) `client/src/modules/appointment/stateLabel.js`:

```js
// @ts-check
/** Patient-facing terminal-state labels — F08.01's exact mapping. State stays source of truth. */
const LABELS = {
  completed: 'Completed',
  prescription_issued: 'Completed',
  patient_no_show: 'Missed (no-show)',
  doctor_no_show: 'Cancelled by doctor — refund issued',
  doctor_cancelled: 'Cancelled by doctor — refund issued',
  cancelled_refunded: 'Cancelled — refunded',
  cancelled_no_refund: 'Cancelled — no refund',
};

export const stateLabel = (state) => LABELS[state] ?? state;
```

(b) In `client/src/modules/appointment/useAppointment.js`, change the destructure and `list` query (everything else unchanged):

```js
  const { detailId = null, scope = null } = opts;
  // ...
  const list = useQuery({
    queryKey: ['appointments', scope],
    queryFn: () => api.get(scope === 'history' ? '/appointments?scope=history' : '/appointments'),
  });
```

(update the JSDoc param to `@param {{ detailId?: string|null, scope?: string|null }} [opts]`; the cancel mutation's `invalidateQueries({ queryKey: ['appointments'] })` already prefix-matches both keys).

(c) `client/src/modules/appointment/views/Past/Past.jsx`:

```jsx
// @ts-check
import { Link } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatKarachi } from '../../../../lib/format/format.js';
import { stateLabel } from '../../stateLabel.js';
import { useAppointment } from '../../useAppointment.js';

export function Past() {
  const { list } = useAppointment({ scope: 'history' });
  const rows = list.data?.data ?? [];

  return (
    <PatientLayout>
      <section className="section-card">
        <div className="tabs" role="tablist">
          <Link className="tab" to="/appointments">
            Upcoming
          </Link>
          <Link className="tab tab--active" to="/appointments/history">
            Past
          </Link>
        </div>
        <h1>Past appointments</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && <p className="help">No past appointments.</p>}
        {rows.map((a) => (
          <div key={a.id} className="appt-row">
            <strong>{a.doctorName}</strong> — {a.specialization}
            <div>{formatKarachi(a.slotStart)}</div>
            {!a.forSelf && <div>for: {a.subjectName}</div>}
            <span className="badge badge--neutral">{stateLabel(a.state)}</span>
            {a.state === 'prescription_issued' && (
              <Link className="btn btn--secondary" to={`/appointments/${a.id}/prescriptions`}>
                Download Prescription
              </Link>
            )}
          </div>
        ))}
      </section>
    </PatientLayout>
  );
}
```

(d) In `client/src/modules/appointment/views/Upcoming/Upcoming.jsx`, add the matching tab bar as the first child of `<section className="section-card">` (above the `<h1>`) — only this insertion, nothing else changes:

```jsx
        <div className="tabs" role="tablist">
          <Link className="tab tab--active" to="/appointments">
            Upcoming
          </Link>
          <Link className="tab" to="/appointments/history">
            Past
          </Link>
        </div>
```

(e) In `client/src/modules/appointment/appointment.routes.jsx`, import `Past` and add the route:

```jsx
import { Past } from './views/Past/Past.jsx';
// inside the returned array, after the '/appointments' entry:
  {
    path: '/appointments/history',
    element: (
      <RoleRoute session={session} role="patient">
        <Past />
      </RoleRoute>
    ),
  },
```

- [ ] **Step 4: Run client suite** → `npm --workspace client test` → 50 passed (41 + 9; existing Upcoming tests tolerate the added tab links).

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/appointment
git commit -m "feat(client): P-09 past appointments — tabs, F08.01 state labels, prescription link"
```

---

### Task 12: Client — pdf-lib + `renderPrescriptionPdf` boundary

**Files:**
- Create: `client/src/lib/pdf/renderPrescriptionPdf.js`
- Create: `client/src/lib/pdf/renderPrescriptionPdf.test.js`
- Modify: `client/package.json` (via npm install)

- [ ] **Step 1: Install the dependency**

Run: `npm --workspace client install pdf-lib`
Expected: `pdf-lib` appears in `client/package.json` dependencies.

- [ ] **Step 2: Write the failing test** (`client/src/lib/pdf/renderPrescriptionPdf.test.js`):

```js
import { describe, it, expect } from 'vitest';
import { renderPrescriptionPdf } from './renderPrescriptionPdf.js';

const PRESCRIPTION = {
  id: 'rx1',
  issuedAt: '2099-01-04T09:00:00.000Z',
  doctorSnapshot: { name: 'Dr A', pmcNumber: 'PMC-1001', specialization: 'Acne' },
  patientIdSnapshot: { forSelf: false, name: 'Ali', age: 9, relation: 'son' },
  notes: 'Avoid sun exposure.',
  followUpDate: '2099-01-18T00:00:00.000Z',
  items: [
    {
      medicineName: 'Adapalene Gel',
      dosage: '1x daily',
      duration: '7 days',
      instructions: 'at night',
      price: 30000,
    },
    { medicineName: 'Custom Balm', dosage: '2x', duration: '5 days', instructions: 'morning', price: null },
  ],
};

describe('renderPrescriptionPdf (§3.5 Client-Render Rule)', () => {
  it('renders prescription JSON to PDF bytes', async () => {
    const bytes = await renderPrescriptionPdf(PRESCRIPTION);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npm --workspace client test` → FAIL (module not found).

- [ ] **Step 4: Implement** (`client/src/lib/pdf/renderPrescriptionPdf.js`):

```js
// @ts-check
import { formatPkr } from '../format/format.js';

/**
 * §3.5 Client-Render Rule: the ONLY place PDF bytes are produced. Swap this file to move
 * rendering server-side (v1.2+); callers depend only on (prescriptionJson) => Uint8Array.
 * pdf-lib is dynamically imported so it never enters the main bundle (3G target).
 */
export async function renderPrescriptionPdf(p) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait (points)
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const draw = (text, { size = 11, f = font, x = 50 } = {}) => {
    page.drawText(String(text), { x, y, size, font: f });
    y -= size + 7;
  };

  draw('Dermestha — Prescription', { size: 18, f: bold });
  const d = p.doctorSnapshot ?? {};
  draw(`${d.name ?? ''} — ${d.specialization ?? ''} (PMC ${d.pmcNumber ?? ''})`);
  draw(
    `Issued: ${new Date(p.issuedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`,
  );
  const s = p.patientIdSnapshot ?? {};
  draw(
    s.forSelf
      ? `Patient: ${s.name ?? ''}`
      : `Patient: ${s.name ?? ''} (age ${s.age ?? '—'}, ${s.relation ?? ''})`,
    { f: bold },
  );
  y -= 8;

  let total = 0;
  let unpriced = 0;
  for (const item of p.items ?? []) {
    draw(`${item.medicineName} — ${item.dosage}, ${item.duration}`, { f: bold });
    if (item.instructions) draw(item.instructions, { x: 62 });
    if (item.price == null) {
      unpriced += 1;
      draw('not priced', { x: 62 });
    } else {
      total += item.price;
      draw(formatPkr(item.price), { x: 62 });
    }
  }
  y -= 8;
  draw(`Total: ${formatPkr(total)}`, { f: bold });
  if (unpriced) draw(`${unpriced} item(s) not priced`);
  if (p.notes) {
    y -= 8;
    draw('Notes:', { f: bold });
    draw(p.notes);
  }
  if (p.followUpDate) draw(`Follow-up: ${String(p.followUpDate).slice(0, 10)}`);

  return doc.save(); // Uint8Array
}
```

(If `formatPkr`'s signature in `client/src/lib/format/format.js` differs from `(paisa) => 'Rs N,NNN'`, open it and match the real export — do not invent a wrapper.)

- [ ] **Step 5: Run client suite** → `npm --workspace client test` → 51 passed.

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/package-lock.json package-lock.json client/src/lib/pdf
git commit -m "feat(client): pdf-lib prescription render boundary, lazy-imported (§3.5)"
```

(Stage whichever lockfile actually changed — workspaces hoist to the root `package-lock.json`.)

---

### Task 13: Client — usePrescription hook + P-13 prescription view

**Files:**
- Create: `client/src/modules/prescription/usePrescription.js`
- Create: `client/src/modules/prescription/views/PrescriptionView/PrescriptionView.jsx`
- Create: `client/src/modules/prescription/views/PrescriptionView/PrescriptionView.test.jsx`
- Create: `client/src/modules/prescription/prescription.routes.jsx`
- Modify: `client/src/routes.jsx`

- [ ] **Step 1: Write the failing tests** (`PrescriptionView.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrescriptionView } from './PrescriptionView.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn() } }));
vi.mock('../../../../context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));
vi.mock('../../../../lib/pdf/renderPrescriptionPdf.js', () => ({
  renderPrescriptionPdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/appointments/a1/prescriptions']}>
        <Routes>
          <Route path="/appointments/:id/prescriptions" element={<PrescriptionView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

const RX = (over = {}) => ({
  id: 'rx1',
  issuedAt: '2099-01-04T09:00:00.000Z',
  doctorSnapshot: { name: 'Dr A', pmcNumber: 'PMC-1001', specialization: 'Acne' },
  patientIdSnapshot: { forSelf: false, name: 'Ali', age: 9, relation: 'son' },
  notes: null,
  followUpDate: null,
  items: [
    { id: 'i1', medicineName: 'Adapalene Gel', dosage: '1x', duration: '7d', instructions: 'pm', price: 30000 },
    { id: 'i2', medicineName: 'Custom Balm', dosage: '2x', duration: '5d', instructions: 'am', price: null },
  ],
  ...over,
});

describe('P-13 prescription view', () => {
  it('renders items with price, "not priced", computed total and the not-priced note', async () => {
    api.get.mockResolvedValue({ data: [RX()] });
    setup();
    await waitFor(() => expect(screen.getByText('Adapalene Gel')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/appointments/a1/prescriptions');
    expect(screen.getByText(/not priced$/i)).toBeTruthy();
    expect(screen.getByText(/total/i).textContent).toContain('Rs 300');
    expect(screen.getByText(/1 item\(s\) not priced/i)).toBeTruthy();
  });

  it('renders corrections chronologically, each with its own Download button', async () => {
    api.get.mockResolvedValue({
      data: [RX(), RX({ id: 'rx2', issuedAt: '2099-01-05T09:00:00.000Z' })],
    });
    setup();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /download pdf/i })).toHaveLength(2),
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npm --workspace client test` → FAIL (modules not found).

- [ ] **Step 3: Implement.**

(a) `client/src/modules/prescription/usePrescription.js`:

```js
// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * Prescription module data/mutations (D2 pattern): every query is `enabled`-gated.
 * @param {{ appointmentId?: string|null, medicineSearch?: string|null }} [opts]
 */
export function usePrescription(opts = {}) {
  const { appointmentId = null, medicineSearch = null } = opts;
  const qc = useQueryClient();

  const prescriptions = useQuery({
    queryKey: ['prescriptions', appointmentId],
    queryFn: () => api.get(`/appointments/${appointmentId}/prescriptions`),
    enabled: !!appointmentId,
  });

  const medicines = useQuery({
    queryKey: ['medicines', medicineSearch],
    queryFn: () => api.get(`/medicines?search=${encodeURIComponent(medicineSearch ?? '')}`),
    enabled: medicineSearch !== null && medicineSearch.length >= 2,
  });

  const submit = useMutation({
    mutationFn: ({ appointmentId: id, body }) => api.post(`/appointments/${id}/prescriptions`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prescriptions'] }),
  });

  return { prescriptions, medicines, submit };
}
```

(b) `client/src/modules/prescription/views/PrescriptionView/PrescriptionView.jsx`:

```jsx
// @ts-check
import { useParams } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatPkr, formatKarachi } from '../../../../lib/format/format.js';
import { renderPrescriptionPdf } from '../../../../lib/pdf/renderPrescriptionPdf.js';
import { usePrescription } from '../../usePrescription.js';

async function downloadPdf(p) {
  const bytes = await renderPrescriptionPdf(p);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `prescription-${String(p.issuedAt).slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function PrescriptionCard({ p }) {
  const priced = p.items.filter((i) => i.price !== null);
  const unpriced = p.items.length - priced.length;
  const total = priced.reduce((sum, i) => sum + i.price, 0);
  const s = p.patientIdSnapshot ?? {};
  const d = p.doctorSnapshot ?? {};
  return (
    <div className="section-card">
      <h2>Prescription — {formatKarachi(p.issuedAt)}</h2>
      <p className="help">
        {d.name} — {d.specialization} (PMC {d.pmcNumber})
      </p>
      <p>
        Patient: {s.name}
        {!s.forSelf && ` (age ${s.age}, ${s.relation})`}
      </p>
      <ul>
        {p.items.map((i) => (
          <li key={i.id}>
            <strong>{i.medicineName}</strong> — {i.dosage}, {i.duration}
            {i.instructions && <div className="help">{i.instructions}</div>}
            <div>{i.price === null ? 'not priced' : formatPkr(i.price)}</div>
          </li>
        ))}
      </ul>
      <p>
        <strong>Total: {formatPkr(total)}</strong>
      </p>
      {unpriced > 0 && <p className="help">{unpriced} item(s) not priced</p>}
      {p.notes && <p>Notes: {p.notes}</p>}
      {p.followUpDate && <p>Follow-up: {String(p.followUpDate).slice(0, 10)}</p>}
      <button type="button" className="btn btn--primary" onClick={() => downloadPdf(p)}>
        Download PDF
      </button>
    </div>
  );
}

export function PrescriptionView() {
  const { id } = useParams();
  const { prescriptions } = usePrescription({ appointmentId: id });
  const rows = prescriptions.data?.data ?? [];

  return (
    <PatientLayout>
      <h1>Prescriptions</h1>
      {prescriptions.isPending && <p className="help">Loading…</p>}
      {prescriptions.data && rows.length === 0 && <p className="help">No prescriptions yet.</p>}
      {rows.map((p) => (
        <PrescriptionCard key={p.id} p={p} />
      ))}
    </PatientLayout>
  );
}
```

(c) `client/src/modules/prescription/prescription.routes.jsx` (D-05's route is added in Task 14 — only P-13 here):

```jsx
// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { PrescriptionView } from './views/PrescriptionView/PrescriptionView.jsx';

/** Prescription module routes (D3). */
export const prescriptionRoutes = (session) => [
  {
    path: '/appointments/:id/prescriptions',
    element: (
      <RoleRoute session={session} role="patient">
        <PrescriptionView />
      </RoleRoute>
    ),
  },
];
```

(d) In `client/src/routes.jsx`, add the import + spread:

```jsx
import { prescriptionRoutes } from './modules/prescription/prescription.routes.jsx';
// inside buildRoutes:
  ...prescriptionRoutes(session),
```

- [ ] **Step 4: Run client suite** → `npm --workspace client test` → 53 passed.

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/prescription client/src/routes.jsx
git commit -m "feat(client): P-13 prescription view — itemised totals, corrections list, PDF download"
```

---

### Task 14: Client — D-05 prescription builder

**Files:**
- Create: `client/src/modules/prescription/views/PrescriptionBuilder/PrescriptionBuilder.jsx`
- Create: `client/src/modules/prescription/views/PrescriptionBuilder/PrescriptionBuilder.test.jsx`
- Modify: `client/src/modules/prescription/prescription.routes.jsx`

- [ ] **Step 1: Write the failing tests** (`PrescriptionBuilder.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrescriptionBuilder } from './PrescriptionBuilder.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../../../context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'doctor' } }),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/doctor/appointments/a1/prescribe']}>
        <Routes>
          <Route path="/doctor/appointments/:id/prescribe" element={<PrescriptionBuilder />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/appointments/a1')
      return Promise.resolve({
        id: 'a1',
        state: 'completed',
        forSelf: false,
        subjectName: 'Ali',
        subjectAge: 9,
        subjectRelation: 'son',
        patientName: 'Parent P',
        slotStart: '2099-01-04T13:00:00.000Z',
        slotEnd: '2099-01-04T13:30:00.000Z',
      });
    if (path === '/appointments/a1/prescriptions') return Promise.resolve({ data: [] });
    if (path.startsWith('/medicines'))
      return Promise.resolve({
        data: [{ id: 'm1', name: 'Adapalene Gel', genericName: 'Adapalene', unitPrice: 30000 }],
      });
    return Promise.resolve({ data: [] });
  });
});

describe('D-05 prescription builder', () => {
  it('shows the read-only patient-ID header (third-party identity, never typed)', async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/Ali/)).toBeTruthy());
    expect(screen.getByText(/age 9/)).toBeTruthy();
    expect(screen.getByText(/son/)).toBeTruthy();
  });

  it('catalogue pick shows price + running total; free-text shows "not priced"', async () => {
    setup();
    await waitFor(() => expect(screen.getByPlaceholderText(/search medicine/i)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/search medicine/i), {
      target: { value: 'ada' },
    });
    await waitFor(() => expect(screen.getByRole('option', { name: /adapalene gel/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /adapalene gel/i }));
    expect(screen.getByText(/total/i).textContent).toContain('Rs 300');

    fireEvent.change(screen.getByPlaceholderText(/search medicine/i), {
      target: { value: 'Custom Balm' },
    });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /add "Custom Balm" as free text/i })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('option', { name: /add "Custom Balm" as free text/i }));
    expect(screen.getByText(/1 item\(s\) not priced/i)).toBeTruthy();
  });

  it('submit requires the immutability confirm, then POSTs the right body', async () => {
    api.post.mockResolvedValue({ id: 'rx1' });
    setup();
    await waitFor(() => expect(screen.getByPlaceholderText(/search medicine/i)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/search medicine/i), { target: { value: 'ada' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /adapalene gel/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /adapalene gel/i }));

    fireEvent.change(screen.getByLabelText(/dosage/i), { target: { value: '1x daily' } });
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '7 days' } });
    fireEvent.change(screen.getByLabelText(/instructions/i), { target: { value: 'after meals' } });

    fireEvent.click(screen.getByRole('button', { name: /submit prescription/i }));
    // Immutability confirmation step (doc 06 D-05 interaction):
    await waitFor(() => expect(screen.getByText(/cannot be edited/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /confirm & issue/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/appointments/a1/prescriptions', {
        items: [
          { medicineId: 'm1', dosage: '1x daily', duration: '7 days', instructions: 'after meals' },
        ],
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npm --workspace client test` → FAIL.

- [ ] **Step 3: Implement** (`client/src/modules/prescription/views/PrescriptionBuilder/PrescriptionBuilder.jsx`):

```jsx
// @ts-check
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { formatPkr, formatKarachi } from '../../../../lib/format/format.js';
import { useAppointment } from '../../../appointment/useAppointment.js';
import { usePrescription } from '../../usePrescription.js';

/** Keyboard-navigable medicine listbox (doc 06: custom listbox for D-05 medicine search). */
function MedicineSearch({ medicines, search, onSearch, onPick, onFreeText }) {
  const options = medicines.data?.data ?? [];
  const open = search.length >= 2;
  const [active, setActive] = useState(0);
  const count = options.length + 1; // +1 = free-text fallback row

  const pick = (i) => {
    if (i < options.length) onPick(options[i]);
    else onFreeText(search);
    onSearch('');
  };

  return (
    <div className="field">
      <label htmlFor="med-search">Add medicine</label>
      <input
        id="med-search"
        placeholder="Search medicine…"
        value={search}
        role="combobox"
        aria-expanded={open}
        aria-controls="med-listbox"
        onChange={(e) => {
          onSearch(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') setActive((a) => (a + 1) % count);
          else if (e.key === 'ArrowUp') setActive((a) => (a - 1 + count) % count);
          else if (e.key === 'Enter') {
            e.preventDefault();
            pick(active);
          }
        }}
      />
      {open && (
        <ul id="med-listbox" role="listbox" className="listbox">
          {options.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'option option--active' : 'option'}
              onClick={() => pick(i)}
            >
              {m.name}
              {m.genericName ? ` (${m.genericName})` : ''} — {formatPkr(m.unitPrice)}
            </li>
          ))}
          <li
            role="option"
            aria-selected={active === options.length}
            className={active === options.length ? 'option option--active' : 'option'}
            onClick={() => pick(options.length)}
          >
            Add "{search}" as free text (not priced)
          </li>
        </ul>
      )}
    </div>
  );
}

export function PrescriptionBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]); // {medicineId?, medicineName, price, dosage, duration, instructions}
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [confirming, setConfirming] = useState(false);

  const { detail } = useAppointment({ detailId: id });
  const { prescriptions, medicines, submit } = usePrescription({
    appointmentId: id,
    medicineSearch: search,
  });

  const a = detail.data;
  const existing = prescriptions.data?.data ?? [];
  const priced = rows.filter((r) => r.price !== null);
  const total = priced.reduce((sum, r) => sum + r.price, 0);
  const unpriced = rows.length - priced.length;
  const complete =
    rows.length > 0 && rows.every((r) => r.dosage && r.duration && r.instructions);

  const setRow = (i, field, value) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  const doSubmit = () =>
    submit.mutate(
      {
        appointmentId: id,
        body: {
          items: rows.map((r) =>
            r.medicineId
              ? {
                  medicineId: r.medicineId,
                  dosage: r.dosage,
                  duration: r.duration,
                  instructions: r.instructions,
                }
              : {
                  medicineName: r.medicineName,
                  dosage: r.dosage,
                  duration: r.duration,
                  instructions: r.instructions,
                },
          ),
          ...(notes ? { notes } : {}),
          ...(followUpDate ? { followUpDate } : {}),
        },
      },
      { onSuccess: () => navigate('/doctor') },
    );

  return (
    <SidebarLayout>
      <section className="section-card">
        <h1>Write prescription</h1>
        {detail.isPending && <p className="help">Loading…</p>}
        {a && (
          // Read-Only Patient-ID Header (P8): auto-pulled, never typed by the doctor.
          <div className="section-card">
            <strong>
              {a.forSelf
                ? a.patientName
                : `${a.subjectName} (age ${a.subjectAge}, ${a.subjectRelation})`}
            </strong>
            <div className="help">Consultation: {formatKarachi(a.slotStart)}</div>
          </div>
        )}

        <MedicineSearch
          medicines={medicines}
          search={search}
          onSearch={setSearch}
          onPick={(m) =>
            setRows((rs) => [
              ...rs,
              { medicineId: m.id, medicineName: m.name, price: m.unitPrice, dosage: '', duration: '', instructions: '' },
            ])
          }
          onFreeText={(name) =>
            setRows((rs) => [
              ...rs,
              { medicineName: name, price: null, dosage: '', duration: '', instructions: '' },
            ])
          }
        />

        {rows.map((r, i) => (
          <div key={`${r.medicineName}-${i}`} className="appt-row">
            <strong>{r.medicineName}</strong>{' '}
            {r.price === null ? (
              <span className="badge badge--neutral">not priced</span>
            ) : (
              formatPkr(r.price)
            )}
            <div className="field">
              <label htmlFor={`dosage-${i}`}>Dosage</label>
              <input
                id={`dosage-${i}`}
                value={r.dosage}
                onChange={(e) => setRow(i, 'dosage', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`duration-${i}`}>Duration</label>
              <input
                id={`duration-${i}`}
                value={r.duration}
                onChange={(e) => setRow(i, 'duration', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`instructions-${i}`}>Instructions</label>
              <input
                id={`instructions-${i}`}
                value={r.instructions}
                onChange={(e) => setRow(i, 'instructions', e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}

        <p>
          <strong>Total: {formatPkr(total)}</strong>
        </p>
        {unpriced > 0 && <p className="help">{unpriced} item(s) not priced</p>}

        <div className="field">
          <label htmlFor="notes">General notes (optional)</label>
          <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="follow-up">Follow-up date (optional)</label>
          <input
            id="follow-up"
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </div>

        {!confirming ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={!complete || submit.isPending}
            onClick={() => setConfirming(true)}
          >
            Submit prescription
          </button>
        ) : (
          // Immutability Rule (#4): explicit confirm before the irreversible write.
          <div className="section-card">
            <p>
              A submitted prescription cannot be edited. To fix an error you will need to issue a
              new prescription.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              disabled={submit.isPending}
              onClick={doSubmit}
            >
              Confirm & issue
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
              Back
            </button>
          </div>
        )}
        {submit.isError && <p className="help">Could not submit — please retry.</p>}

        {existing.length > 0 && (
          <>
            <h2>Previously issued for this appointment</h2>
            {existing.map((p) => (
              <div key={p.id} className="appt-row">
                {formatKarachi(p.issuedAt)} — {p.items.length} item(s)
              </div>
            ))}
          </>
        )}
      </section>
    </SidebarLayout>
  );
}
```

(If `components.css` lacks `.listbox`/`.option` classes, keep the classNames as written — they degrade to unstyled list items; styling polish is M4. Do NOT add new CSS files.)

- [ ] **Step 4: Add the route.** In `client/src/modules/prescription/prescription.routes.jsx`:

```jsx
import { PrescriptionBuilder } from './views/PrescriptionBuilder/PrescriptionBuilder.jsx';
// append to the returned array:
  {
    path: '/doctor/appointments/:id/prescribe',
    element: (
      <RoleRoute session={session} role="doctor">
        <PrescriptionBuilder />
      </RoleRoute>
    ),
  },
```

- [ ] **Step 5: Run client suite** → `npm --workspace client test` → 56 passed.

- [ ] **Step 6: Commit**

```bash
git add client/src/modules/prescription
git commit -m "feat(client): D-05 prescription builder — listbox search, running total, immutability confirm"
```

---

### Task 15: Client — D-02 write-prescription action + awaiting badge

**Files:**
- Modify: `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx`
- Modify: `client/src/modules/doctor/views/DoctorToday/DoctorToday.test.jsx`

- [ ] **Step 1: Write the failing tests** (append to `DoctorToday.test.jsx`, using its existing setup helpers/mocks — mirror how its current tests mock `api.get` for `/appointments?scope=history`):

```jsx
it('history: completed row gets Write prescription + Awaiting badge after 12h', async () => {
  const old = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  api.get.mockResolvedValue({
    data: [
      {
        id: 'a-old',
        slotStart: old,
        slotEnd: old,
        state: 'completed',
        forSelf: true,
        subjectName: null,
        patientName: 'P One',
        hasPrescription: false,
      },
      {
        id: 'a-done',
        slotStart: old,
        slotEnd: old,
        state: 'prescription_issued',
        forSelf: true,
        subjectName: null,
        patientName: 'P Two',
        hasPrescription: true,
      },
    ],
  });
  setup();
  fireEvent.click(screen.getByRole('button', { name: /history/i }));
  await waitFor(() => expect(screen.getByText('P One')).toBeTruthy());
  const links = screen.getAllByRole('link', { name: /write prescription/i });
  expect(links).toHaveLength(2); // completed AND prescription_issued (corrections)
  expect(links[0].getAttribute('href')).toContain('/doctor/appointments/a-old/prescribe');
  expect(screen.getAllByText(/awaiting prescription/i)).toHaveLength(1); // only the unprescribed one
});

it('history: completed row <12h old shows no Awaiting badge', async () => {
  const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  api.get.mockResolvedValue({
    data: [
      {
        id: 'a-new',
        slotStart: recent,
        slotEnd: recent,
        state: 'completed',
        forSelf: true,
        subjectName: null,
        patientName: 'P New',
        hasPrescription: false,
      },
    ],
  });
  setup();
  fireEvent.click(screen.getByRole('button', { name: /history/i }));
  await waitFor(() => expect(screen.getByText('P New')).toBeTruthy());
  expect(screen.queryByText(/awaiting prescription/i)).toBeNull();
});
```

- [ ] **Step 2: Run to verify they fail** — `npm --workspace client test` → 2 FAIL.

- [ ] **Step 3: Implement.** In `DoctorToday.jsx`, inside the `rows.map` render block, after the existing `{tab === 'history' && <span className="badge">{a.state}</span>}` line, add:

```jsx
              {(a.state === 'completed' || a.state === 'prescription_issued') && (
                <Link className="btn btn--secondary" to={`/doctor/appointments/${a.id}/prescribe`}>
                  Write prescription
                </Link>
              )}
              {a.state === 'completed' &&
                !a.hasPrescription &&
                Date.now() - new Date(a.slotEnd).getTime() > 12 * 3600 * 1000 && (
                  // awaiting_prescription derived condition (doc 02 §4.3) — doctor-facing nudge;
                  // the F12/A3 admin alert is Slice G.
                  <span className="badge badge--warning">Awaiting prescription</span>
                )}
```

- [ ] **Step 4: Run client suite** → `npm --workspace client test` → 58 passed.

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/doctor
git commit -m "feat(client): D-02 write-prescription action + awaiting-prescription badge (>12h)"
```

---

### Task 16: Canon-doc approval gate + status sweep + wrap-up

**Files (all gated):**
- Modify: `docs/specification/04-DATABASE_DOCUMENT.md`, `05-API_SPECIFICATION_DOCUMENT.md`, `12-SCOPE_FEATURE_TEST_CASES_DOCUMENT.md`, `13-PRODUCT_STATUS_TRACKER.md`, `14-INTEGRATION_CONTRACTS_DOCUMENT.md` (+ `08`/`11` if their structure requires)
- Modify: `agentChangeLogs/<session log>` + `agentChangeLogs/index.md`

- [ ] **Step 1: STOP — user approval required (CLAUDE.md).** Present the design doc's §9 table as the concrete edit list, one bullet per doc:
  - **04**: `notification_jobs` gains `dedupe_key` + widened unique `(appointment_id, type, dedupe_key)`.
  - **05**: five new endpoints (GET `/api/medicines`, POST/PATCH `/api/admin/medicines[...]`, POST/GET `/api/appointments/:id/prescriptions`); patient `scope=history`; `hasPrescription` field; confirm `completed→prescription_issued` is in the transition table.
  - **12**: new F08/F11 test cases (mirror the unit/integration coverage above).
  - **13**: M3 status sweep — modules 10/11 → Built, F08/F11 feature rows, views P-09/P-13/D-05 (also correct the stale M3-checklist screen IDs to doc 06 canon), M3 checklist, milestone row, revision footer.
  - **14**: §5 `prescription_ready` trigger column → "every prescription submit (dedupeKey = prescription id)".
  - **08**/**11**: only if doc 08 enumerates per-route access (add medicine/prescription rows) / if the user wants the dedupeKey decision recorded (suggest folding into ADR-27's record).
  **Do not edit any `docs/specification/` file until the user explicitly approves.**

- [ ] **Step 2: Apply approved edits** per doc 00's surgical-edit rule (only changed facts; version minor-bump + revision-footer row per doc).

- [ ] **Step 3: Final verification.**

Run: `npm test` → ~195 passed. `npm --workspace client test` → ~58 passed. `npm run lint` → clean. `npx prisma migrate status` → up to date. `npm run build:client` → builds, and the pdf-lib chunk is separate (look for a `pdf-lib`-named chunk in the Vite output — confirms the lazy import).

- [ ] **Step 4: Changelog + docs commit.** Update the session changelog (files table, decisions, verification evidence) and `agentChangeLogs/index.md`; commit docs separately:

```bash
git add docs/specification agentChangeLogs
git commit -m "docs(spec): Slice F canon sweep — outbox dedupeKey (04), prescription/medicine API (05), F08/F11 test cases (12), prescription_ready trigger (14), status sweep (13)"
```

---

## Post-plan notes for the executor

- **TDD discipline:** every task runs red before green; do not reorder steps within a task.
- **Surgical-change rule:** do not reformat or "improve" untouched code in the files you modify.
- **No push, no deploy, no new branch without explicit user approval** (CLAUDE.md).
- **Subagent changelog rule:** subagents must NOT create or edit anything under `agentChangeLogs/` — the controller owns the single session log.
- **Immutability by absence:** never add an update/delete function or route for prescriptions — its non-existence IS the spec (§3.3 #4).
- Test counts after each task are minimums from the 169/41 baseline; if other counts drift (e.g., an extra `it` block), green is the requirement, the number is a guide.
- PDF layout is deliberately plain (M4 owns visual polish); the JSON-in/bytes-out boundary is the contract.

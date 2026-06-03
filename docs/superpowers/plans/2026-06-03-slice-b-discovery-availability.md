# Slice B — Discovery & Availability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build doctor discovery (public listing + profile), doctor weekly availability with 30-minute slot generation, the three nav layouts, and seeded demo doctors — screens P-02 / P-03 / D-03.

**Architecture:** Express `model→controller→service` (thin controllers, Zod at edge, `requireRole` authz). Availability is stored as recurring weekly blocks; 30-min slots are **generated at read time** (never stored), converting `Asia/Karachi` wall-times to UTC with `date-fns-tz`. Frontend: TanStack Query for server cache, React Context for session (both from Slice A), three nav layouts, token-based components.

**Tech Stack:** Node + Express, Prisma 6.19 (PostgreSQL), Zod, **date-fns-tz** (server), Vitest + supertest, React 19 + react-router-dom 6, @tanstack/react-query, Vite.

**Design doc:** `docs/superpowers/specs/2026-06-03-slice-b-discovery-availability-design.md`
**Branch:** `feat/slice-b-discovery-availability` (already created off `main`).
**Session changelog:** `agentChangeLogs/2026-06-03-0407-slice-b-discovery-availability.md` (controller-owned; subagents must NOT edit `agentChangeLogs/` or `docs/specification/`).

---

## ⚠️ Governance gates (controller-owned, before coding)

Require user approval before editing any spec:
1. **doc 11** — **ADR-21**: adopt `date-fns-tz` server-side for `Asia/Karachi`↔UTC; client display uses native `Intl`. *(required)*
2. **doc 03** — one-line tech-stack note for `date-fns-tz`. *(minor)*
3. **doc 05** — add `BLOCK_HAS_BOOKINGS` to the §3.2 `409` examples. *(minor)*
4. **doc 13** — status sweep on completion (F02, F09, doctor/availability modules, frontend rows). *(required)*

---

## Phase 0 — Setup

### Task 0.1: Install date-fns-tz (server) + active-state constant

**Files:**
- Modify: `server/package.json` (dependency)
- Modify: `server/src/config/constants.js`

- [ ] **Step 1: Install date-fns-tz in the server workspace**

```bash
npm --workspace server install date-fns-tz
```

- [ ] **Step 2: Verify it installed (v3 exposes `fromZonedTime`)**

Run: `node -e "import('date-fns-tz').then(m=>console.log(typeof m.fromZonedTime, typeof m.formatInTimeZone))"`
Expected: `function function`. (If it prints `undefined`, the installed major is v2 — then use `zonedTimeToUtc`/`utcToZonedTime`; this plan assumes v3 `fromZonedTime`/`formatInTimeZone`.)

- [ ] **Step 3: Add the active-appointment state set to constants**

In `server/src/config/constants.js`, append:

```js
// States that occupy a slot (mirror the uniq_active_slot partial index). A slot with an
// appointment in any of these is NOT bookable / not regenerated as available.
export const ACTIVE_APPOINTMENT_STATES = [
  'slot_locked', 'confirmed', 'in_progress', 'completed', 'prescription_issued', 'cancelled_no_refund',
];
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json server/package.json server/src/config/constants.js
git commit -m "chore(server): add date-fns-tz + active-appointment state constant"
```

### Task 0.2: Seed demo doctors + availability

**Files:**
- Modify: `prisma/seed.js`

- [ ] **Step 1: Extend the seed with demo doctors**

Replace `prisma/seed.js` with:

```js
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../server/src/lib/password.js';

const prisma = new PrismaClient();

const DOCTORS = [
  { email: 'dr.ayesha@dermestha.dev', fullName: 'Dr. Ayesha Khan', phone: '03001112233', pmcNumber: 'PMC-1001', specialization: 'Acne & Pigmentation', fee: 250000, bio: 'Consultant dermatologist focused on acne and pigmentation.' },
  { email: 'dr.bilal@dermestha.dev', fullName: 'Dr. Bilal Ahmed', phone: '03004445566', pmcNumber: 'PMC-1002', specialization: 'Eczema & Psoriasis', fee: 300000, bio: 'Specialist in chronic inflammatory skin conditions.' },
];

// Mon/Wed/Fri 18:00–21:00 (weekday: 0=Sun..6=Sat).
const BLOCKS = [1, 3, 5].map((weekday) => ({ weekday, startTime: '18:00', endTime: '21:00' }));

async function main() {
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  await prisma.medicine.createMany({
    data: [
      { name: 'Isotretinoin', genericName: 'Isotretinoin', dosageForms: ['capsule'], unitPrice: 45000 },
      { name: 'Adapalene Gel', genericName: 'Adapalene', dosageForms: ['gel'], unitPrice: 30000 },
      { name: 'Clindamycin Lotion', genericName: 'Clindamycin', dosageForms: ['lotion'], unitPrice: 25000 },
    ],
    skipDuplicates: true,
  });

  const passwordHash = await hashPassword('Password123');
  for (const d of DOCTORS) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: {},
      create: { role: 'doctor', email: d.email, phone: d.phone, fullName: d.fullName, passwordHash, mustChangePassword: false },
    });
    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, pmcNumber: d.pmcNumber, specialization: d.specialization, fee: d.fee, bio: d.bio, isActive: true, status: 'active' },
    });
    const count = await prisma.availabilityBlock.count({ where: { doctorId: doctor.id } });
    if (count === 0) {
      await prisma.availabilityBlock.createMany({ data: BLOCKS.map((b) => ({ doctorId: doctor.id, ...b })) });
    }
  }

  console.log('Seed complete: settings + medicines + demo doctors.');
}
main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the seed**

Run: `npm run db:seed`
Expected: `Seed complete: settings + medicines + demo doctors.` (idempotent — safe to re-run).

- [ ] **Step 3: Verify the doctors exist**

Run: `node -e "import('@prisma/client').then(async({PrismaClient})=>{const p=new PrismaClient();console.log(await p.doctor.count({where:{isActive:true,status:'active'}}),'active doctors');await p.$disconnect();})"`
Expected: `2 active doctors`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.js
git commit -m "feat(seed): demo doctors + weekly availability"
```

---

## Phase 1 — Backend

### Task 1.1: Timezone helper

**Files:**
- Create: `server/src/lib/tz.js`
- Test: `server/src/lib/tz.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/tz.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { karachiWallTimeToUtc, karachiWeekday, KARACHI } from './tz.js';

describe('tz helper', () => {
  it('exposes the Asia/Karachi zone id', () => {
    expect(KARACHI).toBe('Asia/Karachi');
  });
  it('converts a Karachi wall time to the correct UTC instant (PKT = UTC+5)', () => {
    // 18:00 Karachi on 2026-06-15 == 13:00 UTC.
    const utc = karachiWallTimeToUtc('2026-06-15', '18:00');
    expect(utc.toISOString()).toBe('2026-06-15T13:00:00.000Z');
  });
  it('computes the weekday (0=Sun..6=Sat) for a Karachi date', () => {
    expect(karachiWeekday('2026-06-15')).toBe(1); // Monday
    expect(karachiWeekday('2026-06-14')).toBe(0); // Sunday
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tz`
Expected: FAIL — cannot find `./tz.js`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/tz.js`:

```js
// @ts-check
import { fromZonedTime } from 'date-fns-tz';

export const KARACHI = 'Asia/Karachi';

/**
 * Convert a Karachi wall time (date + "HH:mm") to a UTC Date instant.
 * @param {string} dateYMD "YYYY-MM-DD" @param {string} hhmm "HH:mm"
 */
export function karachiWallTimeToUtc(dateYMD, hhmm) {
  return fromZonedTime(`${dateYMD}T${hhmm}:00`, KARACHI);
}

/** Weekday (0=Sun..6=Sat) of a Karachi calendar date. Noon avoids any edge ambiguity. */
export function karachiWeekday(dateYMD) {
  return new Date(`${dateYMD}T12:00:00+05:00`).getUTCDay();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tz`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/tz.js server/src/lib/tz.test.js
git commit -m "feat(server): Asia/Karachi timezone helper (date-fns-tz)"
```

### Task 1.2: Shared DTOs

**Files:**
- Create: `shared/schemas/availability.js`
- Modify: `shared/schemas/index.js`

- [ ] **Step 1: Write the schemas**

Create `shared/schemas/availability.js`:

```js
// @ts-check
import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

export const availabilityBlockSchema = z
  .object({ weekday: z.number().int().min(0).max(6), startTime: hhmm, endTime: hhmm })
  .refine((b) => b.startTime < b.endTime, { message: 'startTime must be before endTime', path: ['endTime'] });

/** PUT /api/availability body: replace the doctor's whole weekly block set. */
export const availabilityReplaceSchema = z.object({ blocks: z.array(availabilityBlockSchema).max(50) });

export const doctorListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});
```

- [ ] **Step 2: Re-export from the seam**

Replace `shared/schemas/index.js` with:

```js
// @ts-check
// Shared Zod DTOs (client↔server).
export * from './auth.js';
export * from './availability.js';
```

- [ ] **Step 3: Verify load**

Run: `node -e "import('./shared/schemas/index.js').then(m=>console.log(Object.keys(m).join(',')))"`
Expected: includes `availabilityReplaceSchema, doctorListQuerySchema, slotsQuerySchema` (plus the auth schemas).

- [ ] **Step 4: Commit**

```bash
git add shared/schemas/availability.js shared/schemas/index.js
git commit -m "feat(shared): availability + doctor-list + slots DTOs"
```

### Task 1.3: availability.service

**Files:**
- Create: `server/src/services/availability.service.js`
- Test: `server/src/services/availability.service.test.js`

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/availability.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    doctor: { findUnique: vi.fn() },
    availabilityBlock: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    settings: { findUnique: vi.fn() },
    appointment: { findMany: vi.fn() },
    $transaction: vi.fn(async (ops) => Promise.all(ops)),
  },
}));

import { prisma } from '../lib/prisma.js';
import * as avail from './availability.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T06:00:00.000Z')); // 11:00 Karachi, Monday
  prisma.settings.findUnique.mockResolvedValue({ id: 1, minBookingLeadMinutes: 60 });
  prisma.appointment.findMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('generateSlots', () => {
  it('generates future 30-min slots within a block, after the lead-time, in UTC', async () => {
    // Monday block 18:00–19:00 Karachi → 13:00–14:00 UTC → two 30-min slots.
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '18:00', endTime: '19:00' }]);
    const slots = await avail.generateSlots('doc1', '2026-06-15');
    expect(slots).toEqual([
      { slotStart: '2026-06-15T13:00:00.000Z', slotEnd: '2026-06-15T13:30:00.000Z' },
      { slotStart: '2026-06-15T13:30:00.000Z', slotEnd: '2026-06-15T14:00:00.000Z' },
    ]);
  });

  it('excludes slots occupied by an active appointment', async () => {
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '18:00', endTime: '19:00' }]);
    prisma.appointment.findMany.mockResolvedValue([{ slotStart: new Date('2026-06-15T13:00:00.000Z') }]);
    const slots = await avail.generateSlots('doc1', '2026-06-15');
    expect(slots.map((s) => s.slotStart)).toEqual(['2026-06-15T13:30:00.000Z']);
  });

  it('filters out slots within the lead-time window', async () => {
    // now = 11:00 Karachi; lead 60min → earliest 12:00 Karachi (07:00 UTC). A 11:30 block start is filtered.
    prisma.settings.findUnique.mockResolvedValue({ id: 1, minBookingLeadMinutes: 60 });
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '11:30', endTime: '12:30' }]);
    const slots = await avail.generateSlots('doc1', '2026-06-15');
    expect(slots.map((s) => s.slotStart)).toEqual(['2026-06-15T07:00:00.000Z']); // only the 12:00 Karachi slot
  });
});

describe('replaceWeeklyBlocks', () => {
  it('rejects with BLOCK_HAS_BOOKINGS when an active future appointment would be orphaned', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'doc1' });
    prisma.appointment.findMany.mockResolvedValue([{ id: 'appt1', slotStart: new Date('2026-06-17T13:00:00.000Z') }]); // Wed 18:00 KHI
    // New blocks cover only Monday → Wednesday appointment is orphaned.
    await expect(avail.replaceWeeklyBlocks('user1', [{ weekday: 1, startTime: '18:00', endTime: '21:00' }]))
      .rejects.toMatchObject({ code: 'BLOCK_HAS_BOOKINGS', status: 409 });
    expect(prisma.availabilityBlock.deleteMany).not.toHaveBeenCalled();
  });

  it('replaces blocks when no active appointment is orphaned', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'doc1' });
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '18:00', endTime: '21:00' }]);
    await avail.replaceWeeklyBlocks('user1', [{ weekday: 1, startTime: '18:00', endTime: '21:00' }]);
    expect(prisma.availabilityBlock.deleteMany).toHaveBeenCalledWith({ where: { doctorId: 'doc1' } });
    expect(prisma.availabilityBlock.createMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- availability.service`
Expected: FAIL — cannot find `./availability.service.js`.

- [ ] **Step 3: Write the implementation**

Create `server/src/services/availability.service.js`:

```js
// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { karachiWallTimeToUtc, karachiWeekday, KARACHI } from '../lib/tz.js';
import { SLOT_GRANULARITY_MIN, ACTIVE_APPOINTMENT_STATES } from '../config/constants.js';

const SLOT_MS = SLOT_GRANULARITY_MIN * 60 * 1000;

export async function getWeeklyBlocks(doctorId) {
  const blocks = await prisma.availabilityBlock.findMany({
    where: { doctorId },
    select: { weekday: true, startTime: true, endTime: true },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });
  return blocks;
}

/** True if some block on the slot's Karachi weekday contains [time, time+30min). */
function blocksCoverSlot(blocks, slotStartUtc, dateYMD) {
  const weekday = karachiWeekday(dateYMD);
  const hhmm = formatInTimeZone(slotStartUtc, KARACHI, 'HH:mm');
  return blocks.some((b) => b.weekday === weekday && hhmm >= b.startTime && hhmm < b.endTime);
}

export async function generateSlots(doctorId, dateYMD) {
  const weekday = karachiWeekday(dateYMD);
  const blocks = await prisma.availabilityBlock.findMany({ where: { doctorId, weekday } });
  if (blocks.length === 0) return [];

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const leadMin = settings?.minBookingLeadMinutes ?? 60;
  const earliest = Date.now() + leadMin * 60 * 1000;

  /** @type {{slotStart: Date, slotEnd: Date}[]} */
  const candidates = [];
  for (const b of blocks) {
    let cur = karachiWallTimeToUtc(dateYMD, b.startTime).getTime();
    const end = karachiWallTimeToUtc(dateYMD, b.endTime).getTime();
    while (cur + SLOT_MS <= end) {
      candidates.push({ slotStart: new Date(cur), slotEnd: new Date(cur + SLOT_MS) });
      cur += SLOT_MS;
    }
  }

  const future = candidates.filter((s) => s.slotStart.getTime() >= earliest);
  if (future.length === 0) return [];

  const active = await prisma.appointment.findMany({
    where: { doctorId, state: { in: ACTIVE_APPOINTMENT_STATES }, slotStart: { in: future.map((s) => s.slotStart) } },
    select: { slotStart: true },
  });
  const taken = new Set(active.map((a) => a.slotStart.getTime()));

  return future
    .filter((s) => !taken.has(s.slotStart.getTime()))
    .map((s) => ({ slotStart: s.slotStart.toISOString(), slotEnd: s.slotEnd.toISOString() }));
}

export async function nextAvailableSlot(doctorId, days = 14) {
  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    const dateYMD = formatInTimeZone(d, KARACHI, 'yyyy-MM-dd');
    const slots = await generateSlots(doctorId, dateYMD); // eslint-disable-line no-await-in-loop
    if (slots.length > 0) return slots[0].slotStart;
  }
  return null;
}

export async function replaceWeeklyBlocks(userId, blocks) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor profile not found.', 404);

  const futureActive = await prisma.appointment.findMany({
    where: { doctorId: doctor.id, state: { in: ACTIVE_APPOINTMENT_STATES }, slotStart: { gt: new Date() } },
    select: { id: true, slotStart: true },
  });
  const orphans = futureActive.filter((a) => {
    const dateYMD = formatInTimeZone(a.slotStart, KARACHI, 'yyyy-MM-dd');
    return !blocksCoverSlot(blocks, a.slotStart, dateYMD);
  });
  if (orphans.length > 0) {
    throw new AppError('BLOCK_HAS_BOOKINGS', 'Cancel the affected bookings before changing this availability.', 409, {
      appointmentIds: orphans.map((o) => o.id),
    });
  }

  await prisma.$transaction([
    prisma.availabilityBlock.deleteMany({ where: { doctorId: doctor.id } }),
    prisma.availabilityBlock.createMany({ data: blocks.map((b) => ({ doctorId: doctor.id, ...b })) }),
  ]);
  return getWeeklyBlocks(doctor.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- availability.service`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/availability.service.js server/src/services/availability.service.test.js
git commit -m "feat(server): availability.service (slot generation + block guard)"
```

### Task 1.4: doctor.service

**Files:**
- Create: `server/src/services/doctor.service.js`
- Test: `server/src/services/doctor.service.test.js`

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/doctor.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { doctor: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock('./availability.service.js', () => ({ nextAvailableSlot: vi.fn(async () => null) }));

import { prisma } from '../lib/prisma.js';
import * as nav from './availability.service.js';
import * as doctor from './doctor.service.js';

beforeEach(() => vi.clearAllMocks());

describe('doctor.service', () => {
  it('listActiveDoctors returns card data + pagination and includes nextAvailableSlot', async () => {
    prisma.$transaction.mockResolvedValue([
      [{ id: 'd1', specialization: 'Acne', fee: 250000, photoUrl: null, user: { fullName: 'Dr A' } }],
      1,
    ]);
    nav.nextAvailableSlot.mockResolvedValue('2026-06-15T13:00:00.000Z');
    const out = await doctor.listActiveDoctors({ page: 1, pageSize: 20 });
    expect(out.page).toEqual({ number: 1, size: 20, total: 1 });
    expect(out.data[0]).toEqual({
      id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, photoUrl: null,
      nextAvailableSlot: '2026-06-15T13:00:00.000Z',
    });
  });

  it('getPublicDoctor returns an active doctor profile', async () => {
    prisma.doctor.findFirst.mockResolvedValue({ id: 'd1', specialization: 'Acne', fee: 250000, bio: 'b', photoUrl: null, user: { fullName: 'Dr A' } });
    const out = await doctor.getPublicDoctor('d1');
    expect(out).toEqual({ id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, bio: 'b', photoUrl: null });
  });

  it('getPublicDoctor throws 404 for a missing/inactive doctor (no existence leak)', async () => {
    prisma.doctor.findFirst.mockResolvedValue(null);
    await expect(doctor.getPublicDoctor('nope')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- doctor.service`
Expected: FAIL — cannot find `./doctor.service.js`.

- [ ] **Step 3: Write the implementation**

Create `server/src/services/doctor.service.js`:

```js
// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { nextAvailableSlot } from './availability.service.js';

const ACTIVE_WHERE = { isActive: true, status: 'active' };

export async function listActiveDoctors({ page, pageSize }) {
  const skip = (page - 1) * pageSize;
  const [rows, total] = await prisma.$transaction([
    prisma.doctor.findMany({
      where: ACTIVE_WHERE,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'asc' },
      select: { id: true, specialization: true, fee: true, photoUrl: true, user: { select: { fullName: true } } },
    }),
    prisma.doctor.count({ where: ACTIVE_WHERE }),
  ]);
  const data = await Promise.all(
    rows.map(async (d) => ({
      id: d.id,
      fullName: d.user.fullName,
      specialization: d.specialization,
      fee: d.fee,
      photoUrl: d.photoUrl,
      nextAvailableSlot: await nextAvailableSlot(d.id),
    })),
  );
  return { data, page: { number: page, size: pageSize, total } };
}

export async function getPublicDoctor(id) {
  const d = await prisma.doctor.findFirst({
    where: { id, ...ACTIVE_WHERE },
    select: { id: true, specialization: true, fee: true, bio: true, photoUrl: true, user: { select: { fullName: true } } },
  });
  if (!d) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  return { id: d.id, fullName: d.user.fullName, specialization: d.specialization, fee: d.fee, bio: d.bio, photoUrl: d.photoUrl };
}

/** Used by the availability route to enforce doctor-owns-:id. Returns the Doctor or null. */
export async function getDoctorByUserId(userId) {
  return prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- doctor.service`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/doctor.service.js server/src/services/doctor.service.test.js
git commit -m "feat(server): doctor.service (listing + public profile)"
```

### Task 1.5: Controllers + routes + wiring

**Files:**
- Create: `server/src/controllers/doctor.controller.js`
- Create: `server/src/routes/doctors.js`
- Create: `server/src/routes/availability.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Write the doctor controller**

Create `server/src/controllers/doctor.controller.js`:

```js
// @ts-check
import * as doctorService from '../services/doctor.service.js';
import * as availabilityService from '../services/availability.service.js';
import { AppError } from '../http/AppError.js';

export async function list(req, res, next) {
  try {
    res.json(await doctorService.listActiveDoctors(req.body /* parsed query, see route */));
  } catch (e) { next(e); }
}

export async function getOne(req, res, next) {
  try {
    res.json(await doctorService.getPublicDoctor(req.params.id));
  } catch (e) { next(e); }
}

export async function slots(req, res, next) {
  try {
    res.json({ data: await availabilityService.generateSlots(req.params.id, req.query.date) });
  } catch (e) { next(e); }
}

export async function getAvailability(req, res, next) {
  try {
    if (req.session.role === 'doctor') {
      const own = await doctorService.getDoctorByUserId(req.session.userId);
      if (!own || own.id !== req.params.id) throw new AppError('NOT_FOUND', 'Not found.', 404);
    }
    res.json({ blocks: await availabilityService.getWeeklyBlocks(req.params.id) });
  } catch (e) { next(e); }
}

export async function replaceAvailability(req, res, next) {
  try {
    res.json({ blocks: await availabilityService.replaceWeeklyBlocks(req.session.userId, req.body.blocks) });
  } catch (e) { next(e); }
}
```

- [ ] **Step 2: Write the routes**

Create `server/src/routes/doctors.js`:

```js
// @ts-check
import { Router } from 'express';
import * as c from '../controllers/doctor.controller.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/requireRole.js';
import { doctorListQuerySchema, slotsQuerySchema } from '../../../shared/schemas/index.js';

// Validate req.query into req.query (Zod) without a body. Small inline middleware.
const validateQuery = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(r.error);
  req.query = r.data;
  next();
};

export const doctorsRouter = Router();
// GET /api/doctors  (public, paginated)
doctorsRouter.get('/', validateQuery(doctorListQuerySchema), (req, res, next) => {
  req.body = req.query; // controller.list reads pagination from req.body for symmetry
  return c.list(req, res, next);
});
// GET /api/doctors/:id  (public)
doctorsRouter.get('/:id', c.getOne);
// GET /api/doctors/:id/slots?date=YYYY-MM-DD  (public)
doctorsRouter.get('/:id/slots', validateQuery(slotsQuerySchema), c.slots);
// GET /api/doctors/:id/availability  (doctor-own / admin)
doctorsRouter.get('/:id/availability', requireRole('doctor', 'admin'), c.getAvailability);
```

Create `server/src/routes/availability.js`:

```js
// @ts-check
import { Router } from 'express';
import * as c from '../controllers/doctor.controller.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/requireRole.js';
import { availabilityReplaceSchema } from '../../../shared/schemas/index.js';

export const availabilityRouter = Router();
// PUT /api/availability  (doctor; replaces own weekly blocks)
availabilityRouter.put('/', requireRole('doctor'), validate(availabilityReplaceSchema), c.replaceAvailability);
```

- [ ] **Step 3: Wire into the app**

In `server/src/index.js`, add imports next to the others:

```js
import { doctorsRouter } from './routes/doctors.js';
import { availabilityRouter } from './routes/availability.js';
```

Then mount them after the auth router and before the `/api` 404:

```js
  app.use('/api/auth', authRouter);
  app.use('/api/doctors', doctorsRouter);
  app.use('/api/availability', availabilityRouter);
  app.use('/api', healthRouter);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/doctor.controller.js server/src/routes/doctors.js server/src/routes/availability.js server/src/index.js
git commit -m "feat(server): doctor + availability routes/controllers wired"
```

### Task 1.6: Integration tests (real DB, seeded)

**Files:**
- Test: `server/src/test/discovery.integration.test.js`

- [ ] **Step 1: Ensure the DB is seeded**

Run: `npm run db:seed`
Expected: seed completes; ≥2 active doctors exist.

- [ ] **Step 2: Write the integration tests**

Create `server/src/test/discovery.integration.test.js`:

```js
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';
import { prisma } from '../lib/prisma.js';

const app = createApp();

describe('discovery + availability integration', () => {
  let doctorId;

  beforeAll(async () => {
    const d = await prisma.doctor.findFirst({ where: { isActive: true, status: 'active' } });
    doctorId = d?.id;
  });

  it('GET /api/doctors lists active doctors with the paginated envelope', async () => {
    const res = await request(app).get('/api/doctors');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.page).toMatchObject({ number: 1, size: 20 });
    expect(res.body.data[0]).toHaveProperty('nextAvailableSlot');
    expect(res.body.data[0]).not.toHaveProperty('email'); // safe card shape
  });

  it('GET /api/doctors/:id returns a public profile; unknown id is 404', async () => {
    const ok = await request(app).get(`/api/doctors/${doctorId}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: doctorId });
    const missing = await request(app).get('/api/doctors/does-not-exist');
    expect(missing.status).toBe(404);
  });

  it('GET /api/doctors/:id/slots returns generated slots for a date', async () => {
    // Pick a near-future Monday (seed blocks are Mon/Wed/Fri).
    const res = await request(app).get(`/api/doctors/${doctorId}/slots`).query({ date: nextMonday() });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length) {
      expect(res.body.data[0]).toHaveProperty('slotStart');
      expect(res.body.data[0]).toHaveProperty('slotEnd');
    }
  });

  it('availability requires auth (no session → 401)', async () => {
    const res = await request(app).put('/api/availability').send({ blocks: [] });
    expect(res.status).toBe(401);
  });

  afterAll(async () => { await prisma.$disconnect(); });
});

function nextMonday() {
  const d = new Date();
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== 1);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Run the integration tests**

Run: `npm test -- discovery.integration`
Expected: PASS (4 tests).

- [ ] **Step 4: Run the full server suite (no regressions)**

Run: `npm test`
Expected: all server suites green (Slice A 44 + the new Slice B suites).

- [ ] **Step 5: Commit**

```bash
git add server/src/test/discovery.integration.test.js
git commit -m "test(server): discovery + availability integration"
```

---

## Phase 2 — Frontend

> **CSS:** use the confirmed classes in `components.css`: `.doc-card`/`.doc-card__img/__body/__name/__spec/__foot/__fee/__slot`, `.pmc-badge`, `.avatar`, `.slot`/`.slot--selected/--disabled`, `.empty`/`.empty__icon`, `.topnav`/`.topnav__inner/__links`, `.brand`/`.brand__mark/__word`, `.tabbar`/`.tabbar__item`, `.sidebar`/`.sidebar__link`, `.content`, `.container`, `.section-card`. Token roles only — no raw hex.

### Task 2.1: Formatting util

**Files:**
- Create: `client/src/lib/format.js`
- Test: `client/src/lib/format.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/format.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { formatPkr, formatKarachi } from './format.js';

describe('format', () => {
  it('formats integer paisa as PKR rupees with separators', () => {
    expect(formatPkr(250000)).toBe('Rs 2,500');
    expect(formatPkr(0)).toBe('Rs 0');
  });
  it('formats a UTC ISO instant in Asia/Karachi', () => {
    // 13:00 UTC → 18:00 Karachi.
    const s = formatKarachi('2026-06-15T13:00:00.000Z');
    expect(s).toMatch(/6:00|18:00/); // depends on hour cycle; both acceptable
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- format`
Expected: FAIL — cannot find `./format.js`.

- [ ] **Step 3: Write the implementation**

Create `client/src/lib/format.js`:

```js
// @ts-check
const PKR = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

/** Integer paisa → "Rs 2,500". */
export const formatPkr = (paisa) => `Rs ${PKR.format(Math.round((paisa ?? 0) / 100))}`;

const KHI = new Intl.DateTimeFormat('en-PK', {
  timeZone: 'Asia/Karachi', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});

/** UTC ISO → human string rendered in Asia/Karachi. */
export const formatKarachi = (iso) => (iso ? KHI.format(new Date(iso)) : '');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- format`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/format.js client/src/lib/format.test.jsx
git commit -m "feat(client): formatPkr + formatKarachi (native Intl)"
```

### Task 2.2: Nav layouts

**Files:**
- Create: `client/src/layouts/PatientLayout.jsx`
- Create: `client/src/layouts/SidebarLayout.jsx`

- [ ] **Step 1: Write PatientLayout**

Create `client/src/layouts/PatientLayout.jsx`:

```jsx
// @ts-check
import { Link, NavLink } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';

export function PatientLayout({ children }) {
  const { session } = useSession();
  return (
    <>
      <header className="topnav">
        <div className="topnav__inner container">
          <Link to="/" className="brand">
            <span className="brand__mark" />
            <span className="brand__word">Dermestha</span>
          </Link>
          <nav className="topnav__links">
            <NavLink to="/">Browse</NavLink>
            {session ? <NavLink to="/appointments">Appointments</NavLink> : <Link to="/login" className="btn btn--secondary btn--sm">Log in</Link>}
          </nav>
        </div>
      </header>
      <main className="container" style={{ padding: 'var(--sp-6) var(--sp-4) 80px' }}>{children}</main>
      {session && (
        <nav className="tabbar only-mobile">
          <NavLink to="/" className="tabbar__item">Browse</NavLink>
          <NavLink to="/appointments" className="tabbar__item">Appointments</NavLink>
          <NavLink to="/profile" className="tabbar__item">Profile</NavLink>
        </nav>
      )}
    </>
  );
}
```

- [ ] **Step 2: Write SidebarLayout**

Create `client/src/layouts/SidebarLayout.jsx`:

```jsx
// @ts-check
import { NavLink } from 'react-router-dom';

const DOCTOR_LINKS = [
  { to: '/doctor', label: 'Today', end: true },
  { to: '/doctor/availability', label: 'Availability' },
  { to: '/doctor/history', label: 'History' },
];

export function SidebarLayout({ links = DOCTOR_LINKS, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav className="sidebar">
        <div className="brand" style={{ marginBottom: 'var(--sp-6)' }}>
          <span className="brand__mark" />
          <span className="brand__word">Dermestha</span>
        </div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="sidebar__link">{l.label}</NavLink>
        ))}
      </nav>
      <div className="content">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/layouts/PatientLayout.jsx client/src/layouts/SidebarLayout.jsx
git commit -m "feat(client): patient + sidebar nav layouts"
```

### Task 2.3: DoctorCard + SlotButton

**Files:**
- Create: `client/src/components/DoctorCard.jsx`
- Create: `client/src/components/SlotButton.jsx`
- Test: `client/src/components/discovery-components.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/components/discovery-components.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DoctorCard } from './DoctorCard.jsx';

describe('DoctorCard', () => {
  it('renders name, specialization, formatted fee, and next-slot', () => {
    render(
      <MemoryRouter>
        <DoctorCard doctor={{ id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, photoUrl: null, nextAvailableSlot: '2026-06-15T13:00:00.000Z' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dr A')).toBeTruthy();
    expect(screen.getByText('Acne')).toBeTruthy();
    expect(screen.getByText('Rs 2,500')).toBeTruthy();
  });
  it('shows a no-availability hint when nextAvailableSlot is null', () => {
    render(
      <MemoryRouter>
        <DoctorCard doctor={{ id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, photoUrl: null, nextAvailableSlot: null }} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no slots/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- discovery-components`
Expected: FAIL — cannot find `./DoctorCard.jsx`.

- [ ] **Step 3: Write the components**

Create `client/src/components/DoctorCard.jsx`:

```jsx
// @ts-check
import { Link } from 'react-router-dom';
import { formatPkr, formatKarachi } from '../lib/format.js';

export function DoctorCard({ doctor }) {
  return (
    <Link to={`/doctors/${doctor.id}`} className="doc-card" style={{ textDecoration: 'none', display: 'block' }}>
      <div className="doc-card__img">
        {doctor.photoUrl
          ? <img src={doctor.photoUrl} alt={doctor.fullName} />
          : <div className="avatar avatar--lg" style={{ width: '100%', height: '100%', borderRadius: 0, display: 'grid', placeItems: 'center' }}>{initials(doctor.fullName)}</div>}
      </div>
      <div className="doc-card__body">
        <h3 className="doc-card__name">{doctor.fullName}</h3>
        <p className="doc-card__spec">{doctor.specialization}</p>
        <div className="doc-card__foot">
          <span className="doc-card__fee">{formatPkr(doctor.fee)}</span>
          <span className="doc-card__slot">{doctor.nextAvailableSlot ? `Next: ${formatKarachi(doctor.nextAvailableSlot)}` : 'No slots'}</span>
        </div>
      </div>
    </Link>
  );
}

function initials(name) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
```

Create `client/src/components/SlotButton.jsx`:

```jsx
// @ts-check
import { formatKarachi } from '../lib/format.js';

export function SlotButton({ slot, selected, onSelect }) {
  const cls = `slot${selected ? ' slot--selected' : ''}`;
  return (
    <button type="button" className={cls} onClick={() => onSelect(slot)}>
      {formatKarachi(slot.slotStart)}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- discovery-components`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/DoctorCard.jsx client/src/components/SlotButton.jsx client/src/components/discovery-components.test.jsx
git commit -m "feat(client): DoctorCard + SlotButton"
```

### Task 2.4: P-02 Doctor listing

**Files:**
- Create: `client/src/views/DoctorListing.jsx`
- Test: `client/src/views/DoctorListing.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/views/DoctorListing.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorListing } from './DoctorListing.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: null }) }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><DoctorListing /></MemoryRouter></QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-02 Doctor listing', () => {
  it('renders a card per active doctor', async () => {
    api.get.mockResolvedValue({ data: [
      { id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, photoUrl: null, nextAvailableSlot: null },
      { id: 'd2', fullName: 'Dr B', specialization: 'Eczema', fee: 300000, photoUrl: null, nextAvailableSlot: null },
    ], page: { number: 1, size: 20, total: 2 } });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByText('Dr B')).toBeTruthy();
  });
  it('shows an empty state when there are no doctors', async () => {
    api.get.mockResolvedValue({ data: [], page: { number: 1, size: 20, total: 0 } });
    setup();
    await waitFor(() => expect(screen.getByText(/no doctors/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- DoctorListing`
Expected: FAIL — cannot find `./DoctorListing.jsx`.

- [ ] **Step 3: Write the view**

Create `client/src/views/DoctorListing.jsx`:

```jsx
// @ts-check
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { PatientLayout } from '../layouts/PatientLayout.jsx';
import { DoctorCard } from '../components/DoctorCard.jsx';

export function DoctorListing() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['doctors', 1],
    queryFn: () => api.get('/doctors?page=1&pageSize=20'),
  });

  return (
    <PatientLayout>
      <h1>Find a dermatologist</h1>
      {isPending && <p className="help">Loading doctors…</p>}
      {isError && <p className="error-text">Could not load doctors. Please try again.</p>}
      {data && data.data.length === 0 && (
        <div className="empty"><p>No doctors are available right now.</p></div>
      )}
      {data && data.data.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--sp-4)', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', marginTop: 'var(--sp-5)' }}>
          {data.data.map((d) => <DoctorCard key={d.id} doctor={d} />)}
        </div>
      )}
    </PatientLayout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- DoctorListing`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/views/DoctorListing.jsx client/src/views/DoctorListing.test.jsx
git commit -m "feat(client): P-02 doctor listing"
```

### Task 2.5: P-03 Doctor profile

**Files:**
- Create: `client/src/views/DoctorProfile.jsx`
- Test: `client/src/views/DoctorProfile.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/views/DoctorProfile.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorProfile } from './DoctorProfile.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: null }) }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/doctors/d1']}>
        <Routes><Route path="/doctors/:id" element={<DoctorProfile />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-03 Doctor profile', () => {
  it('renders the profile and available slots', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/doctors/d1') return Promise.resolve({ id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, bio: 'Bio', photoUrl: null });
      return Promise.resolve({ data: [{ slotStart: '2026-06-15T13:00:00.000Z', slotEnd: '2026-06-15T13:30:00.000Z' }] });
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByText('Rs 2,500')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- DoctorProfile`
Expected: FAIL — cannot find `./DoctorProfile.jsx`.

- [ ] **Step 3: Write the view**

Create `client/src/views/DoctorProfile.jsx`:

```jsx
// @ts-check
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { PatientLayout } from '../layouts/PatientLayout.jsx';
import { SlotButton } from '../components/SlotButton.jsx';
import { formatPkr } from '../lib/format.js';

function todayKarachiYMD() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function DoctorProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [date] = useState(todayKarachiYMD());

  const doctor = useQuery({ queryKey: ['doctor', id], queryFn: () => api.get(`/doctors/${id}`) });
  const slots = useQuery({ queryKey: ['slots', id, date], queryFn: () => api.get(`/doctors/${id}/slots?date=${date}`) });

  if (doctor.isError) return <PatientLayout><p className="error-text">Doctor not found.</p></PatientLayout>;

  return (
    <PatientLayout>
      {doctor.data && (
        <section className="section-card">
          <h1>{doctor.data.fullName}</h1>
          <p className="doc-card__spec">{doctor.data.specialization}</p>
          <p>{doctor.data.bio}</p>
          <p className="doc-card__fee">{formatPkr(doctor.data.fee)}</p>
        </section>
      )}
      <section className="section-card">
        <h2>Available today</h2>
        {slots.isPending && <p className="help">Loading slots…</p>}
        {slots.data && slots.data.data.length === 0 && <p className="help">No slots available today.</p>}
        {slots.data && slots.data.data.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            {slots.data.data.map((s) => (
              <SlotButton key={s.slotStart} slot={s} selected={false} onSelect={() => navigate(`/book/${id}?slot=${encodeURIComponent(s.slotStart)}`)} />
            ))}
          </div>
        )}
      </section>
    </PatientLayout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- DoctorProfile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/views/DoctorProfile.jsx client/src/views/DoctorProfile.test.jsx
git commit -m "feat(client): P-03 doctor profile with slot display"
```

### Task 2.6: D-03 Availability grid

**Files:**
- Create: `client/src/views/AvailabilityGrid.jsx`
- Test: `client/src/views/AvailabilityGrid.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/views/AvailabilityGrid.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AvailabilityGrid } from './AvailabilityGrid.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><AvailabilityGrid /></MemoryRouter></QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('D-03 Availability grid', () => {
  it('loads existing blocks and saves an edit via PUT', async () => {
    api.get.mockResolvedValue({ blocks: [{ weekday: 1, startTime: '18:00', endTime: '21:00' }] });
    api.put.mockResolvedValue({ blocks: [] });
    setup();
    await waitFor(() => expect(screen.getByRole('button', { name: /save/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/availability', expect.objectContaining({ blocks: expect.any(Array) })));
  });
});
```

Note: this test requires an `api.put` helper — add it in Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- AvailabilityGrid`
Expected: FAIL — cannot find `./AvailabilityGrid.jsx`.

- [ ] **Step 3: Add `put` to the apiClient, then write the view**

In `client/src/lib/apiClient.js`, add a `put` method to the exported `api`:

```js
export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
};
```

Create `client/src/views/AvailabilityGrid.jsx`:

```jsx
// @ts-check
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { useSession } from '../lib/session.jsx';
import { SidebarLayout } from '../layouts/SidebarLayout.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 15 }, (_, i) => 8 + i); // 08:00–22:00

const key = (weekday, hour) => `${weekday}:${hour}`;

// Expand stored blocks into a set of selected (weekday,hour) cells (hour granularity for the editor).
function blocksToCells(blocks) {
  const set = new Set();
  for (const b of blocks) {
    const start = parseInt(b.startTime.slice(0, 2), 10);
    const end = parseInt(b.endTime.slice(0, 2), 10);
    for (let h = start; h < end; h += 1) set.add(key(b.weekday, h));
  }
  return set;
}

// Collapse selected cells back into contiguous hourly blocks.
function cellsToBlocks(cells) {
  const blocks = [];
  for (let d = 0; d < 7; d += 1) {
    let runStart = null;
    for (let h = 8; h <= 23; h += 1) {
      const on = cells.has(key(d, h));
      if (on && runStart === null) runStart = h;
      if ((!on || h === 23) && runStart !== null) {
        const endH = on && h === 23 ? 24 : h;
        blocks.push({ weekday: d, startTime: `${String(runStart).padStart(2, '0')}:00`, endTime: `${String(endH).padStart(2, '0')}:00` });
        runStart = null;
      }
    }
  }
  return blocks;
}

export function AvailabilityGrid() {
  const { session } = useSession();
  const qc = useQueryClient();
  const [cells, setCells] = useState(new Set());
  const { data, isPending } = useQuery({ queryKey: ['availability'], queryFn: () => api.get(`/doctors/${session?.doctorId ?? 'me'}/availability`).catch(() => api.get('/doctors/me/availability')) });

  // NOTE: availability is read via the doctor's own id; see Step 4 for the route the doctor uses.
  useEffect(() => { if (data?.blocks) setCells(blocksToCells(data.blocks)); }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/availability', { blocks: cellsToBlocks(cells) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability'] }),
  });

  const toggle = (d, h) => setCells((prev) => {
    const next = new Set(prev);
    const k = key(d, h);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  return (
    <SidebarLayout>
      <h1>Weekly availability</h1>
      {isPending && <p className="help">Loading…</p>}
      {save.isError && <Alert variant="danger">{save.error?.code === 'BLOCK_HAS_BOOKINGS' ? 'Cancel the affected bookings before changing these hours.' : 'Could not save availability.'}</Alert>}
      {save.isSuccess && <Alert variant="success">Availability saved.</Alert>}
      <div style={{ overflowX: 'auto', margin: 'var(--sp-4) 0' }}>
        <table className="table">
          <thead><tr><th>Hour</th>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <td>{String(h).padStart(2, '0')}:00</td>
                {DAYS.map((_, d) => (
                  <td key={d}>
                    <button
                      type="button"
                      aria-label={`${DAYS[d]} ${h}:00`}
                      onClick={() => toggle(d, h)}
                      className={cells.has(key(d, h)) ? 'slot slot--selected' : 'slot'}
                      style={{ width: 28, height: 28, minHeight: 0, padding: 0 }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={() => save.mutate()} isLoading={save.isPending}>Save availability</Button>
    </SidebarLayout>
  );
}
```

> **Doctor's own availability id:** the doctor reads their own blocks. Since `/me` is not a route, resolve the doctor's `doctorId` from a `useSession` value. **In Step 4, extend `GET /api/auth/me` and the session to include `doctorId` for doctor sessions** so the grid can call `GET /api/doctors/:doctorId/availability`. (This avoids a `/me` alias.)

- [ ] **Step 4: Expose `doctorId` on the doctor session**

This is a small backend addition so D-03 can read its own availability by id.

In `server/src/services/auth.service.js`, change `toSafeUser` to include the doctor id when present (the `getById`/login paths already fetch the user; include the doctor relation):

```js
// In login(): fetch with the doctor relation id.
const user = await prisma.user.findUnique({ where: { email }, include: { doctor: { select: { id: true } } } });
// ...
return toSafeUser(user);

// getById():
const user = await prisma.user.findUnique({ where: { id }, include: { doctor: { select: { id: true } } } });

// toSafeUser:
const toSafeUser = (u) => ({ id: u.id, role: u.role, fullName: u.fullName, mustChangePassword: u.mustChangePassword, ...(u.doctor ? { doctorId: u.doctor.id } : {}) });
```

Update `server/src/services/auth.service.test.js` expectations where the returned shape is asserted for a doctor (add `doctorId` when the mock includes a `doctor`), and the integration `/me` test stays valid (patients have no `doctorId`).

Then in `AvailabilityGrid.jsx` use `session.doctorId` directly:

```jsx
const { data, isPending } = useQuery({
  queryKey: ['availability', session?.doctorId],
  queryFn: () => api.get(`/doctors/${session.doctorId}/availability`),
  enabled: Boolean(session?.doctorId),
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace client test -- AvailabilityGrid`
Then: `npm test -- auth.service` (confirm the `doctorId` shape change is green)
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/AvailabilityGrid.jsx client/src/lib/apiClient.js server/src/services/auth.service.js server/src/services/auth.service.test.js client/src/views/AvailabilityGrid.test.jsx
git commit -m "feat: D-03 availability grid + expose doctorId on doctor session"
```

### Task 2.7: Routing

**Files:**
- Modify: `client/src/routes.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add the new routes**

In `client/src/routes.jsx`, import and add the discovery routes (keep the auth routes):

```jsx
import { DoctorListing } from './views/DoctorListing.jsx';
import { DoctorProfile } from './views/DoctorProfile.jsx';
import { AvailabilityGrid } from './views/AvailabilityGrid.jsx';
// ...existing auth imports...

export const routes = [
  { path: '/signup', element: <SignUp /> },
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/doctor/change-password', element: <ChangePassword /> },
  { path: '/doctors/:id', element: <DoctorProfile /> },
];
```

- [ ] **Step 2: Make `/` the public listing and guard D-03**

In `client/src/App.jsx`, replace the `Placeholder` for `/` with the listing, and add the doctor availability route guarded by `RoleRoute`:

```jsx
import { Routes, Route } from 'react-router-dom';
import { routes } from './routes.jsx';
import { useSession } from './lib/session.jsx';
import { RoleRoute } from './lib/RoleRoute.jsx';
import { DoctorListing } from './views/DoctorListing.jsx';
import { AvailabilityGrid } from './views/AvailabilityGrid.jsx';

function Placeholder({ label }) {
  const { logout } = useSession();
  return (
    <main style={{ maxWidth: 600, margin: '64px auto', padding: 24 }}>
      <h1 style={{ color: 'var(--color-primary)' }}>{label}</h1>
      <p style={{ color: 'var(--color-text-body)' }}>Coming in a later slice.</p>
      <button className="btn btn--secondary" onClick={() => logout()}>Log out</button>
    </main>
  );
}

export function AppRoutes() {
  const { session, loading } = useSession();
  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <Routes>
      <Route path="/" element={<DoctorListing />} />
      {routes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
      <Route path="/doctor/availability" element={<RoleRoute session={session} role="doctor"><AvailabilityGrid /></RoleRoute>} />
      <Route path="/doctor" element={<Placeholder label="Doctor — Today" />} />
      <Route path="/admin" element={<Placeholder label="Admin panel" />} />
      <Route path="*" element={<Placeholder label="Dermestha" />} />
    </Routes>
  );
}
```

> Note: the Slice-A `/doctor/change-password` route is still served via the `routes` array; it appears before the catch-all. The `RoleRoute` props match its Slice-A signature (`{ session, role, children }`).

- [ ] **Step 3: Run the full client suite + build**

Run: `npm --workspace client test`
Expected: all client suites green (Slice A + Slice B).

Run: `npm --workspace client run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/routes.jsx client/src/App.jsx
git commit -m "feat(client): wire discovery routes; / = public listing; guard D-03"
```

---

## Phase 3 — Verification

### Task 3.1: Full suite + lint/format

- [ ] **Step 1: Server + client suites**

Run: `npm test` (server) then `npm --workspace client test` (client)
Expected: all green — Slice A + Slice B.

- [ ] **Step 2: Build**

Run: `npm --workspace client run build`
Expected: success.

- [ ] **Step 3: Prettier-normalize the new files**

Run: `npx prettier --write "server/src/**/*.js" "client/src/**/*.{js,jsx}" "shared/**/*.js" "prisma/seed.js"`
Then re-run both suites to confirm formatting didn't break anything.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "style(slice-b): prettier-normalize discovery/availability files"
```

---

## Self-review notes (author)

- **Spec coverage:** F02.01 listing active-only + card fields + next-slot (Tasks 1.4/2.3/2.4); F02.02 profile→book entry (2.5, Book→placeholder); F09.01 weekly grid + 30-min generation + recurring + block-lock guard (1.3/2.6); doc-05 routes (1.5); lead-time filter + Karachi correctness (1.1/1.3); layouts (2.2). ✅
- **Type consistency:** card shape `{id, fullName, specialization, fee, photoUrl, nextAvailableSlot}` and slot shape `{slotStart, slotEnd}` are used identically across service, controller, and views. `api.put` added in Task 2.6 before first use.
- **Governance:** ADR-21 + doc 03 + doc 05 (BLOCK_HAS_BOOKINGS) before code; doc 13 sweep after.
- **date-fns-tz v3 assumption** (`fromZonedTime`/`formatInTimeZone`) verified in Task 0.1 Step 2; fall back to v2 names if needed.
- **Out of scope:** booking lock/pay (Slice C), admin onboarding + P-01 (M4).
```

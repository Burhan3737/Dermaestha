# Slice H · S7 — Mock-Adapter Playwright E2E Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable, deterministic Playwright E2E harness (root `e2e/`) that drives the 6 Critical journeys (J1–J6) against the mock/dev adapters (`PAYMENT_PROVIDER=mock`, `VIDEO_PROVIDER=mock`, `EMAIL_PROVIDER=console`, `NODE_ENV=development`), with all 6 specs green via `npm run test:e2e`.

**Architecture:** A root-level (non-workspace) Playwright install drives the built SPA served by the Express server. `playwright.config.js` uses `webServer` to build the client and start the server with the mock env. `e2e/global-setup.js` seeds **namespaced, isolated** test data via Prisma (idempotent reset of only `e2e.*@dermestha.test` rows). Time-dependent flows are deterministic by **seeding appointments at controlled `slotStart` offsets** and firing the `/dev/worker/evaluate` trigger — no wall-clock waits. UI flows are driven with role/label/text selectors (no `data-testid` needed); state-machine outcomes are asserted by reading the DB directly via a Prisma helper shared with global-setup.

**Tech Stack:** `@playwright/test` (Chromium), Prisma (`@prisma/client` 6.x), Node 22 (`--env-file`), Express + React (Vite build), PostgreSQL.

**HARD constraints (this plan + any subagent):** Do NOT create/edit/delete anything under `agentChangeLogs/`. Do NOT edit/commit the design specs (`docs/superpowers/specs/`) or canonical specs (`docs/specification/` 00–15). Do NOT push or merge. Do NOT stage the pre-existing `CLAUDE.md` modification.

---

## Key facts established during research (do not re-derive)

- **Routes (client):** `/signup`, `/login`, `/doctor/change-password`, `/browse`, `/doctors/:id`, `/book/:id?slot=ISO`, `/pay/return?appt=ID`, `/appointments`, `/appointments/:id/prescriptions`, `/doctor/appointments/:id/prescribe`, `/video/:id` (and `/video/:id/ready`), `/admin/doctors`.
- **API client** posts to `/api<path>` with same-origin cookies (`credentials` default include via same-origin fetch). Session cookie `dermestha.sid`.
- **Login routing:** `POST /api/auth/login` → on `mustChangePassword` Login navigates to `/doctor/change-password`; else to `{patient:'/browse', doctor:'/doctor', admin:'/admin'}`.
- **Signup:** `POST /api/auth/signup {fullName,email,phone,password,tosAccepted:true}` → patient session + navigate `/browse`. ToS checkbox `#tos`; submit disabled until checked.
- **Booking:** profile shows **today's** Karachi slots only (`GET /doctors/:id/slots?date=YYYY-MM-DD`). Slot button label = `formatKarachi(slotStart)`. Clicking → `/book/:id?slot=...`. "Confirm & Pay" → `POST /appointments/lock` then `POST /appointments/:id/pay` → `{redirectUrl}` → `window.location.href` → `/dev/checkout?ref=...`.
- **Dev checkout:** `/dev/checkout` page has `Pay` (value `success`) and `Fail` (value `failed`) submit buttons → `POST /dev/payment/complete` → builds signed IPN → real `verifyWebhook`+`processWebhook` → redirect `/pay/return?appt=ID`.
- **payment.success** → appointment `slot_locked → confirmed`, `feeAtBooking` snapshot, payment `success`. **payment.failed** → **deletes** the `slot_locked` appointment + payment `failed` → PaymentReturn `GET /appointments/:id` 404 → shows **"Payment did not complete"**.
- **Video (mock):** `GET /api/appointments/:id/video-token` returns `joinSimUrl:'/dev/video/join'` when window open + state in {confirmed,in_progress}. VideoRoom auto-fires `POST /dev/video/join {appointmentId}` (role from session) → `recordJoinFromDailyEvent` sets `doctorJoinedAt`/`patientJoinedAt` (first-join wins). Window = `slotStart-10m … slotEnd+5m`.
- **Evaluation worker** `evaluateDueAppointments(now)` (also fired by `POST /dev/worker/evaluate`): `confirmed & slotStart<=now → in_progress`; for `in_progress`: at `slotEnd+5m` both-joined → `completed`, else `resolveNoShow`; at `slotStart+15m` (grace) if not both-joined → `resolveNoShow`. `resolveNoShow`: `!doctorJoinedAt → doctor_no_show` else `patient_no_show`. One tick runs activate-then-resolve, so a fully-past confirmed appt resolves in a single trigger.
- **Prescription:** `POST /api/appointments/:id/prescriptions {items:[{medicineId|medicineName,dosage,duration,instructions}],notes?,followUpDate?}`; appointment must be `completed` (or `prescription_issued`); `completed → prescription_issued`. Builder at `/doctor/appointments/:id/prescribe`: medicine combobox `#med-search` (open at ≥2 chars; `role=option` rows), per-row inputs `#dosage-0/#duration-0/#instructions-0`, "Submit prescription" → "Confirm & issue". Patient view `/appointments/:id/prescriptions`: card with "Download PDF" button.
- **Cancel/refund:** `POST /api/appointments/:id/cancel`. Patient ≥2h before slot → `cancelled_refunded` (refund initiated); <2h → `cancelled_no_refund`. `GET /api/appointments/:id` returns `refundQuote {amountPaid, gatewayFee, refund}` when `confirmed`; quote derives from the Payment row (must be seeded). Upcoming list `.appt-row` shows "Cancel" when `state==='confirmed'`; CancelModal shows "Refund: …" + "Cancel & refund" (≥2h) or "No refund available…" + "Cancel anyway" (<2h).
- **Role gate:** client `RoleRoute` redirects wrong role → `/`, no session → `/login`. Server `mustChangePasswordGate` on `/api` returns `403 MUST_CHANGE_PASSWORD` for any non-allowlisted route while flagged. Cross-user appointment read → `404` (no leak).
- **Admin create doctor:** `POST /api/doctors {fullName,email,phone,pmcNumber,specialization,fee(paisa),bio,initialPassword,blocks?}` (admin). Creates `User(role=doctor, mustChangePassword=true)` + `Doctor(pending,isActive=false)`. UI: `/admin/doctors` → "Add doctor" → DoctorForm (`#df-name,#df-email,#df-pmc,#df-phone,#df-spec,#df-fee,#df-bio,#df-pw`) → "Save doctor".
- **Prisma models:** see research; key fields — Appointment{state,slotStart,slotEnd,feeAtBooking,forSelf,doctorJoinedAt,patientJoinedAt,lockExpiresAt}, Payment{appointmentId,patientUserId,slotStart,amount,gatewayFee,status,providerRef}, intent_key unique `(patientUserId,slotStart)`, partial unique `uniq_active_slot (doctorId,slotStart)` over active states. `Settings` singleton id=1 `minBookingLeadMinutes` (floor 30).
- **Helpers to reuse:** `hashPassword` from `server/src/lib/password/password.js`; `ensureSettings` from `server/src/lib/settings/ensureSettings.js`.

---

## Seed data design (namespaced `*@dermestha.test`)

global-setup deletes (FK-safe order) all rows owned by users with email LIKE `e2e.%@dermestha.test`, then recreates:

| Entity | Email / key | Notes |
| --- | --- | --- |
| Admin `A` | `e2e.admin@dermestha.test` | `mustChangePassword:false` |
| Patient `P` | `e2e.patient@dermestha.test` | known password; owns seeded appts |
| Patient `P2` | `e2e.patient2@dermestha.test` | for J5 cross-account leak |
| Doctor `D` | `e2e.doctor@dermestha.test`, PMC `E2E-DOC-1`, fee 250000 | active; **today** availability (computed window); J1/J2/J3 |
| Doctor `Dc` | `e2e.cancel@dermestha.test`, PMC `E2E-DOC-2`, fee distinct | active; J4 appts (free fee 500000, late fee 600000) |
| Doctor `Dda3` | `e2e.da3doctor@dermestha.test`, PMC `E2E-DOC-3` | `mustChangePassword:true`; J5 DA3 loop |
| Medicine | name `E2E Acne Cream`, unitPrice 30000 | unique search term "E2E" for J3 builder |

Shared password constant: `E2ePassw0rd!`.

**`D` today availability:** compute Karachi weekday of "now"; create one `AvailabilityBlock {weekday, startTime, endTime}` whose window starts ~`now + 45min` (rounded up to next :00/:30) and ends 23:30, so a future bookable slot exists today. Set `Settings.minBookingLeadMinutes=30` to widen the bookable window. Documented limitation: J1 can flake only if global-setup runs in the final ~1h of the Karachi day (no future same-day slot) — acceptable for v1; note in report.

**Seeded appointments for `P` (distinct `slotStart` to satisfy `uniq_active_slot`):**
| Key | doctor | state | slotStart→slotEnd (rel. now) | joins | extra |
| --- | --- | --- | --- | --- | --- |
| `J2_INPROGRESS` | D | confirmed | −2m → +28m | none | evaluate → in_progress |
| `J2_COMPLETED` | D | confirmed | −45m → −15m | both | evaluate → completed |
| `J2_DOCNOSHOW` | D | confirmed | −50m → −20m | none | evaluate → doctor_no_show |
| `J2_PATNOSHOW` | D | confirmed | −55m → −25m | doctor only | evaluate → patient_no_show |
| `J2_LIVEJOIN` | D | confirmed | −1m → +29m | none | UI join records both |
| `J3_COMPLETED` | D | completed | −3h → −2.5h | both | feeAtBooking set; doctor prescribes |
| `J4_FREE` | Dc | confirmed | +3h → +3h30m | none | + Payment(amount 500000, gatewayFee 12500, success) |
| `J4_LATE` | Dc | confirmed | +1h → +1h30m | none | + Payment(amount 600000, gatewayFee 15000, success) |

`J4_FREE`/`J4_LATE` are distinguished in the Upcoming list by fee text (`Rs 5,000` / `Rs 6,000`); `D`'s appts use fee `Rs 2,500` so no collision. `J5` reuses `J4_FREE.id` as the appointment `P2` is denied.

global-setup returns the seeded IDs by writing them to `e2e/.seed-ids.json` (gitignored) so specs can read appointment IDs without re-querying.

---

## File Structure

- `package.json` (root) — EDIT: devDep `@playwright/test`; script `test:e2e`.
- `.gitignore` — EDIT: `playwright-report/`, `test-results/`, `/playwright/.cache/`, `e2e/.seed-ids.json`, `e2e/.auth/`.
- `playwright.config.js` (root) — NEW: loads `.env`, `webServer` (build+start, mock env), Chromium project, `globalSetup`.
- `e2e/support/db.js` — NEW: Prisma client (lazy), `karachiNow` helpers, `resetE2eData()`, `seedAll()`, `readAppointmentState(id)`, time-offset helpers, constants (emails, password).
- `e2e/global-setup.js` — NEW: `process.loadEnvFile('.env')`, `ensureSettings`, set lead time, `resetE2eData()`, `seedAll()`, write `.seed-ids.json`.
- `e2e/support/auth.js` — NEW: `loginUi(page,email,password)`, `signupUi(page,{...})`, `expectDashboard`.
- `e2e/support/seedIds.js` — NEW: read `.seed-ids.json`.
- `e2e/tests/j1-book-pay-confirm.spec.js` — NEW.
- `e2e/tests/j2-video-lifecycle.spec.js` — NEW.
- `e2e/tests/j3-prescription.spec.js` — NEW.
- `e2e/tests/j4-cancel-refund.spec.js` — NEW.
- `e2e/tests/j5-auth-role-gates.spec.js` — NEW.
- `e2e/tests/j6-admin-onboarding.spec.js` — NEW.

---

## Task 1: Root tooling — install Playwright, scripts, gitignore

**Files:** Modify `package.json`, `.gitignore`. Create `playwright.config.js`.

- [ ] **Step 1: Install `@playwright/test` at the root (non-workspace devDep) + Chromium browser**

```bash
npm install -D -W @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Add the `test:e2e` script** to root `package.json` `scripts` (after `"test:watch"`):

```json
"test:e2e": "playwright test",
```

- [ ] **Step 3: Append to `.gitignore`**

```
playwright-report/
test-results/
/playwright/.cache/
e2e/.seed-ids.json
e2e/.auth/
```

- [ ] **Step 4: Create `playwright.config.js`** (loads `.env` for global-setup + this process; passes mock overrides to the spawned server)

```js
// @ts-check
import { defineConfig, devices } from '@playwright/test';

// Load .env into THIS process so global-setup (Prisma) has DATABASE_URL etc.
// The override keys below are NOT present in .env, so --env-file in webServer won't clobber them.
process.loadEnvFile('.env');

const BASE_URL = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: false, // shared seeded DB rows — run serially for determinism
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:client && node --env-file=.env server/src/index.js',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NODE_ENV: 'development',
      PAYMENT_PROVIDER: 'mock',
      VIDEO_PROVIDER: 'mock',
      EMAIL_PROVIDER: 'console',
      PORT: '3000',
      APP_BASE_URL: BASE_URL,
    },
  },
});
```

- [ ] **Step 5: Verify Playwright is callable**

Run: `npx playwright --version`
Expected: prints a version (e.g. `Version 1.4x.x`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore playwright.config.js
git commit -m "test(e2e): add Playwright root tooling + config (Slice H S7)"
```

---

## Task 2: Seed/DB support module

**Files:** Create `e2e/support/db.js`.

- [ ] **Step 1: Implement `e2e/support/db.js`** — Prisma client + time helpers + reset + seed + state reader.

```js
// @ts-check
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../server/src/lib/password/password.js';

export const prisma = new PrismaClient();

export const PASSWORD = 'E2ePassw0rd!';
export const EMAILS = {
  admin: 'e2e.admin@dermestha.test',
  patient: 'e2e.patient@dermestha.test',
  patient2: 'e2e.patient2@dermestha.test',
  doctor: 'e2e.doctor@dermestha.test',
  cancelDoctor: 'e2e.cancel@dermestha.test',
  da3doctor: 'e2e.da3doctor@dermestha.test',
};
const MEDICINE = 'E2E Acne Cream';

const MIN = 60 * 1000;
const rel = (ms) => new Date(Date.now() + ms);

/** Karachi weekday (0=Sun..6=Sat) and a today availability window guaranteeing a future slot. */
function todayWindow() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[parts.weekday];
  // start ~45m ahead, rounded up to next :00/:30
  let h = Number(parts.hour); let m = Number(parts.minute) + 45;
  h += Math.floor(m / 60); m %= 60;
  m = m <= 30 ? 30 : 0; if (m === 0) h += 1;
  const startTime = `${String(Math.min(h, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { weekday, startTime, endTime: '23:30' };
}

/** Delete every row owned by an e2e.* user, in FK-safe order. Idempotent. */
export async function resetE2eData() {
  const users = await prisma.user.findMany({
    where: { email: { contains: '@dermestha.test' } },
    select: { id: true, doctor: { select: { id: true } } },
  });
  const userIds = users.map((u) => u.id);
  const doctorIds = users.map((u) => u.doctor?.id).filter(Boolean);
  if (userIds.length === 0 && doctorIds.length === 0) return;
  const appts = await prisma.appointment.findMany({
    where: { OR: [{ patientUserId: { in: userIds } }, { doctorId: { in: doctorIds } }] },
    select: { id: true },
  });
  const apptIds = appts.map((a) => a.id);
  const prescriptions = await prisma.prescription.findMany({
    where: { appointmentId: { in: apptIds } }, select: { id: true },
  });
  const presIds = prescriptions.map((p) => p.id);
  await prisma.prescriptionItem.deleteMany({ where: { prescriptionId: { in: presIds } } });
  await prisma.prescription.deleteMany({ where: { id: { in: presIds } } });
  await prisma.notificationJob.deleteMany({ where: { appointmentId: { in: apptIds } } });
  await prisma.payment.deleteMany({ where: { appointmentId: { in: apptIds } } });
  await prisma.appointment.deleteMany({ where: { id: { in: apptIds } } });
  await prisma.availabilityBlock.deleteMany({ where: { doctorId: { in: doctorIds } } });
  await prisma.doctor.deleteMany({ where: { id: { in: doctorIds } } });
  await prisma.medicine.deleteMany({ where: { name: MEDICINE } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function makeDoctor({ email, pmc, fee, fullName, spec, active, mustChange = false, blocks = [] }) {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: { role: 'doctor', email, fullName, phone: '03001110000', passwordHash, mustChangePassword: mustChange },
  });
  const doctor = await prisma.doctor.create({
    data: {
      userId: user.id, pmcNumber: pmc, specialization: spec, fee, bio: `${fullName} bio.`,
      isActive: active, status: active ? 'active' : 'pending',
    },
  });
  if (blocks.length) {
    await prisma.availabilityBlock.createMany({ data: blocks.map((b) => ({ doctorId: doctor.id, ...b })) });
  }
  return { user, doctor };
}

async function confirmedAppt({ doctorId, patientUserId, startMs, state, fee, docJoin, patJoin }) {
  const slotStart = rel(startMs);
  const slotEnd = new Date(slotStart.getTime() + 30 * MIN);
  return prisma.appointment.create({
    data: {
      doctorId, patientUserId, slotStart, slotEnd, state, feeAtBooking: fee, forSelf: true,
      doctorJoinedAt: docJoin ? new Date(slotStart.getTime() + MIN) : null,
      patientJoinedAt: patJoin ? new Date(slotStart.getTime() + MIN) : null,
    },
  });
}

/** Seed all deterministic data. Returns the id map persisted to .seed-ids.json. */
export async function seedAll() {
  const passwordHash = await hashPassword(PASSWORD);
  const admin = await prisma.user.create({
    data: { role: 'admin', email: EMAILS.admin, fullName: 'E2E Admin', passwordHash, mustChangePassword: false },
  });
  const patient = await prisma.user.create({
    data: { role: 'patient', email: EMAILS.patient, fullName: 'E2E Patient', phone: '03002220000', passwordHash, mustChangePassword: false, tosAcceptedAt: new Date() },
  });
  const patient2 = await prisma.user.create({
    data: { role: 'patient', email: EMAILS.patient2, fullName: 'E2E Patient Two', phone: '03002220001', passwordHash, mustChangePassword: false, tosAcceptedAt: new Date() },
  });
  const D = await makeDoctor({ email: EMAILS.doctor, pmc: 'E2E-DOC-1', fee: 250000, fullName: 'Dr E2E Primary', spec: 'E2E Dermatology', active: true, blocks: [todayWindow()] });
  const Dc = await makeDoctor({ email: EMAILS.cancelDoctor, pmc: 'E2E-DOC-2', fee: 500000, fullName: 'Dr E2E Cancel', spec: 'E2E Refunds', active: true });
  await makeDoctor({ email: EMAILS.da3doctor, pmc: 'E2E-DOC-3', fee: 250000, fullName: 'Dr E2E DA3', spec: 'E2E Onboarding', active: true, mustChange: true });
  await prisma.medicine.create({ data: { name: MEDICINE, genericName: 'E2E Generic', dosageForms: ['cream'], unitPrice: 30000, isActive: true } });

  const did = D.doctor.id; const pid = patient.id;
  const inprogress = await confirmedAppt({ doctorId: did, patientUserId: pid, startMs: -2 * MIN, state: 'confirmed', fee: 250000 });
  const completed = await confirmedAppt({ doctorId: did, patientUserId: pid, startMs: -45 * MIN, state: 'confirmed', fee: 250000, docJoin: true, patJoin: true });
  const docNoShow = await confirmedAppt({ doctorId: did, patientUserId: pid, startMs: -50 * MIN, state: 'confirmed', fee: 250000 });
  const patNoShow = await confirmedAppt({ doctorId: did, patientUserId: pid, startMs: -55 * MIN, state: 'confirmed', fee: 250000, docJoin: true });
  const liveJoin = await confirmedAppt({ doctorId: did, patientUserId: pid, startMs: -1 * MIN, state: 'confirmed', fee: 250000 });
  const presAppt = await confirmedAppt({ doctorId: did, patientUserId: pid, startMs: -180 * MIN, state: 'completed', fee: 250000, docJoin: true, patJoin: true });

  const free = await confirmedAppt({ doctorId: Dc.doctor.id, patientUserId: pid, startMs: 180 * MIN, state: 'confirmed', fee: 500000 });
  await prisma.payment.create({ data: { appointmentId: free.id, patientUserId: pid, slotStart: free.slotStart, amount: 500000, gatewayFee: 12500, status: 'success', providerRef: `e2e_free_${free.id}` } });
  const late = await confirmedAppt({ doctorId: Dc.doctor.id, patientUserId: pid, startMs: 60 * MIN, state: 'confirmed', fee: 600000 });
  await prisma.payment.update({ where: { id: late.id }, data: {} }).catch(() => {});
  // late uses Dc fee 500000 by default; override to 600000 for distinct row text
  await prisma.appointment.update({ where: { id: late.id }, data: { feeAtBooking: 600000 } });
  await prisma.payment.create({ data: { appointmentId: late.id, patientUserId: pid, slotStart: late.slotStart, amount: 600000, gatewayFee: 15000, status: 'success', providerRef: `e2e_late_${late.id}` } });

  return {
    doctorId: did, doctorEmail: EMAILS.doctor,
    appts: {
      inprogress: inprogress.id, completed: completed.id, docNoShow: docNoShow.id,
      patNoShow: patNoShow.id, liveJoin: liveJoin.id, prescription: presAppt.id,
      free: free.id, late: late.id,
    },
    patientId: pid, patient2Id: patient2.id, adminId: admin.id,
  };
}

export async function readAppointmentState(id) {
  const a = await prisma.appointment.findUnique({ where: { id }, select: { state: true, doctorJoinedAt: true, patientJoinedAt: true } });
  return a;
}
```

- [ ] **Step 2: Sanity-check the module imports cleanly** (env must be loaded first)

Run: `node --env-file=.env -e "import('./e2e/support/db.js').then(m=>console.log(Object.keys(m)))"`
Expected: prints the exported names (`prisma`, `PASSWORD`, `EMAILS`, `resetE2eData`, `seedAll`, `readAppointmentState`).

- [ ] **Step 3: Commit**

```bash
git add e2e/support/db.js
git commit -m "test(e2e): seed/db support module (namespaced, idempotent)"
```

---

## Task 3: global-setup + seed-id accessor

**Files:** Create `e2e/global-setup.js`, `e2e/support/seedIds.js`.

- [ ] **Step 1: Create `e2e/global-setup.js`**

```js
// @ts-check
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// .env is loaded by playwright.config.js (process.loadEnvFile) before this runs.
import { prisma, resetE2eData, seedAll } from './support/db.js';
import { ensureSettings } from '../server/src/lib/settings/ensureSettings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  await ensureSettings(prisma);
  await prisma.settings.update({ where: { id: 1 }, data: { minBookingLeadMinutes: 30 } });
  await resetE2eData();
  const ids = await seedAll();
  writeFileSync(path.join(__dirname, '.seed-ids.json'), JSON.stringify(ids, null, 2));
  await prisma.$disconnect();
}
```

- [ ] **Step 2: Create `e2e/support/seedIds.js`**

```js
// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const seedIds = JSON.parse(readFileSync(path.join(__dirname, '..', '.seed-ids.json'), 'utf8'));
```

- [ ] **Step 3: Dry-run global-setup standalone** (proves seeding works before any spec)

Run: `node --env-file=.env -e "import('./e2e/global-setup.js').then(m=>m.default()).then(()=>console.log('SEED OK')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `SEED OK`, and `e2e/.seed-ids.json` exists with appointment IDs. Re-run once more → still `SEED OK` (idempotent).

- [ ] **Step 4: Commit**

```bash
git add e2e/global-setup.js e2e/support/seedIds.js
git commit -m "test(e2e): global-setup seeding + seed-id accessor"
```

---

## Task 4: Auth UI helpers

**Files:** Create `e2e/support/auth.js`.

- [ ] **Step 1: Create `e2e/support/auth.js`**

```js
// @ts-check
import { expect } from '@playwright/test';
import { PASSWORD } from './db.js';

export async function loginUi(page, email, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

export async function signupUi(page, { fullName, email, phone, password = PASSWORD }) {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill(fullName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone').fill(phone);
  await page.getByLabel('Password').fill(password);
  await page.locator('#tos').check();
  await page.getByRole('button', { name: 'Create account' }).click();
}

export function uniqueEmail(prefix) {
  return `e2e.${prefix}.${Date.now()}@dermestha.test`;
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/support/auth.js
git commit -m "test(e2e): auth UI helpers"
```

---

## Task 5: J1 — book → pay → confirm (+ Fail releases lock)

**Tags:** F01.01 (TC-F01-001), F03.03 (TC-F03-005), F04.01 (TC-F04-001/002), invariants #2/#6/#7.

**Files:** Create `e2e/tests/j1-book-pay-confirm.spec.js`.

- [ ] **Step 1: Write the spec**

```js
// @ts-check
import { test, expect } from '@playwright/test';
import { signupUi, uniqueEmail } from '../support/auth.js';
import { EMAILS } from '../support/db.js';

// J1 book-pay-confirm — F04.01 TC-F04-001 (happy), F04 fail path releases lock.
test.describe('J1 book → pay → confirm', () => {
  test('signup, book a slot, pay, appointment confirmed', async ({ page }) => {
    await signupUi(page, { fullName: 'J1 Patient', email: uniqueEmail('j1'), phone: '03007770001' });
    await expect(page).toHaveURL(/\/browse/);

    // Browse → pick the E2E primary doctor.
    await page.getByRole('link', { name: /Dr E2E Primary/ }).click();
    await expect(page.getByRole('heading', { name: /Dr E2E Primary/ })).toBeVisible();

    // Pick the first available slot (seeded today-window guarantees ≥1).
    const slot = page.locator('button.slot').first();
    await expect(slot).toBeVisible();
    await slot.click();

    // Booking page → Confirm & Pay → redirected to mock checkout.
    await expect(page).toHaveURL(/\/book\//);
    await page.getByRole('button', { name: 'Confirm & Pay' }).click();
    await expect(page).toHaveURL(/\/dev\/checkout/);

    // Pay → signed IPN → webhook confirm → PaymentReturn polls to confirmed.
    await page.getByRole('button', { name: 'Pay' }).click();
    await expect(page).toHaveURL(/\/pay\/return/);
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

    await page.getByRole('link', { name: 'View my appointments' }).click();
    await expect(page.getByRole('heading', { name: 'Upcoming appointments' })).toBeVisible();
    await expect(page.getByText(/Dr E2E Primary/)).toBeVisible();
  });

  test('Fail at checkout releases the lock (no confirmation)', async ({ page }) => {
    await signupUi(page, { fullName: 'J1 Fail', email: uniqueEmail('j1fail'), phone: '03007770002' });
    await expect(page).toHaveURL(/\/browse/);
    await page.getByRole('link', { name: /Dr E2E Primary/ }).click();
    await page.locator('button.slot').first().click();
    await page.getByRole('button', { name: 'Confirm & Pay' }).click();
    await expect(page).toHaveURL(/\/dev\/checkout/);
    await page.getByRole('button', { name: 'Fail' }).click();
    await expect(page).toHaveURL(/\/pay\/return/);
    // payment.failed deletes the slot_locked appt → detail 404 → "Payment did not complete".
    await expect(page.getByRole('heading', { name: 'Payment did not complete' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run J1**

Run: `npx playwright test j1 --project=chromium`
Expected: 2 passed. (If "no slot" — global-setup ran in the last hour of the Karachi day; re-run or note the documented limitation.)

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/j1-book-pay-confirm.spec.js
git commit -m "test(e2e): J1 book-pay-confirm + fail-releases-lock"
```

---

## Task 6: J2 — video lifecycle

**Tags:** F05.03 (TC-F05-004 room/join), §5 worker (TC-F05-011 in_progress, TC-F05-014 completed), §3 no-show (TC-F05-008 doctor_no_show, TC-F05-013 patient_no_show).

**Files:** Create `e2e/tests/j2-video-lifecycle.spec.js`.

- [ ] **Step 1: Write the spec** — UI join (records both joins) + worker-driven transitions asserted via DB.

```js
// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, readAppointmentState, prisma } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.afterAll(async () => { await prisma.$disconnect(); });

// J2 video-lifecycle.
test.describe('J2 video lifecycle', () => {
  test('patient + doctor join the mock room → both joins recorded', async ({ browser }) => {
    const id = seedIds.appts.liveJoin;
    const patientCtx = await browser.newContext();
    const doctorCtx = await browser.newContext();
    const pPage = await patientCtx.newPage();
    const dPage = await doctorCtx.newPage();
    await loginUi(pPage, EMAILS.patient);
    await expect(pPage).toHaveURL(/\/browse/);
    await loginUi(dPage, EMAILS.doctor);
    await expect(dPage).toHaveURL(/\/doctor/);

    await pPage.goto(`/video/${id}`);
    await expect(pPage.getByText(/Live|shortly|Time remaining/)).toBeVisible();
    await dPage.goto(`/video/${id}`);
    await expect(dPage.getByText(/Live|shortly|Time remaining/)).toBeVisible();

    await expect.poll(async () => {
      const a = await readAppointmentState(id);
      return Boolean(a.doctorJoinedAt && a.patientJoinedAt);
    }, { timeout: 15_000 }).toBe(true);

    await patientCtx.close();
    await doctorCtx.close();
  });

  test('worker drives in_progress, completed, and no-show variants', async ({ request }) => {
    const r = await request.post('/dev/worker/evaluate');
    expect(r.ok()).toBeTruthy();

    await expect.poll(async () => (await readAppointmentState(seedIds.appts.inprogress)).state).toBe('in_progress');
    await expect.poll(async () => (await readAppointmentState(seedIds.appts.completed)).state).toBe('completed');
    await expect.poll(async () => (await readAppointmentState(seedIds.appts.docNoShow)).state).toBe('doctor_no_show');
    await expect.poll(async () => (await readAppointmentState(seedIds.appts.patNoShow)).state).toBe('patient_no_show');
  });
});
```

- [ ] **Step 2: Run J2**

Run: `npx playwright test j2 --project=chromium`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/j2-video-lifecycle.spec.js
git commit -m "test(e2e): J2 video lifecycle (join + worker transitions)"
```

---

## Task 7: J3 — prescription

**Tags:** F08.02 immutable submit (TC-F08-008), F08.01 client-render download (TC-F08-006), invariants #4/#5.

**Files:** Create `e2e/tests/j3-prescription.spec.js`.

- [ ] **Step 1: Write the spec**

```js
// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, readAppointmentState, prisma } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.afterAll(async () => { await prisma.$disconnect(); });

// J3 prescription — TC-F08-008 / TC-F08-006.
test('doctor issues a prescription → patient views it + PDF download', async ({ browser }) => {
  const id = seedIds.appts.prescription;
  const docCtx = await browser.newContext();
  const docPage = await docCtx.newPage();
  await loginUi(docPage, EMAILS.doctor);
  await docPage.goto(`/doctor/appointments/${id}/prescribe`);
  await expect(docPage.getByRole('heading', { name: 'Write prescription' })).toBeVisible();

  await docPage.getByLabel('Add medicine').fill('E2E');
  await docPage.getByRole('option').first().click(); // catalogue medicine row
  await docPage.locator('#dosage-0').fill('1 tab daily');
  await docPage.locator('#duration-0').fill('14 days');
  await docPage.locator('#instructions-0').fill('After food');
  await docPage.getByRole('button', { name: 'Submit prescription' }).click();
  await docPage.getByRole('button', { name: 'Confirm & issue' }).click();
  await expect(docPage).toHaveURL(/\/doctor$/);

  await expect.poll(async () => (await readAppointmentState(id)).state).toBe('prescription_issued');
  await docCtx.close();

  const patCtx = await browser.newContext();
  const patPage = await patCtx.newPage();
  await loginUi(patPage, EMAILS.patient);
  await patPage.goto(`/appointments/${id}/prescriptions`);
  await expect(patPage.getByRole('heading', { name: 'Prescriptions' })).toBeVisible();
  await expect(patPage.getByText('E2E Acne Cream')).toBeVisible();
  await expect(patPage.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  await patCtx.close();
});
```

- [ ] **Step 2: Run J3**

Run: `npx playwright test j3 --project=chromium`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/j3-prescription.spec.js
git commit -m "test(e2e): J3 prescription issue + patient view"
```

---

## Task 8: J4 — cancel / refund

**Tags:** F06.01 free-cancel (TC-F06-001), late-cancel (TC-F06-002), net-of-fee (TC-F06-003), invariant #10.

**Files:** Create `e2e/tests/j4-cancel-refund.spec.js`.

- [ ] **Step 1: Write the spec** — rows distinguished by fee text (Rs 5,000 free / Rs 6,000 late).

```js
// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, readAppointmentState, prisma } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.afterAll(async () => { await prisma.$disconnect(); });

test.describe('J4 cancel / refund', () => {
  test.beforeEach(async ({ page }) => {
    await loginUi(page, EMAILS.patient);
    await expect(page).toHaveURL(/\/browse/);
    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'Upcoming appointments' })).toBeVisible();
  });

  test('cancel ≥2h before → cancelled_refunded with refund number', async ({ page }) => {
    const row = page.locator('.appt-row', { hasText: 'Rs 5,000' });
    await row.getByRole('button', { name: 'Cancel' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Refund:/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel & refund' }).click();
    await expect.poll(async () => (await readAppointmentState(seedIds.appts.free)).state).toBe('cancelled_refunded');
  });

  test('cancel <2h before → cancelled_no_refund', async ({ page }) => {
    const row = page.locator('.appt-row', { hasText: 'Rs 6,000' });
    await row.getByRole('button', { name: 'Cancel' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/No refund available/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel anyway' }).click();
    await expect.poll(async () => (await readAppointmentState(seedIds.appts.late)).state).toBe('cancelled_no_refund');
  });
});
```

- [ ] **Step 2: Run J4**

Run: `npx playwright test j4 --project=chromium`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/j4-cancel-refund.spec.js
git commit -m "test(e2e): J4 cancel-refund (free + late)"
```

---

## Task 9: J5 — auth role gates

**Tags:** F15.03 / TC-SEC-001 (admin block), F15.02 DA3 / TC-SEC-005 (forced change), TC-SEC-002/007 (404 no-leak).

**Files:** Create `e2e/tests/j5-auth-role-gates.spec.js`.

- [ ] **Step 1: Write the spec**

```js
// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.describe('J5 auth role gates', () => {
  test('patient cannot reach /admin (client redirect + API 403)', async ({ page }) => {
    await loginUi(page, EMAILS.patient);
    await expect(page).toHaveURL(/\/browse/);
    await page.goto('/admin/doctors');
    await expect(page).not.toHaveURL(/\/admin/); // RoleRoute → "/"
    const res = await page.request.get('/api/admin/doctors');
    expect(res.status()).toBe(403);
  });

  test('DA3 forced password change loop clears after change', async ({ page }) => {
    await loginUi(page, EMAILS.da3doctor);
    await expect(page).toHaveURL(/\/doctor\/change-password/);
    await page.getByLabel('Current password').fill('E2ePassw0rd!');
    await page.getByLabel('New password').fill('E2eNewPass1!');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page).toHaveURL(/\/doctor$/);
    await expect(page.getByRole('heading', { name: /appointments/i })).toBeVisible();
  });

  test('404 no-leak: patient2 cannot read patient1 appointment', async ({ page }) => {
    await loginUi(page, EMAILS.patient2);
    await expect(page).toHaveURL(/\/browse/);
    const res = await page.request.get(`/api/appointments/${seedIds.appts.free}`);
    expect(res.status()).toBe(404);
  });
});
```

- [ ] **Step 2: Run J5**

Run: `npx playwright test j5 --project=chromium`
Expected: 3 passed. (Note: J5 mutates the DA3 doctor's password — keep J5 after J6 is independent; global-setup reseeds each run so order across runs is stable.)

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/j5-auth-role-gates.spec.js
git commit -m "test(e2e): J5 auth role gates (admin block, DA3, 404 no-leak)"
```

---

## Task 10: J6 — admin onboarding

**Tags:** F10.01 (TC-F10-001), F15.02 DA3 (TC-F15-002).

**Files:** Create `e2e/tests/j6-admin-onboarding.spec.js`.

- [ ] **Step 1: Write the spec** — admin creates a doctor (unique email/PMC per run); that doctor's first login forces the password change.

```js
// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, PASSWORD } from '../support/db.js';

test('admin onboards a doctor → first login forces password change', async ({ browser }) => {
  const stamp = Date.now();
  const newEmail = `e2e.newdoc.${stamp}@dermestha.test`;
  const pmc = `E2E-NEW-${stamp}`;

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginUi(adminPage, EMAILS.admin);
  await expect(adminPage).toHaveURL(/\/admin/);
  await adminPage.goto('/admin/doctors');
  await adminPage.getByRole('button', { name: 'Add doctor' }).click();

  await adminPage.getByLabel('Full name').fill('Dr Onboarded E2E');
  await adminPage.getByLabel('Email').fill(newEmail);
  await adminPage.getByLabel('PMC number').fill(pmc);
  await adminPage.getByLabel('Phone').fill('03009990000');
  await adminPage.getByLabel('Specialization').fill('E2E Onboard');
  await adminPage.getByLabel('Consultation fee (PKR)').fill('3000');
  await adminPage.getByLabel('Bio').fill('Onboarded by E2E.');
  await adminPage.getByLabel('Initial password').fill(PASSWORD);
  await adminPage.getByRole('button', { name: 'Save doctor' }).click();

  await expect(adminPage.getByText('Dr Onboarded E2E')).toBeVisible();
  await adminCtx.close();

  // First login forces DA3 change.
  const docCtx = await browser.newContext();
  const docPage = await docCtx.newPage();
  await loginUi(docPage, newEmail, PASSWORD);
  await expect(docPage).toHaveURL(/\/doctor\/change-password/);
  await docCtx.close();
});
```

- [ ] **Step 2: Run J6**

Run: `npx playwright test j6 --project=chromium`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/j6-admin-onboarding.spec.js
git commit -m "test(e2e): J6 admin onboarding + DA3 first-login"
```

---

## Task 11: Full-suite verification + regression

- [ ] **Step 1: Run the whole E2E suite**

Run: `npm run test:e2e`
Expected: all 6 spec files green (J1=2, J2=2, J3=1, J4=2, J5=3, J6=1 → 11 tests). Record counts + run time.

- [ ] **Step 2: Confirm unit/integration still green** (no `data-testid` were added; nothing in `server/`/`shared/`/`client/src` changed)

Run: `npm test`
Expected: 248 server/shared passing (unchanged).

Run: `npm --workspace client test`
Expected: 97 client passing (unchanged).

- [ ] **Step 3: Confirm client build still succeeds**

Run: `npm --workspace client run build`
Expected: Vite build completes, `client/dist` written.

- [ ] **Step 4: Final commit (if any cleanup)** — otherwise the per-task commits suffice. Do NOT push, do NOT merge, do NOT stage `CLAUDE.md`.

---

## Doc-impact (tracked; controller applies at end — DO NOT edit specs here)

- **doc 09** — record the realized Playwright E2E layer (§1/§4) + `npm run test:e2e`.
- **doc 15** — add `test:e2e` to the scripts table.
- **doc 11** — new ADR: Playwright E2E harness against mock adapters as the v1 launch gate (living/extensible suite).
- Per S7 §6 traceability — only surgical cross-ref additions where a hop is missing (controller's pass).

## Open items / conventions for the next journey (S7 §10)

- A new journey = one new `e2e/tests/jN-*.spec.js` reusing `e2e/support/` primitives; config + global-setup unchanged.
- Lifecycle/state assertions read the DB via `readAppointmentState`; UI assertions cover user-facing surfaces.
- Time-dependent flows: seed at controlled `slotStart` offsets + fire `/dev/worker/evaluate`; never wall-clock wait.
- Known limitation: J1 depends on a same-day future slot; flaky only if global-setup runs in the final ~1h of the Karachi day.

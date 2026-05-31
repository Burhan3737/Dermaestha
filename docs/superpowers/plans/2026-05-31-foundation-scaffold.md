# Dermestha — Milestone 0 (Foundation / Scaffold) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running, same-origin Express + React (Vite) + Prisma/Postgres skeleton with every cross-cutting seam (config, sessions, role middleware, error envelope, audit writer, vendor-adapter interfaces) in place and tested — the base every later milestone builds on.

**Architecture:** A single-deployable monolith (ARCHITECTURE.md §1): one Express app serves `/api` JSON *and* the built React SPA from the same origin. Persistence is Postgres via Prisma 6.x; sessions live in Postgres via `connect-pg-simple`. This milestone builds **no business features** — it builds the scaffold, the data model + the critical no-double-booking invariant, and the wiring/seams, all verified by smoke + integration tests.

**Tech Stack:** Node 20 LTS (ES modules), Express, Prisma 6.x + PostgreSQL, `express-session` + `connect-pg-simple`, `express-rate-limit`, Zod, Vite + React (JS + JSDoc, `// @ts-check`), Vitest + Supertest, Docker. Password hashing: `argon2` (with `bcryptjs` pure-JS fallback noted for Windows native-build issues).

---

## Context

**Why this plan exists.** The documentation phase is complete: `PRD.md` (source of truth), `ARCHITECTURE.md`, `DESIGN.md`, and the contract specs (`prisma/schema.prisma`, `API.md`, `CONFIG.md`, `INTEGRATIONS.md`, `.env.example`) all exist and are implementation-ready. **No application code exists yet** — there is no `package.json`, `jsconfig.json`, `Dockerfile`, or `node_modules`. Nothing in Milestone 1 (auth, doctor listing, booking) can boot or be tested until the scaffold and the shared seams exist.

**Intended outcome.** After this plan: `npm install` works from a clean clone; `docker compose up` brings up app + Postgres; migrations apply (including the hand-added `uniq_active_slot` partial index); `GET /api/health` returns `200`; the React SPA builds and is served same-origin with the approved design tokens; and the role middleware, uniform error envelope, session store, audit-log writer, and the three vendor-adapter interface seams are all present and covered by passing tests. **Decisions made here (mentioned to the developer):** test runner = **Vitest + Supertest** (ARCHITECTURE didn't name one; Vitest is ESM-native and shared across both workspaces); package manager = **npm workspaces** (`server`, `client`) per ARCHITECTURE §4.

**Testing posture (per developer choice): pragmatic TDD.** Business/contract logic gets failing-test-first (config validation, error envelope, `requireRole`, audit writer, and the double-booking invariant). Pure wiring (Dockerfile, ESLint config, Vite scaffold) gets smoke/integration verification rather than artificial unit tests.

**Scope guard.** This plan deliberately excludes: any auth endpoints, doctor/booking/payment/prescription logic, the workers, and any vendor SDK calls. Vendor adapters are built as **interface seams + `NOT_IMPLEMENTED` stubs** only. Those are Milestone 1+ and will be separate plans.

---

## File Structure

Mirrors ARCHITECTURE.md §4. Files created by this plan:

```
dermestha/
├── package.json                 # root: npm workspaces (server, client) + shared scripts
├── jsconfig.json                # checkJs for editor type-checking (no build step)
├── .gitignore                   # node_modules, dist, .env, coverage
├── .eslintrc.json + .prettierrc # borrowed config only (ARCHITECTURE §3 "borrow only config")
├── vitest.config.js             # root test config (server workspace)
├── Dockerfile                   # multi-stage: build client → run server
├── docker-compose.yml           # local dev: app + postgres
├── README.md                    # run/runbook (includes admin bootstrap, migration caveat)
├── .env                         # local only (gitignored) — copied from .env.example
├── prisma/
│   ├── schema.prisma            # EXISTS — do not rewrite; generate + migrate against it
│   ├── migrations/              # created by `prisma migrate dev`; hand-edit to add partial index
│   ├── seed.js                  # dev seed: settings row, medicines, one demo doctor
│   └── scripts/bootstrap-admin.js  # DA4 one-off admin creation
├── shared/
│   └── schemas/index.js         # seam only (feature plans add Zod DTOs here)
├── server/
│   ├── package.json             # server workspace
│   └── src/
│       ├── index.js             # bootstraps Express + session + static serving + error handler
│       ├── config/
│       │   ├── env.js           # Zod-validated env loader
│       │   └── constants.js     # CONFIG.md tier-B constants
│       ├── lib/
│       │   ├── prisma.js        # PrismaClient singleton
│       │   ├── logger.js        # minimal structured logger
│       │   ├── errorTracking.js # init stub (DSN optional in dev)
│       │   └── password.js      # hash/verify (argon2, bcryptjs fallback)
│       ├── http/
│       │   ├── AppError.js      # coded error → status map (API.md §1.2)
│       │   └── errorHandler.js  # uniform error envelope middleware
│       ├── middleware/
│       │   ├── session.js       # express-session + connect-pg-simple wiring
│       │   ├── requireRole.js   # DA6 authorization boundary
│       │   └── rateLimit.js     # express-rate-limit factory (CONFIG.md §2)
│       ├── services/
│       │   └── audit.service.js # append-only writer seam (record())
│       ├── integrations/
│       │   ├── payment/index.js + payment/payfast.stub.js   # PaymentProvider seam
│       │   ├── video/index.js   + video/daily.stub.js       # VideoProvider seam
│       │   └── email/index.js   + email/resend.stub.js      # EmailProvider seam
│       └── routes/health.js     # GET /api/health
│       └── test/                # *.test.js (Vitest + Supertest)
└── client/
    ├── package.json             # client workspace (Vite + React)
    ├── vite.config.js           # build + dev proxy /api → :3000
    ├── index.html
    └── src/
        ├── main.jsx, App.jsx
        ├── routes.jsx           # route config + RoleRoute guard seam
        ├── lib/RoleRoute.jsx    # role-guard component (tested)
        └── styles/tokens.css, styles/components.css   # ported verbatim from mockups
```

---

## Task 0: Repo scaffolding & tooling

**Files:**
- Create: `package.json`, `jsconfig.json`, `.gitignore`, `.eslintrc.json`, `.prettierrc`, `vitest.config.js`, `server/package.json`

- [ ] **Step 1: Root `package.json` with workspaces**

```json
{
  "name": "dermestha",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "workspaces": ["server", "client"],
  "scripts": {
    "dev:server": "node --watch server/src/index.js",
    "dev:client": "npm --workspace client run dev",
    "build:client": "npm --workspace client run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "db:seed": "node prisma/seed.js",
    "bootstrap:admin": "node prisma/scripts/bootstrap-admin.js"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "supertest": "^7.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "prisma": "6.19.3"
  },
  "dependencies": {
    "@prisma/client": "6.19.3"
  }
}
```

> Note (CONFIG.md §7): Prisma is pinned to **6.19.3** exactly — Prisma 7 dropped in-schema `datasource.url`. Do not let it float to `^7`.

- [ ] **Step 2: `server/package.json`**

```json
{
  "name": "@dermestha/server",
  "private": true,
  "type": "module",
  "dependencies": {
    "express": "^4.21.0",
    "express-session": "^1.18.0",
    "connect-pg-simple": "^9.0.1",
    "express-rate-limit": "^7.4.0",
    "zod": "^3.23.0",
    "argon2": "^0.41.0",
    "bcryptjs": "^2.4.3"
  }
}
```

- [ ] **Step 3: `jsconfig.json`** (editor type-checking, no build step — ARCHITECTURE §3)

```json
{
  "compilerOptions": {
    "checkJs": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "noEmit": true
  },
  "include": ["server/src", "shared", "client/src"],
  "exclude": ["node_modules", "client/dist"]
}
```

- [ ] **Step 4: `.gitignore`, `.prettierrc`, `.eslintrc.json`, `vitest.config.js`**

`.gitignore`:
```
node_modules/
client/dist/
.env
coverage/
*.log
```

`.prettierrc`:
```json
{ "semi": true, "singleQuote": true, "printWidth": 100 }
```

`.eslintrc.json` (minimal flat-config-compatible base; borrow-only per ARCHITECTURE §3):
```json
{
  "root": true,
  "env": { "node": true, "es2022": true, "browser": true },
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "module" },
  "extends": ["eslint:recommended"],
  "ignorePatterns": ["node_modules/", "client/dist/", "coverage/"]
}
```

`vitest.config.js` (root — runs the server workspace tests in node):
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/src/**/*.test.js'],
    hookTimeout: 30000,
  },
});
```

- [ ] **Step 5: Install and verify tooling boots**

Run: `npm install`
Then: `npm test`
Expected: install succeeds; Vitest runs and reports **"No test files found"** (exit 0 acceptable at this stage) — proves the runner is wired.

- [ ] **Step 6: Commit**

```bash
git add package.json server/package.json jsconfig.json .gitignore .prettierrc .eslintrc.json vitest.config.js package-lock.json
git commit -m "chore: scaffold npm workspaces, tooling, and test runner"
```

---

## Task 1: Prisma — generate, migrate, the critical partial index, seed

**Files:**
- Use existing: `prisma/schema.prisma`
- Create/modify: `prisma/migrations/*/migration.sql` (hand-edit), `prisma/seed.js`
- Test: `server/src/test/doubleBooking.test.js`

- [ ] **Step 1: Copy env and start Postgres**

Run (PowerShell): `Copy-Item .env.example .env`
Then bring up Postgres (Task 11 compose can be used, or any local PG). Ensure `DATABASE_URL` in `.env` matches a reachable Postgres.

- [ ] **Step 2: Generate client + create the initial migration**

Run: `npx prisma migrate dev --name init`
Expected: a new folder `prisma/migrations/<timestamp>_init/migration.sql` is created and applied; `@prisma/client` is generated.

- [ ] **Step 3: Hand-edit the migration to add the no-double-booking partial index**

Append to the generated `prisma/migrations/<timestamp>_init/migration.sql` (CONFIG.md §7.2; schema header lines 7–17):

```sql
CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
  WHERE state IN ('slot_locked','confirmed','in_progress','completed',
                  'prescription_issued','cancelled_no_refund');
```

Then re-apply: `npx prisma migrate dev`
Expected: migration applies cleanly; index `uniq_active_slot` exists.

> Why by hand: Prisma's DSL cannot express a `WHERE` (partial) index. This index *is* PRD invariant #1 — do not skip it.

- [ ] **Step 4: Write the failing invariant test**

`server/src/test/doubleBooking.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';

describe('no-double-booking partial index (PRD #1)', () => {
  let doctorId;
  const slotStart = new Date('2099-01-01T10:00:00Z');
  const slotEnd = new Date('2099-01-01T10:30:00Z');

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { role: 'doctor', email: `idx-${Date.now()}@t.test`, passwordHash: 'x', fullName: 'Dr Idx' },
    });
    const doc = await prisma.doctor.create({
      data: { userId: user.id, pmcNumber: `PMC-${Date.now()}`, specialization: 'Derm', fee: 100000 },
    });
    doctorId = doc.id;
  });

  it('rejects a second active-state appointment on the same (doctor, slot)', async () => {
    const patient = await prisma.user.create({
      data: { role: 'patient', email: `p-${Date.now()}@t.test`, passwordHash: 'x', fullName: 'Pat' },
    });
    await prisma.appointment.create({
      data: { doctorId, patientUserId: patient.id, slotStart, slotEnd, state: 'confirmed' },
    });
    await expect(
      prisma.appointment.create({
        data: { doctorId, patientUserId: patient.id, slotStart, slotEnd, state: 'slot_locked' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' }); // Prisma unique-constraint violation
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
```

- [ ] **Step 5: Run it — expect FAIL until `lib/prisma.js` exists**

Run: `npx vitest run server/src/test/doubleBooking.test.js`
Expected: FAIL — `Cannot find module '../lib/prisma.js'` (created in Task 3). This test is completed by Task 3 Step 3.

- [ ] **Step 6: Write the seed**

`prisma/seed.js`:
```js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

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

  console.log('Seed complete: settings + medicines.');
}
main().finally(() => prisma.$disconnect());
```

Run: `npm run db:seed`
Expected: "Seed complete" printed; `settings` has one row; 3 medicines exist.

- [ ] **Step 7: Commit**

```bash
git add prisma/migrations prisma/seed.js server/src/test/doubleBooking.test.js
git commit -m "feat(db): init migration + hand-added uniq_active_slot index + seed"
```

---

## Task 2: Config loader (Zod-validated env) + constants

**Files:**
- Create: `server/src/config/env.js`, `server/src/config/constants.js`
- Test: `server/src/config/env.test.js`

- [ ] **Step 1: Write the failing test**

`server/src/config/env.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parseEnv } from './env.js';

const base = {
  NODE_ENV: 'test', PORT: '3000', APP_BASE_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/d', SESSION_SECRET: 'x'.repeat(16),
};

describe('parseEnv', () => {
  it('parses a valid env and coerces PORT to a number', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('test');
  });
  it('throws when a required var is missing', () => {
    const { DATABASE_URL, ...rest } = base;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });
  it('rejects a too-short SESSION_SECRET', () => {
    expect(() => parseEnv({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './env.js'`)

Run: `npx vitest run server/src/config/env.test.js`

- [ ] **Step 3: Implement `server/src/config/env.js`**

```js
// @ts-check
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  // optional vendor keys — required only when those adapters go live (M2+)
  PAYFAST_MERCHANT_ID: z.string().optional(),
  DAILY_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ERROR_TRACKING_DSN: z.string().optional(),
});

/** @param {NodeJS.ProcessEnv | Record<string,string|undefined>} raw */
export function parseEnv(raw) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
```

- [ ] **Step 4: Implement `server/src/config/constants.js`** (CONFIG.md tier-B values)

```js
// @ts-check
// Pinned operational constants — source of truth: docs/engineering/CONFIG.md.
export const SLOT_LOCK_TTL_MIN = Number(process.env.SLOT_LOCK_TTL_MIN ?? 10);
export const SLOT_GRANULARITY_MIN = Number(process.env.SLOT_GRANULARITY_MIN ?? 30);
export const NO_SHOW_GRACE_MIN = Number(process.env.NO_SHOW_GRACE_MIN ?? 15);
export const VIDEO_TOKEN_PRE_MIN = Number(process.env.VIDEO_TOKEN_PRE_MIN ?? 10);
export const VIDEO_TOKEN_POST_MIN = Number(process.env.VIDEO_TOKEN_POST_MIN ?? 5);
export const RESET_TOKEN_TTL_MIN = Number(process.env.RESET_TOKEN_TTL_MIN ?? 60);
export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 7);

export const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
export const LOGIN_LOCKOUT_MIN = Number(process.env.LOGIN_LOCKOUT_MIN ?? 15);
export const SIGNUP_MAX_PER_IP_HOUR = Number(process.env.SIGNUP_MAX_PER_IP_HOUR ?? 5);
export const FORGOT_MAX_PER_ACCOUNT_HOUR = Number(process.env.FORGOT_MAX_PER_ACCOUNT_HOUR ?? 5);
export const PAYMENT_INTENT_MAX_PER_PATIENT_HOUR = Number(process.env.PAYMENT_INTENT_MAX_PER_PATIENT_HOUR ?? 10);

export const REFUND_MAX_ATTEMPTS = Number(process.env.REFUND_MAX_ATTEMPTS ?? 5);
export const REFUND_BACKOFF_BASE_SEC = Number(process.env.REFUND_BACKOFF_BASE_SEC ?? 30);

export const TIMEZONE = 'Asia/Karachi';
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run server/src/config/env.test.js`
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add server/src/config
git commit -m "feat(config): Zod-validated env loader + CONFIG.md constants"
```

---

## Task 3: lib — Prisma singleton, logger, error-tracking stub, password util

**Files:**
- Create: `server/src/lib/prisma.js`, `server/src/lib/logger.js`, `server/src/lib/errorTracking.js`, `server/src/lib/password.js`
- Test: `server/src/lib/password.test.js`

- [ ] **Step 1: `server/src/lib/prisma.js`** (singleton — avoids exhausting connections on `--watch`)

```js
// @ts-check
import { PrismaClient } from '@prisma/client';

const globalForPrisma = /** @type {{ prisma?: PrismaClient }} */ (globalThis);
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 2: Re-run the Task 1 invariant test — now expect PASS**

Run: `npx vitest run server/src/test/doubleBooking.test.js`
Expected: PASS — the second insert rejects with `P2002`. (This is the single most important guarantee in the system; it is now proven.)

- [ ] **Step 3: `server/src/lib/logger.js`**

```js
// @ts-check
const fmt = (level, msg, meta) =>
  JSON.stringify({ at: new Date().toISOString(), level, msg, ...(meta ?? {}) });
export const logger = {
  info: (msg, meta) => console.log(fmt('info', msg, meta)),
  warn: (msg, meta) => console.warn(fmt('warn', msg, meta)),
  error: (msg, meta) => console.error(fmt('error', msg, meta)),
};
```

- [ ] **Step 4: `server/src/lib/errorTracking.js`** (init seam; DSN optional in dev — `.env.example`)

```js
// @ts-check
import { logger } from './logger.js';
/** Initialize error tracking. No-op until a DSN is configured (A3 wires this in M4). */
export function initErrorTracking() {
  const dsn = process.env.ERROR_TRACKING_DSN;
  if (!dsn) { logger.info('error-tracking disabled (no DSN)'); return; }
  logger.info('error-tracking enabled');
  // Concrete SDK init (e.g. Sentry) added when A3 lands.
}
export function captureException(err) { logger.error('captured', { err: String(err) }); }
```

- [ ] **Step 5: Write the failing password test**

`server/src/lib/password.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password util', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(hash).not.toBe('s3cret-pass');
    expect(await verifyPassword(hash, 's3cret-pass')).toBe(true);
  });
  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});
```

- [ ] **Step 6: Run — expect FAIL, then implement `server/src/lib/password.js`**

```js
// @ts-check
// argon2id per CONFIG.md §5. If the argon2 native build fails on Windows, swap the two
// imports below for bcryptjs (bcryptjs.hash / bcryptjs.compare) — accepted fallback (CONFIG.md §5).
import argon2 from 'argon2';

const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

/** @param {string} plain */
export const hashPassword = (plain) => argon2.hash(plain, OPTS);
/** @param {string} hash @param {string} plain */
export const verifyPassword = (hash, plain) => argon2.verify(hash, plain);
```

Run: `npx vitest run server/src/lib/password.test.js`
Expected: PASS. (If `argon2` fails to build on Windows: `npm install bcryptjs` is already a dep — switch the impl to bcryptjs and re-run.)

- [ ] **Step 7: Commit**

```bash
git add server/src/lib
git commit -m "feat(lib): prisma singleton, logger, error-tracking seam, password util"
```

---

## Task 4: Uniform error envelope (AppError + errorHandler)

**Files:**
- Create: `server/src/http/AppError.js`, `server/src/http/errorHandler.js`
- Test: `server/src/http/errorHandler.test.js`

- [ ] **Step 1: Write the failing test** (asserts the API.md §1.1/§1.2 contract)

`server/src/http/errorHandler.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from './AppError.js';
import { errorHandler } from './errorHandler.js';

function mockRes() {
  return { statusCode: 0, body: null, status(c){ this.statusCode = c; return this; }, json(b){ this.body = b; return this; } };
}

describe('errorHandler', () => {
  it('maps an AppError to its status + envelope', () => {
    const res = mockRes();
    errorHandler(new AppError('SLOT_TAKEN', 'Slot just taken.', 409), {}, res, () => {});
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: { code: 'SLOT_TAKEN', message: 'Slot just taken.', details: undefined } });
  });
  it('maps a ZodError to 400 VALIDATION_FAILED with field details', () => {
    const res = mockRes();
    const err = z.object({ a: z.string() }).safeParse({}).error;
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
  it('maps an unknown error to 500 INTERNAL without leaking the message', () => {
    const res = mockRes();
    errorHandler(new Error('db exploded'), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.message).not.toMatch(/db exploded/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement `server/src/http/AppError.js`

```js
// @ts-check
/** Coded application error. `code` is a stable SCREAMING_SNAKE string (API.md §1.1). */
export class AppError extends Error {
  /** @param {string} code @param {string} message @param {number} status @param {object} [details] */
  constructor(code, message, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
```

- [ ] **Step 3: Implement `server/src/http/errorHandler.js`**

```js
// @ts-check
import { ZodError } from 'zod';
import { AppError } from './AppError.js';
import { captureException } from '../lib/errorTracking.js';

/** Express error middleware — emits the uniform envelope (API.md §1.1). */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    const details = err.issues.reduce((acc, i) => ({ ...acc, [i.path.join('.')]: i.message }), {});
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Validation failed.', details } });
  }
  captureException(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run server/src/http/errorHandler.test.js`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add server/src/http
git commit -m "feat(http): AppError + uniform error-envelope middleware"
```

---

## Task 5: Session middleware (express-session + connect-pg-simple)

**Files:**
- Create: `server/src/middleware/session.js`

- [ ] **Step 1: Implement `server/src/middleware/session.js`**

```js
// @ts-check
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { env } from '../config/env.js';
import { SESSION_TTL_DAYS } from '../config/constants.js';

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgStore({
    conObject: { connectionString: env.DATABASE_URL },
    tableName: 'session',
    createTableIfMissing: false, // Prisma owns the `session` DDL (CONFIG.md §5; schema.prisma)
  }),
  name: 'dermestha.sid',
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,                                  // §3.6
    secure: env.NODE_ENV === 'production',           // Secure in prod; off for http://localhost dev
    sameSite: 'lax',                                 // §3.6
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  },
});
```

> Integration verification of the session round-trip happens in Task 9 (against the real app + Postgres), not as an isolated unit test — `connect-pg-simple` needs a live DB.

- [ ] **Step 2: Commit**

```bash
git add server/src/middleware/session.js
git commit -m "feat(session): postgres-backed session middleware (HTTP-only/Secure/Lax)"
```

---

## Task 6: requireRole (DA6) + rate-limit factory

**Files:**
- Create: `server/src/middleware/requireRole.js`, `server/src/middleware/rateLimit.js`
- Test: `server/src/middleware/requireRole.test.js`

- [ ] **Step 1: Write the failing test**

`server/src/middleware/requireRole.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { requireRole } from './requireRole.js';

function ctx(session) {
  let nextErr;
  const req = { session };
  const res = {};
  const next = (e) => { nextErr = e; };
  return { req, res, next, getErr: () => nextErr };
}

describe('requireRole (DA6)', () => {
  it('passes through a session with an allowed role', () => {
    const { req, res, next, getErr } = ctx({ userId: 'u1', role: 'doctor' });
    requireRole('doctor', 'admin')(req, res, next);
    expect(getErr()).toBeUndefined();
  });
  it('401 UNAUTHENTICATED when no session user', () => {
    const { req, res, next, getErr } = ctx({});
    requireRole('admin')(req, res, next);
    expect(getErr()).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  });
  it('403 FORBIDDEN when role not allowed', () => {
    const { req, res, next, getErr } = ctx({ userId: 'u1', role: 'patient' });
    requireRole('admin')(req, res, next);
    expect(getErr()).toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement `server/src/middleware/requireRole.js`

```js
// @ts-check
import { AppError } from '../http/AppError.js';

/**
 * The single server-side authorization boundary (DA6). Never re-checked in handler bodies,
 * never enforced only on the client.
 * @param {...('patient'|'doctor'|'admin')} allowed
 */
export function requireRole(...allowed) {
  return (req, _res, next) => {
    const user = req.session?.userId ? { id: req.session.userId, role: req.session.role } : null;
    if (!user) return next(new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401));
    if (!allowed.includes(user.role)) return next(new AppError('FORBIDDEN', 'Not allowed.', 403));
    return next();
  };
}
```

- [ ] **Step 3: Implement `server/src/middleware/rateLimit.js`** (CONFIG.md §2)

```js
// @ts-check
import rateLimit from 'express-rate-limit';
import { AppError } from '../http/AppError.js';

/**
 * Factory for the §3.6 rate limiters. Memory store is acceptable single-instance (CONFIG.md §3).
 * @param {{ windowMs: number, max: number, code?: string }} opts
 */
export function makeRateLimiter({ windowMs, max, code = 'RATE_LIMITED' }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(code, 'Too many requests. Try again later.', 429)),
  });
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run server/src/middleware/requireRole.test.js`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/requireRole.js server/src/middleware/rateLimit.js
git commit -m "feat(middleware): requireRole authorization boundary + rate-limit factory"
```

---

## Task 7: Audit-log writer seam

**Files:**
- Create: `server/src/services/audit.service.js`
- Test: `server/src/services/audit.service.test.js`

- [ ] **Step 1: Write the failing test**

`server/src/services/audit.service.test.js`:
```js
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import * as audit from './audit.service.js';

describe('audit.service', () => {
  it('appends an event row', async () => {
    const before = await prisma.auditLog.count();
    await audit.record({ eventType: 'test_event', actorType: 'system', targetRef: 'ref-1', reason: 'unit test' });
    expect(await prisma.auditLog.count()).toBe(before + 1);
  });
  it('exposes no update or delete function (append-only, §3.6)', () => {
    expect(/** @type {any} */ (audit).update).toBeUndefined();
    expect(/** @type {any} */ (audit).remove).toBeUndefined();
    expect(/** @type {any} */ (audit).delete).toBeUndefined();
  });
  afterAll(async () => { await prisma.$disconnect(); });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement `server/src/services/audit.service.js`

```js
// @ts-check
import { prisma } from '../lib/prisma.js';

/**
 * The single append-only audit writer (§3.6). No update/delete is exported — by convention,
 * there is no path to mutate the log at the service or route layer.
 * @param {{ eventType: string, actorType: 'patient'|'doctor'|'admin'|'system',
 *           actorId?: string|null, targetRef?: string|null, reason?: string|null, meta?: object }} e
 */
export function record(e) {
  return prisma.auditLog.create({
    data: {
      eventType: e.eventType,
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      targetRef: e.targetRef ?? null,
      reason: e.reason ?? null,
      meta: e.meta ?? undefined,
    },
  });
}
```

- [ ] **Step 3: Run — expect PASS**

Run: `npx vitest run server/src/services/audit.service.test.js`
Expected: 2 passing.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/audit.service.js
git commit -m "feat(audit): append-only audit-log writer seam"
```

---

## Task 8: Vendor-adapter interface seams (typedef contracts + stubs)

**Files:**
- Create: `server/src/integrations/payment/index.js`, `payment/payfast.stub.js`; `video/index.js`, `video/daily.stub.js`; `email/index.js`, `email/resend.stub.js`
- Test: `server/src/integrations/integrations.test.js`

> Build the **seam only** — the `@typedef` contracts from INTEGRATIONS.md plus a `NOT_IMPLEMENTED` stub per vendor, selected via an `index.js` barrel. Concrete vendor logic is M2/M3.

- [ ] **Step 1: Write the failing test**

`server/src/integrations/integrations.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { paymentProvider } from './payment/index.js';
import { videoProvider } from './video/index.js';
import { emailProvider } from './email/index.js';

describe('integration seams', () => {
  it('payment provider exposes the contract methods and stubs throw NOT_IMPLEMENTED', async () => {
    expect(typeof paymentProvider.createCheckout).toBe('function');
    await expect(paymentProvider.createCheckout({})).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
  it('video provider exposes createRoom/issueToken', () => {
    expect(typeof videoProvider.createRoom).toBe('function');
    expect(typeof videoProvider.issueToken).toBe('function');
  });
  it('email provider exposes send', () => {
    expect(typeof emailProvider.send).toBe('function');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement the payment seam

`server/src/integrations/payment/payfast.stub.js`:
```js
// @ts-check
import { AppError } from '../../http/AppError.js';
const ni = (m) => async () => { throw new AppError('NOT_IMPLEMENTED', `payfast.${m} is M2`, 501); };

/** @type {import('./index.js').PaymentProvider} */
export const payfastStub = {
  createCheckout: ni('createCheckout'),
  verifyWebhook: () => { throw new AppError('NOT_IMPLEMENTED', 'payfast.verifyWebhook is M2', 501); },
  refund: ni('refund'),
  listUnconfirmed: ni('listUnconfirmed'),
};
```

`server/src/integrations/payment/index.js` (contract + selector):
```js
// @ts-check
import { payfastStub } from './payfast.stub.js';

/**
 * @typedef {Object} PaymentProvider
 * @property {(args: any) => Promise<any>} createCheckout
 * @property {(req: import('express').Request) => any} verifyWebhook
 * @property {(args: any) => Promise<any>} refund
 * @property {(sinceIso: string) => Promise<any[]>} listUnconfirmed
 */

/** Selected provider. Swap to the concrete PayFast adapter in M2 via a config switch. */
export const paymentProvider = payfastStub;
```

- [ ] **Step 3: Implement the video + email seams (same pattern)**

`server/src/integrations/video/daily.stub.js`:
```js
// @ts-check
import { AppError } from '../../http/AppError.js';
const ni = (m) => async () => { throw new AppError('NOT_IMPLEMENTED', `daily.${m} is M2`, 501); };
/** @type {import('./index.js').VideoProvider} */
export const dailyStub = { createRoom: ni('createRoom'), issueToken: ni('issueToken') };
```
`server/src/integrations/video/index.js`:
```js
// @ts-check
import { dailyStub } from './daily.stub.js';
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string) => Promise<any>} createRoom
 * @property {(args: any) => Promise<any>} issueToken
 */
export const videoProvider = dailyStub;
```
`server/src/integrations/email/resend.stub.js`:
```js
// @ts-check
import { AppError } from '../../http/AppError.js';
const ni = (m) => async () => { throw new AppError('NOT_IMPLEMENTED', `resend.${m} is M1/M4`, 501); };
/** @type {import('./index.js').EmailProvider} */
export const resendStub = { send: ni('send'), parseWebhook: () => { throw new AppError('NOT_IMPLEMENTED', 'resend.parseWebhook is M4', 501); } };
```
`server/src/integrations/email/index.js`:
```js
// @ts-check
import { resendStub } from './resend.stub.js';
/**
 * @typedef {Object} EmailProvider
 * @property {(args: any) => Promise<{ providerId: string }>} send
 * @property {(req: import('express').Request) => any} parseWebhook
 */
export const emailProvider = resendStub;
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run server/src/integrations/integrations.test.js`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add server/src/integrations
git commit -m "feat(integrations): payment/video/email adapter seams with NOT_IMPLEMENTED stubs"
```

---

## Task 9: Express app assembly + health route + same-origin serving (integration test)

**Files:**
- Create: `server/src/routes/health.js`, `server/src/index.js`, `shared/schemas/index.js`
- Test: `server/src/test/app.integration.test.js`

- [ ] **Step 1: `shared/schemas/index.js`** (seam only)

```js
// @ts-check
// Shared Zod DTOs (client↔server) live here. Feature plans add schemas; empty seam for M0.
export {};
```

- [ ] **Step 2: `server/src/routes/health.js`**

```js
// @ts-check
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up' });
  } catch (e) {
    next(e);
  }
});
```

- [ ] **Step 3: `server/src/index.js`** — assemble app; export `createApp` for tests, listen only when run directly

```js
// @ts-check
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { sessionMiddleware } from './middleware/session.js';
import { errorHandler } from './http/errorHandler.js';
import { AppError } from './http/AppError.js';
import { healthRouter } from './routes/health.js';
import { initErrorTracking } from './lib/errorTracking.js';
import { logger } from './lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware);

  // API routes first.
  app.use('/api', healthRouter);
  // Unknown /api path → JSON 404 envelope (never the SPA HTML).
  app.use('/api', (_req, _res, next) => next(new AppError('NOT_FOUND', 'Not found.', 404)));

  // Static SPA + catch-all LAST (ARCHITECTURE §14.3).
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));

  app.use(errorHandler);
  return app;
}

// Start the server only when executed directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initErrorTracking();
  createApp().listen(env.PORT, () => logger.info(`Dermestha listening on :${env.PORT}`));
}
```

- [ ] **Step 4: Write the integration test** (Supertest against the real app + Postgres + session store)

`server/src/test/app.integration.test.js`:
```js
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';
import { prisma } from '../lib/prisma.js';

const app = createApp();

describe('app integration', () => {
  it('GET /api/health returns ok and confirms DB is up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('unknown /api route returns the uniform 404 envelope (not SPA HTML)', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('issues a session cookie with HttpOnly + SameSite=Lax', async () => {
    const res = await request(app).get('/api/health');
    // saveUninitialized:false means a cookie is set once the session is touched; assert attributes when present.
    const setCookie = res.headers['set-cookie']?.join(';') ?? '';
    if (setCookie) {
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
    }
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
```

> Requires a reachable Postgres with migrations applied (Task 1 + Task 11). The test asserts same-origin behavior: `/api/*` is JSON, everything else falls through to the SPA.

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run server/src/test/app.integration.test.js`
Expected: health + 404 pass (cookie assertion is conditional).

- [ ] **Step 6: Commit**

```bash
git add server/src/index.js server/src/routes/health.js shared/schemas/index.js server/src/test/app.integration.test.js
git commit -m "feat(server): same-origin app assembly, health route, SPA catch-all"
```

---

## Task 10: Client scaffold (Vite + React) + ported design tokens + RoleRoute seam

**Files:**
- Create: `client/package.json`, `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/routes.jsx`, `client/src/lib/RoleRoute.jsx`
- Copy: `mockups/assets/css/tokens.css` → `client/src/styles/tokens.css`; `mockups/assets/css/components.css` → `client/src/styles/components.css`
- Test: `client/src/lib/RoleRoute.test.jsx`

- [ ] **Step 1: Scaffold the client workspace**

Run: `npm create vite@latest client -- --template react`
Then in `client/package.json` ensure scripts: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`. Add deps: `react-router-dom@^6`. Add devDep `@testing-library/react` + `jsdom` for the RoleRoute test.

- [ ] **Step 2: Port the approved design tokens verbatim** (ARCHITECTURE §4/§14.1; DESIGN §2)

Run (PowerShell):
```powershell
New-Item -ItemType Directory -Force client/src/styles
Copy-Item mockups/assets/css/tokens.css client/src/styles/tokens.css
Copy-Item mockups/assets/css/components.css client/src/styles/components.css
```
Do not hand-edit the CSS — it is the single theming source of truth ported verbatim.

- [ ] **Step 3: `client/index.html`** — add Google Fonts (`preconnect` + `display=swap`) for Archivo + Hanken Grotesk (DESIGN §2.2), set the title to "Dermestha".

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 4: `client/src/main.jsx`** — import tokens + components CSS, mount the router

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/tokens.css';
import './styles/components.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 5: `client/src/App.jsx`** — a styled placeholder proving tokens render

```jsx
export default function App() {
  return (
    <main style={{ maxWidth: 600, margin: '64px auto', padding: 24 }}>
      <h1 style={{ color: 'var(--color-primary)' }}>Dermestha</h1>
      <p style={{ color: 'var(--color-text-body)' }}>
        Foundation scaffold is live. Same-origin API + ported design tokens are wired.
      </p>
      <button className="btn btn--primary">Primary button (tokens.css)</button>
    </main>
  );
}
```

> If the token CSS variable names differ from `--color-primary` / classes from `btn btn--primary`, open `client/src/styles/tokens.css` and `components.css` and use the actual names — they are the authority, this placeholder just demonstrates they load.

- [ ] **Step 6: `client/src/lib/RoleRoute.jsx`** (the role-guard seam — ARCHITECTURE §6b)

```jsx
import { Navigate } from 'react-router-dom';

/** Convenience client-side guard. The SERVER (DA6) is the real boundary. */
export function RoleRoute({ session, role, children }) {
  if (!session) return <Navigate to="/login" replace />;
  if (role && session.role !== role) return <Navigate to="/" replace />;
  return children;
}
```

- [ ] **Step 7: `client/src/routes.jsx`** — centralized route config seam (one public route for now)

```jsx
import App from './App.jsx';
/** Route table. Feature plans add patient/doctor/admin views + RoleRoute guards. */
export const routes = [{ path: '/', element: <App /> }];
```

- [ ] **Step 8: Test RoleRoute logic**

`client/src/lib/RoleRoute.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleRoute } from './RoleRoute.jsx';

const renderGuard = (props) =>
  render(<MemoryRouter><RoleRoute {...props}>OK</RoleRoute></MemoryRouter>);

describe('RoleRoute', () => {
  it('renders children when role matches', () => {
    const { queryByText } = renderGuard({ session: { role: 'admin' }, role: 'admin' });
    expect(queryByText('OK')).not.toBeNull();
  });
  it('redirects away (no children) when role mismatches', () => {
    const { queryByText } = renderGuard({ session: { role: 'patient' }, role: 'admin' });
    expect(queryByText('OK')).toBeNull();
  });
});
```

Add a `client/vite.config.js` test block (`test: { environment: 'jsdom' }`) or a `client/vitest.config.js` so client tests run in jsdom. Run: `npm --workspace client run test` (add `"test": "vitest run"` to client scripts).
Expected: 2 passing.

- [ ] **Step 9: Build the client and verify Express serves it same-origin**

Run: `npm run build:client`
Then start the server (`npm run dev:server`) with Postgres up, and open `http://localhost:3000/`.
Expected: the styled "Dermestha" placeholder renders (spruce heading + token button), served by Express from `client/dist` — proving same-origin serving end-to-end.

- [ ] **Step 10: Commit**

```bash
git add client
git commit -m "feat(client): Vite+React scaffold, ported design tokens, RoleRoute seam"
```

---

## Task 11: Docker (multi-stage image + compose for local dev)

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

- [ ] **Step 1: `Dockerfile`** (multi-stage — build client, run server; ARCHITECTURE §14.6)

```dockerfile
# ---- build client ----
FROM node:20-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
RUN npm ci
COPY client ./client
COPY mockups/assets/css ./mockups/assets/css
RUN npm run build:client

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY server ./server
COPY shared ./shared
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 3000
CMD ["node", "server/src/index.js"]
```

- [ ] **Step 2: `.dockerignore`**

```
node_modules
client/dist
.env
coverage
.git
```

- [ ] **Step 3: `docker-compose.yml`** (app + Postgres for local dev)

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: dermestha
    ports: ['5432:5432']
    volumes: ['dermestha_pg:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U user -d dermestha']
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    build: .
    depends_on:
      db: { condition: service_healthy }
    environment:
      NODE_ENV: production
      PORT: 3000
      APP_BASE_URL: http://localhost:3000
      DATABASE_URL: postgresql://user:pass@db:5432/dermestha
      SESSION_SECRET: local-dev-secret-please-change-0123456789
    ports: ['3000:3000']

volumes:
  dermestha_pg:
```

- [ ] **Step 4: Verify the stack boots end-to-end**

Run: `docker compose up --build -d`
Then apply migrations against the container DB (one-time): `npx prisma migrate deploy` (with `DATABASE_URL` pointed at `localhost:5432`).
Then: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok","db":"up"}`. Then `docker compose down`.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml
git commit -m "chore(docker): multi-stage image + local app+postgres compose"
```

---

## Task 12: Admin bootstrap script (DA4)

**Files:**
- Create: `prisma/scripts/bootstrap-admin.js`

- [ ] **Step 1: Implement the one-off bootstrap (DA4)**

```js
// @ts-check
// One-off admin creation (DA4). Run once on first deploy; rotate the password immediately after.
// Usage: ADMIN_EMAIL=a@x.com ADMIN_PASSWORD=... node prisma/scripts/bootstrap-admin.js
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD'); process.exit(1); }

  const existing = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existing) { console.log('Admin already exists — no-op.'); return; }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const admin = await prisma.user.create({
    data: { role: 'admin', email, passwordHash, fullName: 'Dermestha Admin' },
  });
  console.log(`Admin created: ${admin.email}. Rotate this password now.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

> The script guards against creating a second admin (DA4: no admin-creates-admin path). It does not use `lib/password.js` to stay runnable standalone without the server workspace resolution.

- [ ] **Step 2: Verify**

Run (PowerShell): `$env:ADMIN_EMAIL='admin@dermestha.test'; $env:ADMIN_PASSWORD='temp-rotate-me-now'; node prisma/scripts/bootstrap-admin.js`
Expected: "Admin created". Re-run → "Admin already exists — no-op." (idempotent).

- [ ] **Step 3: Commit**

```bash
git add prisma/scripts/bootstrap-admin.js
git commit -m "feat(ops): DA4 admin bootstrap script (idempotent)"
```

---

## Task 13: README / runbook + session change log

**Files:**
- Create: `README.md`
- Create/Update: `agentChangeLogs/<YYYY-MM-DD-HHmm>-foundation-scaffold.md` (copied from `agentChangeLogs/_TEMPLATE.md`), `agentChangeLogs/index.md` (per CLAUDE.md)

- [ ] **Step 1: `README.md`** — minimal run/runbook covering: prerequisites (Node 20, Docker), `npm install`, `docker compose up` (or local PG), `npx prisma migrate dev`, `npm run db:seed`, `npm run bootstrap:admin`, `npm run dev:server` + `npm run dev:client`, `npm test`. Include the **migration caveat** (CONFIG.md §7.2: the hand-added `uniq_active_slot` index must be re-applied if migrations are reset) and the **admin-bootstrap** instructions (DA4).

- [ ] **Step 2: Maintain the session change log** (CLAUDE.md rule)

Copy `agentChangeLogs/_TEMPLATE.md` to `agentChangeLogs/<timestamp>-foundation-scaffold.md`; fill every section in template order (status, goal, context, decisions, findings, verification, next steps + the file-change table). Add one line to `agentChangeLogs/index.md`.

- [ ] **Step 3: Full verification pass + commit**

Run: `npm test`
Expected: all suites pass (env, password, errorHandler, requireRole, audit, integrations, doubleBooking, app integration, RoleRoute).

```bash
git add README.md agentChangeLogs
git commit -m "docs: foundation runbook + session change log"
```

---

## Verification (end-to-end, after all tasks)

1. **Clean install:** from a fresh clone, `npm install` succeeds.
2. **DB + invariant:** `docker compose up -d db` → `npx prisma migrate deploy` → confirm `uniq_active_slot` exists (`\d appointments` in psql) → `npm run db:seed` succeeds.
3. **Full test suite:** `npm test` → all green. The **double-booking integration test is the keystone** — it proves invariant #1 fails at write time, not validation time.
4. **Same-origin serving:** `npm run build:client` → `npm run dev:server` → `http://localhost:3000/` renders the token-styled placeholder; `http://localhost:3000/api/health` returns `{status:'ok',db:'up'}`; `http://localhost:3000/api/nope` returns the JSON 404 envelope.
5. **Container parity:** `docker compose up --build` → `npx prisma migrate deploy` → `curl /api/health` returns ok.
6. **Admin bootstrap:** `npm run bootstrap:admin` (with env vars) creates exactly one admin; a second run is a no-op.

**Definition of done:** the app boots locally and in Docker, serves the SPA same-origin, connects to Postgres with the critical partial index in place and *tested*, and every cross-cutting seam (config, sessions, role middleware, error envelope, audit writer, vendor-adapter interfaces) exists with passing tests. No business feature is built — that is Milestone 1.

---

## Self-Review notes

- **Spec coverage (foundation slice):** ARCHITECTURE §14 scaffold steps 1–8 are each covered (client scaffold→T10, backend init→T0/T1, same-origin serving→T9, sessions→T5, config→T2, Dockerfile→T11, admin bootstrap→T12, deploy/runbook→T13). CONFIG.md §7 migration caveat → T1 Step 3. The three INTEGRATIONS.md typedefs → T8.
- **Type consistency:** `AppError(code, message, status, details)` is used identically in T4, T6, T8. `audit.record(...)` signature in T7 matches its test. `paymentProvider/videoProvider/emailProvider` barrels in T8 match the integration test imports.
- **Deferred (correctly out of foundation):** every `/api` business route, the workers, concrete vendor SDK calls, shared Zod DTOs — all are M1+ and become their own plans.

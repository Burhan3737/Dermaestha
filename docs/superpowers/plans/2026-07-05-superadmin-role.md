# Superadmin Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `superadmin` role that is a functional clone of `admin` this cycle (plumbing only) — a real DB enum value, an account to log in with, and every server authorization site that admits `admin` also admitting `superadmin` via explicit per-route dual-listing.

**Architecture:** No central role hierarchy. `requireRole(...)` is already variadic; we append `'superadmin'` explicitly to every call site that lists `'admin'` (23 calls, 6 files), fix 4 in-body admin checks, and coerce the audit `actorType` for superadmin→admin at 3 auth sites. Client guards widen to accept a role array. The server (DA6) remains the sole authorization boundary; the client is a convenience guard only.

**Tech Stack:** Node ESM, Express, Prisma 6.19.3 (PostgreSQL), Zod 3, React 19 + react-router-dom 6, Vitest 2 (server/shared via root `vitest.config.js`; client via `client/vitest.config.js`), Supertest for integration, Playwright (MCP) for e2e.

**Source of truth:** `docs/superpowers/specs/2026-07-05-superadmin-role-design.md`. This plan follows it exactly. All file:line references below were verified against the working tree during planning (no drift found).

## Global Constraints

- **Explicit dual-listing, no hierarchy.** Never teach `requireRole` that superadmin outranks admin. Add `'superadmin'` as an explicit argument only where `'admin'` already appears. `requireRole` calls WITHOUT `'admin'` are left unchanged (superadmin must not gain patient/doctor-scoped routes).
- **`enum AuditActorType` stays UNCHANGED** (`patient/doctor/admin/system`). Superadmin actions are audited as `actor_type='admin'` via coercion. No enum migration, no audit-filter schema change.
- **Do NOT change hard-coded `actorType: 'admin'` writes** (doctor/admin/medicine/appointment services). Only the three `actorType: user.role` writes in `auth/service.js` are coerced.
- **`appointment/controller.js:63`** (`actorType: req.session.role`) is on a `('patient','doctor')`-only route and is **not** reachable by superadmin — leave it unchanged.
- **`notification/service.js:102`** (`findFirst({ where: { role: 'admin' } })`) is recipient selection, not authorization — leave it unchanged.
- Money is Int PKR-paisa; all instants timestamptz/UTC. (Inherited repo invariants; this feature touches none of it.)
- **Approval gates (CLAUDE.md):** do NOT commit, push, create branches, or deploy without explicit user approval. Do NOT edit specs under `docs/specification/` mid-task; track doc-impact and apply only at the end after approval. The changelog under `agentChangeLogs/` is owned by the controller session — subagents must not create or edit it.

---

## File Structure

**Server — production code (edited):**
- `prisma/schema.prisma` — add `superadmin` to `enum Role`.
- `server/src/middleware/requireRole/requireRole.js` — JSDoc `@param` union only (no logic change).
- `server/src/modules/admin/index.js` — 9 call sites dual-listed.
- `server/src/modules/doctor/index.js` — 8 call sites dual-listed.
- `server/src/modules/medicine/index.js` — 3 call sites dual-listed.
- `server/src/modules/appointment/index.js` — 1 call site dual-listed (`:21`).
- `server/src/modules/prescription/index.js` — 1 call site dual-listed (`:12`).
- `server/src/modules/auth/index.js` — 1 call site dual-listed (`:69`).
- `server/src/modules/appointment/service.js` — in-body visibility (`:109`).
- `server/src/modules/prescription/service.js` — in-body visibility (`:126`).
- `server/src/modules/doctor/controller.js` — in-body `includeInactive` gate (`:12`).
- `server/src/modules/medicine/controller.js` — in-body `includeInactive` gate (`:8`).
- `server/src/modules/auth/service.js` — audit `actorType` coercion (`:52`, `:99`, `:118`).
- `shared/schemas/auth/auth.js` — `loginSchema.role` enum (`:16`).

**Scripts / seed (edited):**
- `prisma/scripts/seed-baseline.js` — add `baseline.superadmin@dermestha.test`.
- `prisma/scripts/bootstrap-admin.js` — create BOTH admin and superadmin; extract a testable idempotent helper.

**Client — production code (edited):**
- `client/src/lib/RoleRoute/RoleRoute.jsx` — widen `role` prop to string OR array.
- `client/src/modules/admin/admin.routes.jsx` — `guard` helper → `role={['admin','superadmin']}`.
- `client/src/modules/auth/views/Login/Login.jsx` — `DASHBOARD` map adds `superadmin: '/admin'` (`:10`).
- `client/src/modules/auth/views/SignUp/SignUp.jsx` — `DASHBOARD` map adds `superadmin: '/admin'` (`:10`).

**Tests (created / extended):**
- `server/test/unit/middleware/requireRole/requireRole.test.js` — extend (allow/deny).
- `shared/test/unit/schemas/auth/auth.test.js` — **create** (loginSchema role enum).
- `server/test/unit/modules/auth/service.test.js` — extend (actorType coercion).
- `server/test/unit/scripts/bootstrap-admin.test.js` — **create** (idempotent, both roles).
- `client/test/unit/lib/RoleRoute/RoleRoute.test.jsx` — extend (string + array).
- `server/test/integration/superadmin.test.js` — **create** (admin-route reach, no-404, no-403, login-audit).

**Migration:**
- `prisma/migrations/<new-timestamp>_init/migration.sql` — regenerated single baseline via the `dermestha-migration-reset` skill (re-append the `uniq_active_slot` partial index).

---

## Task Dependency Graph

```
Task 1 (schema edit) ─┐
Task 2 (seed edit) ───┼─> Task 3 (migration reset + reseed) ─> integration tests (Tasks 4,5,6) + Playwright (Task 11)
                      │
Task 4 requireRole ───┤   (server code Tasks 4–7 have no ordering dependency on each other;
Task 5 in-body ───────┤    only their DB-backed *integration* tests depend on Task 3)
Task 6 actorType ─────┤
Task 7 loginSchema ───┤
Task 8 client ────────┤
Task 9 bootstrap ─────┘
                      └─> Task 10 (full suite) ─> Task 11 (Playwright, PHASE 2)
```

**Key dependency:** Task 3 applies the `Role` enum to the dev DB. Any test that inserts a `role='superadmin'` row (the integration tests in Tasks 4/5/6) and the Playwright run (Task 11) will fail against a pre-migration DB. Unit tests that mock Prisma (requireRole, loginSchema, actorType-unit, RoleRoute, bootstrap) do NOT need Task 3.

---

### Task 1: Add `superadmin` to the `Role` enum

**Files:**
- Modify: `prisma/schema.prisma:30-34`

**Interfaces:**
- Produces: DB enum value `superadmin` usable as `role` on `User`.

This task is a pure schema-file edit. The destructive DB apply is the separate, human-gated Task 3 (so schema.prisma and seed-baseline.js are both ready before the single reset+reseed runs).

- [ ] **Step 1: Edit the enum**

In `prisma/schema.prisma`, change:

```prisma
enum Role {
  patient
  doctor
  admin
}
```

to:

```prisma
enum Role {
  patient
  doctor
  admin
  superadmin
}
```

Leave `enum AuditActorType` (lines 51–56) UNCHANGED.

- [ ] **Step 2: Verify the edit**

Run: `grep -A5 "enum Role" prisma/schema.prisma`
Expected: four values — `patient`, `doctor`, `admin`, `superadmin`. Confirm `enum AuditActorType` still lists exactly `patient/doctor/admin/system`.

---

### Task 2: Seed a baseline superadmin

**Files:**
- Modify: `prisma/scripts/seed-baseline.js:41-46` (EMAILS), `:92-94` area (user create), `:232-247` (printed accounts + ids)

**Interfaces:**
- Produces: `baseline.superadmin@dermestha.test` / `Test123!` in the dev baseline.

- [ ] **Step 1: Add the email**

In the `EMAILS` object (lines 41–46), add:

```js
const EMAILS = {
  admin: 'baseline.admin@dermestha.test',
  superadmin: 'baseline.superadmin@dermestha.test',
  patient1: 'baseline.patient1@dermestha.test',
  patient2: 'baseline.patient2@dermestha.test',
  doctor: 'baseline.doctor@dermestha.test',
};
```

- [ ] **Step 2: Create the superadmin row**

Immediately after the `admin` create (lines 92–94), add:

```js
  const superadmin = await prisma.user.create({
    data: { role: 'superadmin', email: EMAILS.superadmin, fullName: 'Baseline Superadmin', passwordHash },
  });
```

- [ ] **Step 3: Add it to the printed output**

In the final `console.log` payload, add `superadmin: EMAILS.superadmin` to `accounts` and `superadminId: superadmin.id` to `ids`:

```js
        accounts: {
          admin: EMAILS.admin,
          superadmin: EMAILS.superadmin,
          patient1: EMAILS.patient1,
          patient2: EMAILS.patient2,
          doctor: EMAILS.doctor,
        },
        ids: {
          adminId: admin.id,
          superadminId: superadmin.id,
          patient1Id: patient1.id,
          patient2Id: patient2.id,
          doctorId: doctor.id,
          medicineId: medicine.id,
        },
```

Also update the `BASELINE` header comment block (line ~14) to list the superadmin account (documentation parity; optional but recommended).

- [ ] **Step 4: Verify the edit (static)**

Run: `grep -n "superadmin" prisma/scripts/seed-baseline.js`
Expected: the EMAILS entry, the `prisma.user.create` with `role: 'superadmin'`, and the printed `accounts`/`ids` lines. Do NOT run the seed here — it runs as part of Task 3.

---

### Task 3: Regenerate the migration baseline + reset & reseed the dev DB (DISCRETE, DESTRUCTIVE)

> **⚠️ This task RESETS and RESEEDS the local dev database.** All existing local rows are destroyed and rebuilt from the seed. It is local-dev-only (`DATABASE_URL` must be `localhost`). One step is agent-blocked and must be run by the human.

**Files:**
- Delete + regenerate: `prisma/migrations/2026*_*/` → new `prisma/migrations/<timestamp>_init/migration.sql`

**Interfaces:**
- Consumes: Task 1 (schema enum) + Task 2 (updated seed) — both must be saved first, because the migration-reset flow reseeds at its final step using the updated `seed-baseline.js`.
- Produces: a dev DB whose `Role` enum has 4 values and that contains `baseline.superadmin@dermestha.test`; a single consolidated baseline migration with the `uniq_active_slot` partial index re-appended.

**Decision (design open question #1 resolved):** Use the **baseline-regenerate** path via the `dermestha-migration-reset` skill (task-directed), NOT an additive migration. Rationale: the app is not yet deployed and the repo keeps a single consolidated baseline (ADR-46).

- [ ] **Step 1: Announce the skill and get go/no-go**

Per CLAUDE.md, tell the user you are about to use the `dermestha-migration-reset` skill and that it RESETS+RESEEDS the dev DB. Wait for approval before proceeding.

- [ ] **Step 2: Safety pre-flight**

Run: `grep DATABASE_URL .env` → MUST be localhost. Abort if remote.
Run: `npx prisma migrate status` → snapshot.
Stop any running `dev:server`/node process (Windows EPERM on `prisma generate` otherwise).

- [ ] **Step 3: Follow the dermestha-migration-reset procedure**

Execute the skill's steps 1–7 exactly:
1. `rm -rf prisma/migrations/2026*_*/` (keep `migration_lock.toml`).
2. **HUMAN RUNS (agent-blocked):** `!npx prisma migrate reset --force --skip-seed`
3. `npx prisma migrate dev --name init --create-only`
4. Hand-append the `uniq_active_slot` partial index verbatim to the new `migration.sql` (see skill; this is the #1 landmine — never skip it).
5. `npx prisma migrate dev` then `npx prisma generate`.
6. Seed with the **updated** baseline: `node --env-file=.env prisma/scripts/seed-baseline.js` (this is where Task 2's superadmin lands). Note: `npm run db:seed` (the separate `prisma/seed.js`) does **not** create a superadmin — use `seed-baseline.js` for the superadmin-aware baseline.

- [ ] **Step 4: Verify**

Run: `npx prisma migrate status` → "1 migration found ... up to date!"
Run: verify the enum in the DB (psql): `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='Role' ORDER BY e.enumsortorder;` → `patient, doctor, admin, superadmin`.
Run: verify the partial index exists (skill step 7).
Confirm the seed output lists `superadmin: baseline.superadmin@dermestha.test`.

---

### Task 4: Dual-list `superadmin` on every admin-admitting route + JSDoc

**Files:**
- Modify: `server/src/middleware/requireRole/requireRole.js:7` (JSDoc only)
- Modify: `server/src/modules/admin/index.js` lines 28, 30, 32, 34, 36, 38, 39, 41, 42
- Modify: `server/src/modules/doctor/index.js` lines 61, 64, 65, 66, 67, 68, 69, 70
- Modify: `server/src/modules/medicine/index.js` lines 24, 31, 33
- Modify: `server/src/modules/appointment/index.js:21`
- Modify: `server/src/modules/prescription/index.js:12`
- Modify: `server/src/modules/auth/index.js:69`
- Test: `server/test/unit/middleware/requireRole/requireRole.test.js` (extend)
- Test: `server/test/integration/superadmin.test.js` (create)

**Interfaces:**
- Consumes: `requireRole(...allowed)` (variadic, unchanged logic). Integration test consumes Task 3's DB enum.
- Produces: `server/test/integration/superadmin.test.js` with a superadmin `request.agent`; later tasks extend this file.

**Note on TDD altitude:** `requireRole` is already variadic, so the unit tests below are green-on-arrival contract guards (they lock intent + protect against regression). The real red→green driver for this task is the **integration** test: a superadmin agent gets **403** on `/api/admin/alerts` before the call sites are dual-listed, **200** after.

- [ ] **Step 1: Write the failing integration test**

Create `server/test/integration/superadmin.test.js` (model on `server/test/integration/admin.test.js`):

```js
import { describe, it, expect, beforeAll } from 'vitest';
process.env.EMAIL_PROVIDER = 'console';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');
const { hashPassword } = await import('#src/lib/password/password.js');

const app = createApp();
const uniq = (t) => `superadmin_${t}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

describe('superadmin — functional admin clone', () => {
  let saAgent, saEmail, saUserId;

  beforeAll(async () => {
    saEmail = `${uniq('sa')}@test.local`;
    const sa = await prisma.user.create({
      data: { role: 'superadmin', email: saEmail, fullName: 'Test Superadmin', passwordHash: await hashPassword('SaPass123') },
    });
    saUserId = sa.id;
    saAgent = request.agent(app);
    await saAgent.post('/api/auth/login').send({ email: saEmail, password: 'SaPass123' }).expect(200);
  });

  it('reaches an /api/admin/* route (alerts feed)', async () => {
    const res = await saAgent.get('/api/admin/alerts');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/test/integration/superadmin.test.js`
Expected: FAIL — `expect(res.status).toBe(200)` gets **403** (the `beforeAll` login already succeeds because Task 6 is not yet done ONLY if login throws; if the suite is run before Task 6, the `beforeAll` login will 500 — run this task's integration assertion after Task 6, or temporarily accept that this file goes fully green once Tasks 4+6 are both in. See Task 10 for the consolidated run). The route-guard assertion is the red signal for THIS task.

> Sequencing note: superadmin **login** itself 500s until Task 6 (audit coercion). If you execute strictly task-by-task, run Task 4's route assertion via a unit-level check first, or land Task 6 immediately after Task 4 and let the consolidated integration run (Task 10) prove both. The plan orders Task 6 right after so the integration file is green end-to-end at Task 10.

- [ ] **Step 3: Update the `requireRole` JSDoc**

`server/src/middleware/requireRole/requireRole.js:7`:

```js
 * @param {...('patient'|'doctor'|'admin'|'superadmin')} allowed
```

- [ ] **Step 4: Dual-list the 23 call sites**

Append `, 'superadmin'` inside each `requireRole(...)` that contains `'admin'`. Exact edits:

`server/src/modules/admin/index.js` — 9 sites: each `requireRole('admin')` → `requireRole('admin', 'superadmin')` at lines 28, 30, 32, 34, 36, 38, 39, 41, 42.

`server/src/modules/doctor/index.js`:
- line 61: `requireRole('doctor', 'admin')` → `requireRole('doctor', 'admin', 'superadmin')`
- lines 64, 65, 66, 67, 68, 69, 70: each `requireRole('admin')` → `requireRole('admin', 'superadmin')`

`server/src/modules/medicine/index.js`:
- line 24: `requireRole('doctor', 'admin')` → `requireRole('doctor', 'admin', 'superadmin')`
- lines 31, 33: each `requireRole('admin')` → `requireRole('admin', 'superadmin')`

`server/src/modules/appointment/index.js:21`: `requireRole('patient', 'doctor', 'admin')` → `requireRole('patient', 'doctor', 'admin', 'superadmin')`

`server/src/modules/prescription/index.js:12`: `requireRole('patient', 'doctor', 'admin')` → `requireRole('patient', 'doctor', 'admin', 'superadmin')`

`server/src/modules/auth/index.js:69`: `requireRole('patient', 'doctor', 'admin')` → `requireRole('patient', 'doctor', 'admin', 'superadmin')`

**Do NOT touch** the admin-free calls: `appointment/index.js:18,19,20,24,28`; `prescription/index.js:10`; `doctor/index.js:76`.

- [ ] **Step 5: Add the requireRole unit contract tests**

Append to `server/test/unit/middleware/requireRole/requireRole.test.js`:

```js
  it('passes a superadmin on a route that dual-lists admin + superadmin', () => {
    const { req, res, next, getErr } = ctx({ userId: 'u1', role: 'superadmin' });
    requireRole('admin', 'superadmin')(req, res, next);
    expect(getErr()).toBeUndefined();
  });
  it('403 FORBIDDEN for superadmin on a doctor/patient-only route', () => {
    const { req, res, next, getErr } = ctx({ userId: 'u1', role: 'superadmin' });
    requireRole('patient', 'doctor')(req, res, next);
    expect(getErr()).toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run server/test/unit/middleware/requireRole/requireRole.test.js`
Expected: PASS (all, incl. the two new).
Run (with DB up, after Task 6 lands): `npx vitest run server/test/integration/superadmin.test.js`
Expected: the alerts assertion PASSES (200).

- [ ] **Step 7: Commit** (only after user approval per CLAUDE.md)

---

### Task 5: Admit superadmin in the 4 in-body checks

**Files:**
- Modify: `server/src/modules/appointment/service.js:109`
- Modify: `server/src/modules/prescription/service.js:126`
- Modify: `server/src/modules/doctor/controller.js:12`
- Modify: `server/src/modules/medicine/controller.js:8`
- Test: `server/test/integration/superadmin.test.js` (extend)

**Interfaces:**
- Consumes: superadmin `saAgent` from the integration file; a booked appointment + prescription fixture (create inline, mirroring `admin.test.js`).
- Produces: integration coverage that superadmin sees `GET /appointments/:id`, the prescription list, and inactive doctor/medicine listings.

- [ ] **Step 1: Write the failing integration tests**

Add to `server/test/integration/superadmin.test.js`. Create a doctor + patient + confirmed appointment inline (reuse the `admin.test.js` onboarding pattern) so the superadmin can read them:

```js
  it('GET /appointments/:id returns the appointment (no 404) for superadmin', async () => {
    // arrange: create doctor+patient+appointment via prisma (see admin.test.js pattern)
    const res = await saAgent.get(`/api/appointments/${apptId}`);
    expect(res.status).toBe(200);
  });
  it('GET /appointments/:id/prescriptions returns the list (no 404) for superadmin', async () => {
    const res = await saAgent.get(`/api/appointments/${apptId}/prescriptions`);
    expect(res.status).toBe(200);
  });
  it('includeInactive doctors listing is allowed (no 403) for superadmin', async () => {
    const res = await saAgent.get('/api/doctors?includeInactive=true');
    expect(res.status).toBe(200);
  });
  it('includeInactive medicines listing is allowed (no 403) for superadmin', async () => {
    const res = await saAgent.get('/api/medicines?includeInactive=true');
    expect(res.status).toBe(200);
  });
```

(Wire `apptId` in `beforeAll`; see `admin.test.js` for the exact `prisma.appointment.create` shape.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/test/integration/superadmin.test.js`
Expected: FAIL — appointment/prescription reads **404**; includeInactive reads **403**.

- [ ] **Step 3: Fix the visibility OR-chains**

`server/src/modules/appointment/service.js:109`, change:

```js
      role === 'admin');
```

to:

```js
      ['admin', 'superadmin'].includes(role));
```

`server/src/modules/prescription/service.js:126`, change:

```js
      role === 'admin');
```

to:

```js
      ['admin', 'superadmin'].includes(role));
```

- [ ] **Step 4: Fix the inverted `includeInactive` gates**

`server/src/modules/doctor/controller.js:12`, change:

```js
      if (req.session?.role !== 'admin') throw new AppError('FORBIDDEN', 'Not allowed.', 403);
```

to:

```js
      if (!['admin', 'superadmin'].includes(req.session?.role)) throw new AppError('FORBIDDEN', 'Not allowed.', 403);
```

`server/src/modules/medicine/controller.js:8`, change:

```js
    if (includeInactive && req.session.role !== 'admin') {
```

to:

```js
    if (includeInactive && !['admin', 'superadmin'].includes(req.session.role)) {
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run server/test/integration/superadmin.test.js`
Expected: the four new assertions PASS (200). Also re-run `server/test/integration/admin.test.js` and `booking.test.js` to confirm admin/patient/doctor behavior is unchanged.

- [ ] **Step 6: Commit** (after approval)

---

### Task 6: Coerce audit `actorType` for superadmin at the 3 auth sites

**Files:**
- Modify: `server/src/modules/auth/service.js:52` (login), `:99` (resetPassword), `:118` (changePassword)
- Test: `server/test/unit/modules/auth/service.test.js` (extend)
- Test: `server/test/integration/superadmin.test.js` (extend)

**Interfaces:**
- Consumes: mocked `audit.record` (unit) / real audit rows (integration).
- Produces: superadmin login no longer 500s; audit rows for superadmin carry `actorType: 'admin'`.

**Why this is a hard blocker:** every successful login awaits `audit.record({ actorType: user.role, ... })` with no catch. Writing `'superadmin'` (not in `AuditActorType`) makes Prisma throw → **login 500s** → a superadmin can never authenticate. This task is what makes the Task 4/5 integration logins succeed.

- [ ] **Step 1: Write the failing unit test**

Append to `server/test/unit/modules/auth/service.test.js`:

```js
  it('login coerces a superadmin actorType to admin in the audit write', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'sa1', role: 'superadmin', fullName: 'SA', mustChangePassword: false, passwordHash: 'hash:pw',
    });
    await auth.login({ email: 'sa@b.com', password: 'pw' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'login', actorType: 'admin', actorId: 'sa1' }),
    );
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/test/unit/modules/auth/service.test.js -t "coerces a superadmin"`
Expected: FAIL — `actorType` received is `'superadmin'`, expected `'admin'`.

- [ ] **Step 3: Apply the coercion at all three sites**

At `server/src/modules/auth/service.js` lines 52, 99, and 118, change each:

```js
    actorType: user.role,
```

to:

```js
    actorType: user.role === 'superadmin' ? 'admin' : user.role,
```

(All three writes reference `user.role`. Do NOT change the hard-coded `actorType: 'admin'` writes elsewhere, and do NOT change `appointment/controller.js:63`.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run server/test/unit/modules/auth/service.test.js`
Expected: PASS (incl. existing doctor/patient login tests — `actorType` for non-superadmin is unchanged).

- [ ] **Step 5: Add the integration login-audit assertion**

Add to `server/test/integration/superadmin.test.js`:

```js
  it('superadmin login succeeds and writes an audit row with actor_type=admin', async () => {
    const row = await prisma.auditLog.findFirst({
      where: { eventType: 'login', actorId: saUserId },
      orderBy: { at: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row.actorType).toBe('admin');
  });
```

(The `beforeAll` login in the file already exercises the success path; this asserts the persisted row.)

- [ ] **Step 6: Run to verify pass**

Run (DB up): `npx vitest run server/test/integration/superadmin.test.js`
Expected: PASS — the whole file is now green (login 200, admin route 200, no 404/403, audit `admin`).

- [ ] **Step 7: Commit** (after approval)

---

### Task 7: Add `superadmin` to the login validation enum

**Files:**
- Modify: `shared/schemas/auth/auth.js:16`
- Test: `shared/test/unit/schemas/auth/auth.test.js` (create)

**Interfaces:**
- Produces: `loginSchema` accepts `role: 'superadmin'`.

**Why:** `role` is an optional, non-authoritative hint, but a login form submitting `role='superadmin'` would be **400-rejected** by Zod before auth runs.

- [ ] **Step 1: Write the failing test**

Create `shared/test/unit/schemas/auth/auth.test.js` (model on the existing `shared/test/unit/schemas/appointment/appointment.test.js` import style):

```js
import { describe, it, expect } from 'vitest';
import { loginSchema } from '#shared/schemas/auth/auth.js';

describe('loginSchema.role', () => {
  it('accepts superadmin', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: 'x', role: 'superadmin' });
    expect(r.success).toBe(true);
  });
  it('still accepts admin/doctor/patient and rejects an unknown role', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x', role: 'admin' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x', role: 'root' }).success).toBe(false);
  });
});
```

(Confirm the `#shared` alias resolves to `./shared` per `vitest.config.js`. If a different existing auth-schema test import convention exists, match it.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run shared/test/unit/schemas/auth/auth.test.js`
Expected: FAIL — `role: 'superadmin'` currently returns `success: false`.

- [ ] **Step 3: Extend the enum**

`shared/schemas/auth/auth.js:16`, change:

```js
  role: z.enum(['patient', 'doctor', 'admin']).optional(),
```

to:

```js
  role: z.enum(['patient', 'doctor', 'admin', 'superadmin']).optional(),
```

Leave `shared/schemas/admin/admin.js:29` (`auditQuerySchema.actorType`) UNCHANGED — no `superadmin` actor-type value is ever written.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run shared/test/unit/schemas/auth/auth.test.js`
Expected: PASS.

- [ ] **Step 5: Commit** (after approval)

---

### Task 8: Widen the client guards + dashboard routing

**Files:**
- Modify: `client/src/lib/RoleRoute/RoleRoute.jsx`
- Modify: `client/src/modules/admin/admin.routes.jsx:22-26` (the `guard` helper)
- Modify: `client/src/modules/auth/views/Login/Login.jsx:10`
- Modify: `client/src/modules/auth/views/SignUp/SignUp.jsx:10`
- Test: `client/test/unit/lib/RoleRoute/RoleRoute.test.jsx` (extend)

**Interfaces:**
- Consumes: `RoleRoute({ session, role, children })` where `role` may be `undefined | string | string[]`.
- Produces: admin routes guarded by `['admin','superadmin']`; superadmin lands on `/admin`.

**Client tests run in the client workspace** (`client/vitest.config.js`, jsdom), NOT the root Vitest project.

- [ ] **Step 1: Write the failing RoleRoute tests**

Append to `client/test/unit/lib/RoleRoute/RoleRoute.test.jsx`:

```js
  it('renders children when session.role is in a role array', () => {
    const { queryByText } = renderGuard({ session: { role: 'superadmin' }, role: ['admin', 'superadmin'] });
    expect(queryByText('OK')).not.toBeNull();
  });
  it('redirects when session.role is not in the role array', () => {
    const { queryByText } = renderGuard({ session: { role: 'patient' }, role: ['admin', 'superadmin'] });
    expect(queryByText('OK')).toBeNull();
  });
  it('still supports a string role (backwards compatible)', () => {
    const { queryByText } = renderGuard({ session: { role: 'doctor' }, role: 'doctor' });
    expect(queryByText('OK')).not.toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && npx vitest run test/unit/lib/RoleRoute/RoleRoute.test.jsx`
Expected: FAIL — the array cases throw / mismatch because the current guard does a strict `session.role !== role` (string) comparison against an array.

- [ ] **Step 3: Widen `RoleRoute`**

Replace `client/src/lib/RoleRoute/RoleRoute.jsx` body:

```jsx
import { Navigate } from 'react-router-dom';

/** Convenience client-side guard. The SERVER (DA6) is the real boundary. `role` may be a string or an array. */
export function RoleRoute({ session, role, children }) {
  if (!session) return <Navigate to="/login" replace />;
  const allowed = role == null ? null : Array.isArray(role) ? role : [role];
  if (allowed && !allowed.includes(session.role)) return <Navigate to="/" replace />;
  return children;
}
```

- [ ] **Step 4: Point the admin guard at the array**

`client/src/modules/admin/admin.routes.jsx`, the `guard` helper (lines 22–26):

```jsx
const guard = (session, el) => (
  <RoleRoute session={session} role={['admin', 'superadmin']}>
    {el}
  </RoleRoute>
);
```

- [ ] **Step 5: Add superadmin to both DASHBOARD maps**

`client/src/modules/auth/views/Login/Login.jsx:10` and `client/src/modules/auth/views/SignUp/SignUp.jsx:10`, change:

```js
const DASHBOARD = { patient: '/browse', doctor: '/doctor', admin: '/admin' };
```

to:

```js
const DASHBOARD = { patient: '/browse', doctor: '/doctor', admin: '/admin', superadmin: '/admin' };
```

- [ ] **Step 6: Run to verify pass**

Run: `cd client && npx vitest run test/unit/lib/RoleRoute/RoleRoute.test.jsx`
Expected: PASS. Also run the existing `Login.test.jsx` / `SignUp.test.jsx` to confirm no regression.

- [ ] **Step 7: Commit** (after approval)

---

### Task 9: Bootstrap both an admin and a superadmin (idempotent)

**Files:**
- Modify: `prisma/scripts/bootstrap-admin.js`
- Test: `server/test/unit/scripts/bootstrap-admin.test.js` (create)

**Interfaces:**
- Produces: `export async function ensureRoleUser({ prisma, role, email, password, fullName })` returning `'created' | 'skipped'`; a `main()` that reads env and calls it for both roles.

**Design decision to surface for approval:** the current script runs `main()` at import and calls `process.exit`, which is not unit-testable and whose "skip if a user of that role exists" keys off global DB state (flaky in the shared integration DB). To make the required "creates both / no-op on re-run" test possible without DB coupling, extract a pure, client-injected `ensureRoleUser` helper and unit-test it with a mocked Prisma client. The CLI behavior is unchanged. This is a small, justified structural change (flag for controller sign-off).

- [ ] **Step 1: Write the failing unit test**

Create `server/test/unit/scripts/bootstrap-admin.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureRoleUser } from '../../../../prisma/scripts/bootstrap-admin.js';

const makeClient = (existing) => ({
  user: {
    findFirst: vi.fn(async () => existing),
    create: vi.fn(async ({ data }) => ({ id: 'x', ...data })),
  },
});

beforeEach(() => vi.clearAllMocks());

describe('ensureRoleUser', () => {
  it('creates a user when none of that role exists', async () => {
    const client = makeClient(null);
    const out = await ensureRoleUser({ prisma: client, role: 'superadmin', email: 'sa@x.com', password: 'p', fullName: 'SA' });
    expect(out).toBe('created');
    expect(client.user.create).toHaveBeenCalledOnce();
    expect(client.user.create.mock.calls[0][0].data.role).toBe('superadmin');
  });
  it('is a no-op when a user of that role already exists', async () => {
    const client = makeClient({ id: 'exists' });
    const out = await ensureRoleUser({ prisma: client, role: 'admin', email: 'a@x.com', password: 'p', fullName: 'A' });
    expect(out).toBe('skipped');
    expect(client.user.create).not.toHaveBeenCalled();
  });
});
```

(Add `server/test/unit/scripts/` — the root Vitest `include` already globs `server/test/**/*.test.js`. Note: `bootstrap-admin.js` imports `argon2`; if the real hash is too slow/noisy in a unit test, `vi.mock('argon2', ...)` at the top.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/test/unit/scripts/bootstrap-admin.test.js`
Expected: FAIL — `ensureRoleUser` is not exported.

- [ ] **Step 3: Refactor the script to export the helper and create both**

Replace `prisma/scripts/bootstrap-admin.js`:

```js
// @ts-check
// One-off admin + superadmin creation (DA4). Run once on first deploy; rotate passwords immediately after.
// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... node prisma/scripts/bootstrap-admin.js
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const hash = (password) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

/**
 * Idempotently ensure a user of `role` exists. Skips if one already does.
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureRoleUser({ prisma, role, email, password, fullName }) {
  const existing = await prisma.user.findFirst({ where: { role } });
  if (existing) {
    console.log(`${role} already exists — no-op.`);
    return 'skipped';
  }
  const passwordHash = await hash(password);
  const user = await prisma.user.create({ data: { role, email, passwordHash, fullName } });
  console.log(`${role} created: ${user.email}. Rotate this password now.`);
  return 'created';
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const saEmail = process.env.SUPERADMIN_EMAIL;
  const saPassword = process.env.SUPERADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD'); process.exit(1); }
  if (!saEmail || !saPassword) { console.error('Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD'); process.exit(1); }

  const prisma = new PrismaClient();
  try {
    await ensureRoleUser({ prisma, role: 'admin', email: adminEmail, password: adminPassword, fullName: 'Dermestha Admin' });
    await ensureRoleUser({ prisma, role: 'superadmin', email: saEmail, password: saPassword, fullName: 'Dermestha Superadmin' });
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

(Confirm the `import.meta.url === file://${process.argv[1]}` direct-invoke guard matches the platform; on Windows an alternative is `process.argv[1]?.endsWith('bootstrap-admin.js')`. Pick whichever the repo already uses if there is a precedent; otherwise the endsWith form is the most portable.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run server/test/unit/scripts/bootstrap-admin.test.js`
Expected: PASS.

- [ ] **Step 5: Commit** (after approval)

---

### Task 10: Full automated-suite verification (gate)

**Files:** none (verification only).

**Interfaces:**
- Consumes: all prior tasks. Requires the migrated dev DB (Task 3) up for the integration tests.

- [ ] **Step 1: Run the server + shared suite**

Run: `npm test` (root — `vitest run`, includes `server/test/**` and `shared/test/**`).
Expected: PASS. Specifically confirm: `superadmin.test.js` green; `admin.test.js`, `auth.test.js`, `booking.test.js`, `prescription.test.js` still green (no regression).

- [ ] **Step 2: Run the client suite**

Run: `npm --workspace client run test` (or `cd client && npx vitest run`).
Expected: PASS — `RoleRoute.test.jsx`, `Login.test.jsx`, `SignUp.test.jsx` all green.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (no new errors from the edits).

---

### Task 11: Playwright end-to-end verification (PHASE 2 — against the already-running app at http://localhost:3000)

**Files:** none (interactive MCP-Playwright verification; may optionally be codified as a `*.spec.js` under Playwright later).

**Interfaces:**
- Consumes: the reseeded DB (Task 3) with `baseline.superadmin@dermestha.test` and `baseline.admin@dermestha.test`; the app running on `http://localhost:3000` (client) with the server API reachable.

**Precondition (surface to user):** the running app must be pointed at the DB reseeded in Task 3, i.e. the app was (re)started after the migration+reseed. If the app was running against a pre-migration DB, restart it before this task or the superadmin account/login will not exist.

- [ ] **Step 1: Superadmin logs in and lands on /admin**

`browser_navigate` → `http://localhost:3000/login`. `browser_fill_form` / `browser_type` email `baseline.superadmin@dermestha.test`, password `Test123!`. Submit.
Assert (`browser_snapshot`): URL is `/admin` (redirects to `/admin/doctors`); no error alert.

- [ ] **Step 2: All 6 admin sidebar tabs are present**

`browser_snapshot`. Assert the sidebar shows: **Doctors, Medicines, Payment review, Records & audit, System health, Settings** (matches `ADMIN_LINKS` in `admin.routes.jsx`).

- [ ] **Step 3: Each admin view opens without error**

Click each tab (`/admin/doctors`, `/admin/medicines`, `/admin/review`, `/admin/records`, `/admin/alerts`, `/admin/settings`). After each, `browser_snapshot` and assert the view rendered (no 403/blank/error boundary, no redirect to `/`). Optionally `browser_network_requests` to confirm the underlying `/api/admin/*` (and `/api/doctors?includeInactive=true`, `/api/medicines?includeInactive=true`) calls returned 200, not 403.

- [ ] **Step 4: Existing admin still works (no regression)**

Log out. Log in as `baseline.admin@dermestha.test` / `Test123!`. Assert lands on `/admin`, all 6 tabs present, each view opens. (Confirms dual-listing did not break admin.)

- [ ] **Step 5: A patient is blocked from /admin**

Log out. Log in as `baseline.patient1@dermestha.test` / `Test123!`. `browser_navigate` → `http://localhost:3000/admin`. Assert redirected away from `/admin` (client `RoleRoute` sends to `/`), i.e. the admin views are not shown.

---

## Doc-Impact (tracked; applied only at END, after code committed + user approval — per CLAUDE.md & design §9)

Recorded now, not edited mid-task. Per design §9 and the `dermestha-migration-reset` skill step 8:
- **04 DATABASE** — `Role` enum now has 4 values; new baseline migration filename (current-state pointer + §4b footer).
- **05 API** — superadmin admitted on all admin + admin-shared routes (explicit dual-listing).
- **08 SECURITY** — access-control role table gains `superadmin`; note explicit-dual-listing model, the in-body checks that also admit superadmin, and the audit `actorType` coercion (superadmin→admin).
- **11 ADR** — new ADR: "Superadmin as explicit-dual-listed admin clone (no central hierarchy); audit actor coercion superadmin→admin"; plus the migration-baseline ADR if the filename changes (ADR-46 lineage).
- **12 TEST CASES** — superadmin allow/deny + login-audit cases.
- **13 STATUS** — build-progress entry; "Prisma schema + migrations" row updated for the new baseline.
- **15 CONFIG** — new env vars `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (bootstrap).

---

## Self-Review

**Spec coverage** (design §2–§8 + parent deliverable items 1–10):
- §2 schema enum → Task 1; migration → Task 3. ✅ (AuditActorType unchanged — Global Constraints.)
- §3a 23 dual-listed calls + JSDoc → Task 4. ✅ (verified: admin 9, doctor 8, medicine 3, appointment 1, prescription 1, auth 1 = 23.)
- §3b 4 in-body checks → Task 5. ✅ §3c non-changes → Global Constraints. ✅
- §4 loginSchema enum → Task 7; admin.js:29 unchanged → Task 7 note. ✅
- §5 actorType coercion (3 sites) → Task 6; hard-coded `'admin'` + controller.js:63 unchanged → Global Constraints + Task 6. ✅
- §6 client (RoleRoute/admin.routes/Login/SignUp) → Task 8. ✅
- §7 bootstrap both + idempotent → Task 9; seed baseline → Task 2. ✅
- §8 tests: requireRole unit → Task 4; RoleRoute unit → Task 8; in-body integration → Task 5; actorType integration+unit → Task 6; bootstrap → Task 9; full suite → Task 10; Playwright success criteria → Task 11. ✅

**Placeholder scan:** every code step shows the exact before/after. The only intentional "fill from pattern" is the inline appointment/prescription fixture in Task 5 Step 1 — it points to `admin.test.js` for the exact `prisma.*.create` shapes rather than duplicating ~40 lines; the executing agent must copy that shape.

**Type/name consistency:** `ensureRoleUser({ prisma, role, email, password, fullName }) => 'created'|'skipped'` is defined in Task 9 and consumed only by its own test. `RoleRoute` `role: undefined|string|string[]` is consistent across Tasks 8 (impl) and its test. Integration file `saAgent`/`saUserId`/`apptId` names are consistent across Tasks 4/5/6.

**Verified file:line drift vs the design doc:** none. All 23 requireRole sites, the 4 in-body checks, the 3 actorType sites, `loginSchema:16`, both `DASHBOARD:10` maps, and the `admin.routes.jsx` guard were opened and confirmed at the exact lines the design lists.

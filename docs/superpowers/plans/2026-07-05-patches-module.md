# Patches Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a superadmin-only "Patches" surface — a standalone `/api/patches` backend module that lists deployed JS patch files and runs them non-blockingly against the DB, recording every execution (running/success/failed) with full history, plus a superadmin-only client view.

**Architecture:** Patch files are version-controlled JS modules (`prisma/patches/NNN-slug.js` exporting `up(tx)`) baked into the deployed image. A new `server/src/modules/patch/` module (loader + service + controller + router) discovers them and, on a superadmin request, inserts a `PatchExecution` ledger row and kicks off the patch **without awaiting** — the request returns `202` immediately; a total `try/catch` around the background `$transaction` records success or failure to the ledger so a failing patch can neither block nor crash the server. The client view (own module, superadmin-guarded) lists all files with live status + history and polls while any patch runs.

**Tech Stack:** Node ESM, Express, Prisma 6 (PostgreSQL), Zod 3, React 19 + react-router-dom 6 + @tanstack/react-query **v5**, Vitest 2 (server/shared via root `vitest.config.js`; client via `client/vitest.config.js`, `#src` alias), Supertest (integration), Playwright (MCP) for e2e.

**Source of truth:** `docs/superpowers/specs/2026-07-05-patches-module-design.md`. All file:line references verified against the working tree during planning.

## Global Constraints

- **Own module, own route.** Patches live at `/api/patches` (new `patch` module). Do NOT add anything to `/api/admin/*`.
- **Superadmin-only.** Every patch route uses `requireRole('superadmin')` — never `'admin'`. This is the first surface where superadmin diverges from admin.
- **Depends on the (uncommitted) superadmin-role plumbing:** `Role.superadmin` in the schema, `RoleRoute` accepting an array (already in the working tree), and the client `['admin','superadmin']` guards. Do not revert those.
- **Non-blocking + failure-isolated.** The run request MUST NOT `await` patch execution. The background runner MUST wrap everything in `try/catch` and record failure to `patch_executions` — a thrown patch must never produce an unhandled rejection or a 500 to the operator.
- **Data/DML only in patches; schema DDL stays in Prisma migrations** (ADR-46 single-baseline discipline).
- **Forward-only, run-once by default.** No `down()`. Non-`repeatable` patches are blocked from a second successful run by the ledger.
- **Audit actorType coercion:** a superadmin's audited actions are logged as `actorType:'admin'` (established in the superadmin-role design §5). The patch runner logs `actorType:'admin'`, `actorId:` the superadmin id.
- Money is Int PKR-paisa; all instants timestamptz/UTC (inherited invariants; this feature touches neither).
- **Approval gates (CLAUDE.md):** do NOT commit, push, branch, or deploy without explicit user approval. Do NOT edit `docs/specification/` mid-task; track doc-impact and apply only at the end after approval. The `agentChangeLogs/` changelog is owned by the controller session — subagents must not create or edit it.

---

## File Structure

**Server — production code:**
- `prisma/schema.prisma` — add `enum PatchStatus` + `model PatchExecution` (Task 1).
- `prisma/patches/001-example-noop.js` — shipped example patch (Task 3).
- `prisma/patches/README.md` — patch-authoring contract + DDL boundary (Task 3).
- `server/src/modules/patch/loader.js` — discover/validate/checksum patch files (Task 3).
- `server/src/modules/patch/service.js` — `list()`, `run()`, `runPatch()` (Task 4).
- `server/src/modules/patch/controller.js` — HTTP layer (Task 5).
- `server/src/modules/patch/index.js` — router, superadmin guard, rate-limit (Task 5).
- `server/src/routes.js` — mount `patchRouter` at `/api/patches` (Task 5).

**Client — production code:**
- `client/src/context/session/session.jsx` — export `SessionContext` + add `useOptionalSession()` (Task 6).
- `client/src/layouts/SidebarLayout/SidebarLayout.jsx` — role-filter links (Task 6).
- `client/src/modules/admin/admin.routes.jsx` — add the superadmin-only Patches link to `ADMIN_LINKS` (Task 6).
- `client/src/modules/patch/usePatches.js` — query (polling) + run mutation (Task 7).
- `client/src/modules/patch/views/Patches/Patches.jsx` — the view (Task 7).
- `client/src/modules/patch/patch.routes.jsx` — `/admin/patches` route, superadmin-guarded (Task 7).
- `client/src/routes.jsx` — aggregate `patchRoutes(session)` (Task 7).

**Tests:**
- `server/test/unit/modules/patch/loader.test.js` + `fixtures/` (Task 3).
- `server/test/unit/modules/patch/service.test.js` (Task 4).
- `server/test/integration/patch.superadmin.test.js` (Task 5).
- `client/test/unit/layouts/SidebarLayout/SidebarLayout.test.jsx` — extend (Task 6).
- `client/test/unit/modules/patch/views/Patches/Patches.test.jsx` — create (Task 7).

**Migration:** regenerated single baseline `prisma/migrations/<timestamp>_init/migration.sql` via `dermestha-migration-reset` (re-append `uniq_active_slot`) (Task 2).

---

## Task Dependency Graph

```
Task 1 (schema) ─> Task 2 (migration reset+reseed, DESTRUCTIVE/human-gated) ─┐
                                                                             ├─> Task 5 integration
Task 3 (loader) ─> Task 4 (service) ─────────────────────────────────────────┘
Task 5 (controller+router+wiring)
Task 6 (client nav) ─> Task 7 (client view/module)
All ─> Task 8 (full suite + lint) ─> Task 9 (Playwright, PHASE 2)
```

- Unit tests in Tasks 3, 4, 6, 7 do NOT need the DB. Only Task 5's integration test needs Task 2.
- Server Tasks 3–5 and client Tasks 6–7 are independent given the API contract below.

**API contract (shared by server + client tasks):**
- `GET /api/patches` → `{ patches: Array<{ id, description, repeatable, checksum, status: 'never_run'|'running'|'success'|'failed'|'interrupted', drift: boolean, lastExecution: Execution|null, executions: Execution[] }> }`
- `POST /api/patches/:id/run` → `202 { executionId, status:'running' }`; `404 PATCH_NOT_FOUND`; `409 PATCH_ALREADY_APPLIED` | `PATCH_ALREADY_RUNNING`.
- `Execution = { id, patchId, checksum, status, executedBy, error: string|null, result: object|null, startedAt: ISO, finishedAt: ISO|null }`.

---

### Task 1: Schema — `PatchExecution` model + `PatchStatus` enum

**Files:**
- Modify: `prisma/schema.prisma` (enums block ~line 52; models section)

**Interfaces:**
- Produces: Prisma models `PatchExecution` (`patch_executions`) + `PatchStatus` enum usable by the service.

Pure schema-file edit. The destructive DB apply is the separate human-gated Task 2.

- [ ] **Step 1: Add the `PatchStatus` enum**

In `prisma/schema.prisma`, immediately after the `AuditActorType` enum (ends ~line 57), add:

```prisma
enum PatchStatus {
  running
  success
  failed
}
```

- [ ] **Step 2: Add the `PatchExecution` model**

After the `AuditLog` model (ends ~line 282), add:

```prisma
/// Append-only history of every patch run (one row per execution). Written only by the patch
/// service. The Patches view reads this for per-patch status + history. See
/// docs/superpowers/specs/2026-07-05-patches-module-design.md §3.
model PatchExecution {
  id         String      @id @default(cuid())
  /// The patch file's declared id, e.g. "001-example-noop" (NOT a file path).
  patchId    String      @map("patch_id")
  /// sha256 of the file contents at run time (drift detection vs. a later edited redeploy).
  checksum   String
  status     PatchStatus @default(running)
  /// The superadmin User.id who ran it (plain string, no FK — durable like AuditLog.actorId).
  executedBy String      @map("executed_by")
  /// Failure message when status=failed (null otherwise).
  error      String?
  /// Success payload returned by up(tx), e.g. { rowsAffected } (null on failure).
  result     Json?
  startedAt  DateTime    @default(now()) @map("started_at") @db.Timestamptz(6)
  finishedAt DateTime?   @map("finished_at") @db.Timestamptz(6)

  @@index([patchId])
  @@index([startedAt])
  @@map("patch_executions")
}
```

- [ ] **Step 3: Verify the edit (static)**

Run: `grep -nE "enum PatchStatus|model PatchExecution|patch_executions" prisma/schema.prisma`
Expected: the enum, the model, and the `@@map("patch_executions")` line all present. Do NOT apply to the DB here.

- [ ] **Step 4: Commit** (after user approval per CLAUDE.md)

---

### Task 2: Regenerate the migration baseline + reset & reseed the dev DB (DISCRETE, DESTRUCTIVE)

> **⚠️ RESETS + RESEEDS the local dev database.** Local-dev-only (`DATABASE_URL` must be `localhost`). One step is agent-blocked and must be run by the human. Same pattern as the superadmin cycle's Task 3.

**Files:**
- Delete + regenerate: `prisma/migrations/2026*_*/` → new `prisma/migrations/<timestamp>_init/migration.sql`

**Interfaces:**
- Consumes: Task 1 (schema). Produces: a dev DB with the `patch_executions` table + `PatchStatus` enum, single consolidated baseline with `uniq_active_slot` re-appended.

**Decision:** baseline-regenerate via the `dermestha-migration-reset` skill (app not yet deployed; single-baseline per ADR-46; the superadmin baseline `20260705115543_init` is itself still uncommitted so it is folded in here).

- [ ] **Step 1: Announce the skill and get go/no-go**

Per CLAUDE.md, tell the user you are about to use `dermestha-migration-reset` and that it RESETS+RESEEDS the dev DB. Wait for approval.

- [ ] **Step 2: Safety pre-flight**

Run: `grep DATABASE_URL .env` → MUST be localhost; abort if remote.
Run: `npx prisma migrate status` → snapshot.
Stop any running `dev:server`/node process (Windows EPERM on `prisma generate` otherwise).

- [ ] **Step 3: Follow the dermestha-migration-reset procedure**

Execute the skill's steps exactly:
1. `rm -rf prisma/migrations/2026*_*/` (keep `migration_lock.toml`).
2. **HUMAN RUNS (agent-blocked):** `!npx prisma migrate reset --force --skip-seed`
3. `npx prisma migrate dev --name init --create-only`
4. Hand-append the `uniq_active_slot` partial index verbatim to the new `migration.sql` (skill's #1 landmine — never skip):
   ```sql
   CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
     WHERE state IN ('pending','confirmed');
   ```
5. `npx prisma migrate dev` then `npx prisma generate`.
6. Seed: `node --env-file=.env prisma/scripts/seed-baseline.js` (creates the baseline superadmin the integration/e2e use).

- [ ] **Step 4: Verify**

Run: `npx prisma migrate status` → "up to date".
Run (psql): `\d patch_executions` → table exists with `patch_id`, `checksum`, `status`, `executed_by`, `error`, `result`, `started_at`, `finished_at`.
Run (psql): `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='PatchStatus' ORDER BY e.enumsortorder;` → `running, success, failed`.
Confirm the `uniq_active_slot` partial index exists (skill's verify step).

- [ ] **Step 5: Commit** (after approval) — schema + regenerated migration together.

---

### Task 3: Patch loader + shipped example patch

**Files:**
- Create: `server/src/modules/patch/loader.js`
- Create: `prisma/patches/001-example-noop.js`
- Create: `prisma/patches/README.md`
- Create: `server/test/unit/modules/patch/loader.test.js`
- Create: `server/test/unit/modules/patch/fixtures/valid/010-ok.js`
- Create: `server/test/unit/modules/patch/fixtures/invalid/020-bad.js`

**Interfaces:**
- Produces:
  - `loadPatches(dir?) => Promise<Array<{ id:string, description:string, repeatable:boolean, up:Function, filename:string, checksum:string }>>` (throws on a malformed module).
  - `loadPatch(id, dir?) => Promise<Patch|null>`.
  - `PATCHES_DIR` (absolute path to `prisma/patches`).

- [ ] **Step 1: Write the failing loader test**

Create `server/test/unit/modules/patch/fixtures/valid/010-ok.js`:

```js
export const id = '010-ok';
export const description = 'Valid fixture patch.';
export const repeatable = false;
export async function up() {
  return { rowsAffected: 0 };
}
```

Create `server/test/unit/modules/patch/fixtures/invalid/020-bad.js`:

```js
// Missing `up` and `description` on purpose — loader must reject this.
export const id = '020-bad';
```

Create `server/test/unit/modules/patch/loader.test.js`:

```js
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPatches, loadPatch } from '#src/modules/patch/loader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const validDir = path.join(here, 'fixtures/valid');
const invalidDir = path.join(here, 'fixtures/invalid');

describe('patch loader', () => {
  it('loads a valid patch with a 64-char sha256 checksum', async () => {
    const patches = await loadPatches(validDir);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ id: '010-ok', description: 'Valid fixture patch.', repeatable: false });
    expect(patches[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof patches[0].up).toBe('function');
  });

  it('loadPatch finds by id and returns null for an unknown id', async () => {
    expect((await loadPatch('010-ok', validDir))?.id).toBe('010-ok');
    expect(await loadPatch('nope', validDir)).toBeNull();
  });

  it('throws on a malformed patch module', async () => {
    await expect(loadPatches(invalidDir)).rejects.toThrow(/Invalid patch module/);
  });

  it('returns [] when the directory does not exist', async () => {
    expect(await loadPatches(path.join(here, 'fixtures/missing'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/test/unit/modules/patch/loader.test.js`
Expected: FAIL — `#src/modules/patch/loader.js` does not exist.

- [ ] **Step 3: Implement the loader**

Create `server/src/modules/patch/loader.js`:

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Absolute path to the shipped patches directory (repo-root/prisma/patches). */
export const PATCHES_DIR = path.resolve(__dirname, '../../../../prisma/patches');

/**
 * Discover, validate, and checksum every `.js` patch module in `dir`.
 * @param {string} [dir]
 * @returns {Promise<Array<{ id:string, description:string, repeatable:boolean, up:Function, filename:string, checksum:string }>>}
 */
export async function loadPatches(dir = PATCHES_DIR) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  const patches = [];
  for (const filename of files) {
    const full = path.join(dir, filename);
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    const mod = await import(pathToFileURL(full).href);
    if (typeof mod.id !== 'string' || typeof mod.description !== 'string' || typeof mod.up !== 'function') {
      throw new Error(`Invalid patch module ${filename}: must export { id:string, description:string, up:function }`);
    }
    patches.push({
      id: mod.id,
      description: mod.description,
      repeatable: mod.repeatable === true,
      up: mod.up,
      filename,
      checksum,
    });
  }
  return patches;
}

/** @param {string} id @param {string} [dir] */
export async function loadPatch(id, dir = PATCHES_DIR) {
  return (await loadPatches(dir)).find((p) => p.id === id) ?? null;
}
```

- [ ] **Step 4: Create the shipped example patch + README**

Create `prisma/patches/001-example-noop.js`:

```js
// Example patch (safe no-op). Copy this shape for real patches.
// DATA/DML remediation ONLY — schema DDL belongs in Prisma migrations (ADR-46).
export const id = '001-example-noop';
export const description = 'Example no-op: verifies DB connectivity inside a transaction, changes nothing.';
export const repeatable = true; // safe to re-run

/** @param {import('@prisma/client').Prisma.TransactionClient} tx */
export async function up(tx) {
  const rows = await tx.$queryRaw`SELECT 1 AS ok`;
  return { rowsAffected: 0, note: `connectivity ok (${rows.length} row)` };
}
```

Create `prisma/patches/README.md`:

```markdown
# DB Patches

Version-controlled, superadmin-run database remediation scripts. Deployed with the image and
executed on demand from the Patches view (`/admin/patches`) — see
`docs/superpowers/specs/2026-07-05-patches-module-design.md`.

## Authoring a patch

Add `NNN-slug.js` (numeric prefix orders the list) exporting:

- `id` (string) — stable identifier, match the filename stem.
- `description` (string) — shown in the UI.
- `repeatable` (boolean, optional, default `false`) — `false` = run-once (ledger-guarded).
- `up(tx)` (async) — receives a Prisma transaction client; return a small JSON summary
  (e.g. `{ rowsAffected }`) captured into the execution ledger.

## Rules

- **DATA/DML only.** Schema DDL (new tables/columns/enums) goes through Prisma migrations, not here.
- **Forward-only.** No `down()`. Fix a mistake with a new patch.
- Runs inside a `$transaction` — any throw rolls the whole patch back and is recorded as `failed`.
- Keep it idempotent where practical; run-once patches are blocked from a second successful run.
```

- [ ] **Step 5: Run the loader test to verify pass**

Run: `npx vitest run server/test/unit/modules/patch/loader.test.js`
Expected: PASS (all four).

- [ ] **Step 6: Commit** (after approval)

---

### Task 4: Patch service — list / run / runPatch

**Files:**
- Create: `server/src/modules/patch/service.js`
- Create: `server/test/unit/modules/patch/service.test.js`

**Interfaces:**
- Consumes: `loadPatches`/`loadPatch` (Task 3); `prisma` client; `AppError`; `audit.record`.
- Produces:
  - `list(client?) => Promise<Array<PatchView>>` (shape per the API contract).
  - `run({ patchId, userId }, client?) => Promise<{ executionId, status:'running' }>` (throws `AppError` 404/409).
  - `runPatch({ patch, executionId, userId }, client?) => Promise<void>` (background; never throws).

- [ ] **Step 1: Write the failing service tests**

Create `server/test/unit/modules/patch/service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/patch/loader.js', () => ({
  loadPatches: vi.fn(),
  loadPatch: vi.fn(),
}));
vi.mock('#src/services/audit/audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));

import { loadPatches, loadPatch } from '#src/modules/patch/loader.js';
import * as audit from '#src/services/audit/audit.service.js';
import * as service from '#src/modules/patch/service.js';

const fakeClient = () => ({
  patchExecution: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(async ({ data }) => ({ id: 'exec1', ...data })),
    update: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn(async (cb) => cb({})),
});

beforeEach(() => vi.clearAllMocks());

describe('patch service — run guards', () => {
  it('throws 404 for an unknown patch', async () => {
    loadPatch.mockResolvedValue(null);
    await expect(service.run({ patchId: 'x', userId: 'sa1' }, fakeClient())).rejects.toMatchObject({ status: 404 });
  });

  it('throws 409 PATCH_ALREADY_APPLIED for a non-repeatable patch with a prior success', async () => {
    loadPatch.mockResolvedValue({ id: 'p', repeatable: false, checksum: 'c', up: vi.fn() });
    const client = fakeClient();
    client.patchExecution.findMany.mockResolvedValue([{ status: 'success' }]);
    await expect(service.run({ patchId: 'p', userId: 'sa1' }, client)).rejects.toMatchObject({ code: 'PATCH_ALREADY_APPLIED', status: 409 });
  });

  it('throws 409 PATCH_ALREADY_RUNNING when a run is in flight', async () => {
    loadPatch.mockResolvedValue({ id: 'p', repeatable: true, checksum: 'c', up: vi.fn() });
    const client = fakeClient();
    client.patchExecution.findMany.mockResolvedValue([{ status: 'running' }]);
    await expect(service.run({ patchId: 'p', userId: 'sa1' }, client)).rejects.toMatchObject({ code: 'PATCH_ALREADY_RUNNING', status: 409 });
  });

  it('creates a running row and returns immediately (does not await up)', async () => {
    let resolved = false;
    const up = vi.fn(() => new Promise((r) => setTimeout(() => { resolved = true; r({ rowsAffected: 1 }); }, 50)));
    loadPatch.mockResolvedValue({ id: 'p', repeatable: true, checksum: 'c', up });
    const client = fakeClient();
    const out = await service.run({ patchId: 'p', userId: 'sa1' }, client);
    expect(out).toEqual({ executionId: 'exec1', status: 'running' });
    expect(client.patchExecution.create).toHaveBeenCalledWith({
      data: { patchId: 'p', checksum: 'c', status: 'running', executedBy: 'sa1' },
    });
    expect(resolved).toBe(false); // returned before up settled
  });
});

describe('patch service — runPatch (background)', () => {
  it('finalizes success with the result and writes an audit row', async () => {
    const up = vi.fn().mockResolvedValue({ rowsAffected: 3 });
    const client = fakeClient();
    await service.runPatch({ patch: { id: 'p', checksum: 'c', up }, executionId: 'exec1', userId: 'sa1' }, client);
    expect(client.patchExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'exec1' },
      data: expect.objectContaining({ status: 'success', result: { rowsAffected: 3 } }),
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'patch_run', actorType: 'admin', actorId: 'sa1',
    }));
  });

  it('finalizes failed with the error message and never throws', async () => {
    const up = vi.fn().mockRejectedValue(new Error('boom'));
    const client = fakeClient();
    await expect(
      service.runPatch({ patch: { id: 'p', checksum: 'c', up }, executionId: 'exec1', userId: 'sa1' }, client),
    ).resolves.toBeUndefined();
    expect(client.patchExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'exec1' },
      data: expect.objectContaining({ status: 'failed', error: 'boom' }),
    }));
  });
});

describe('patch service — list', () => {
  it('derives never_run / success + drift from the ledger', async () => {
    loadPatches.mockResolvedValue([{ id: 'p', description: 'd', repeatable: false, checksum: 'newsum', up: vi.fn() }]);
    const client = fakeClient();
    client.patchExecution.findMany.mockResolvedValue([
      { id: 'e2', patchId: 'p', status: 'success', checksum: 'oldsum', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
    ]);
    const out = await service.list(client);
    expect(out[0]).toMatchObject({ id: 'p', status: 'success', drift: true });
    expect(out[0].executions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/test/unit/modules/patch/service.test.js`
Expected: FAIL — `#src/modules/patch/service.js` does not exist.

- [ ] **Step 3: Implement the service**

Create `server/src/modules/patch/service.js`:

```js
// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import * as audit from '../../services/audit/audit.service.js';
import { loadPatches, loadPatch } from './loader.js';

/** A `running` row older than this is shown as `interrupted` (server crashed/redeployed mid-run). */
const STALE_MS = 10 * 60 * 1000;

/** @param {{ status:string, startedAt:string|Date }|null} latest */
function deriveStatus(latest) {
  if (!latest) return 'never_run';
  if (latest.status === 'running') {
    return Date.now() - new Date(latest.startedAt).getTime() > STALE_MS ? 'interrupted' : 'running';
  }
  return latest.status; // 'success' | 'failed'
}

/** List every available patch file joined with its execution history + derived status/drift. */
export async function list(client = prisma) {
  const [patches, rows] = await Promise.all([
    loadPatches(),
    client.patchExecution.findMany({ orderBy: { startedAt: 'desc' } }),
  ]);
  return patches.map((p) => {
    const executions = rows.filter((r) => r.patchId === p.id).slice(0, 10);
    const latest = executions[0] ?? null;
    const lastSuccess = executions.find((r) => r.status === 'success') ?? null;
    return {
      id: p.id,
      description: p.description,
      repeatable: p.repeatable,
      checksum: p.checksum,
      status: deriveStatus(latest),
      drift: Boolean(lastSuccess && lastSuccess.checksum !== p.checksum),
      lastExecution: latest,
      executions,
    };
  });
}

/**
 * Validate + start a patch run. Inserts a `running` ledger row and kicks off the patch WITHOUT
 * awaiting it (non-blocking). Returns as soon as the row exists.
 * @param {{ patchId:string, userId:string }} args
 */
export async function run({ patchId, userId }, client = prisma) {
  const patch = await loadPatch(patchId);
  if (!patch) throw new AppError('PATCH_NOT_FOUND', 'Unknown patch.', 404);

  const existing = await client.patchExecution.findMany({ where: { patchId } });
  if (existing.some((e) => e.status === 'running')) {
    throw new AppError('PATCH_ALREADY_RUNNING', 'This patch is already running.', 409);
  }
  if (!patch.repeatable && existing.some((e) => e.status === 'success')) {
    throw new AppError('PATCH_ALREADY_APPLIED', 'This patch has already been applied.', 409);
  }

  const execution = await client.patchExecution.create({
    data: { patchId, checksum: patch.checksum, status: 'running', executedBy: userId },
  });

  // Fire-and-track: NOT awaited. Errors are fully handled inside runPatch — a failing patch must
  // never block the response or crash the process.
  runPatch({ patch, executionId: execution.id, userId }, client).catch(() => {});

  return { executionId: execution.id, status: 'running' };
}

/**
 * Background runner: execute the patch in a transaction and finalize the ledger row. NEVER throws.
 * @param {{ patch:{ id:string, checksum:string, up:Function }, executionId:string, userId:string }} args
 */
export async function runPatch({ patch, executionId, userId }, client = prisma) {
  try {
    const result = await client.$transaction((tx) => patch.up(tx));
    await client.patchExecution.update({
      where: { id: executionId },
      data: { status: 'success', result: result ?? undefined, finishedAt: new Date() },
    });
    await audit.record({
      eventType: 'patch_run', actorType: 'admin', actorId: userId,
      meta: { patchId: patch.id, checksum: patch.checksum, executionId, status: 'success' },
    });
  } catch (e) {
    await client.patchExecution.update({
      where: { id: executionId },
      data: { status: 'failed', error: String(e?.message ?? e).slice(0, 1000), finishedAt: new Date() },
    }).catch(() => {});
    await audit.record({
      eventType: 'patch_run', actorType: 'admin', actorId: userId,
      meta: { patchId: patch.id, checksum: patch.checksum, executionId, status: 'failed' },
    }).catch(() => {});
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run server/test/unit/modules/patch/service.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit** (after approval)

---

### Task 5: Controller + router + wiring + integration test

**Files:**
- Create: `server/src/modules/patch/controller.js`
- Create: `server/src/modules/patch/index.js`
- Modify: `server/src/routes.js` (import + mount before the `/api` 404 catch-all)
- Create: `server/test/integration/patch.superadmin.test.js`

**Interfaces:**
- Consumes: `patchService.list/run` (Task 4); `requireRole` (`superadmin`); `makeRateLimiter`. Integration consumes Task 2's DB + the shipped `001-example-noop` patch.
- Produces: `patchRouter` mounted at `/api/patches`.

- [ ] **Step 1: Write the failing integration test**

Create `server/test/integration/patch.superadmin.test.js` (model on `server/test/integration/admin.test.js`):

```js
import { describe, it, expect, beforeAll } from 'vitest';
process.env.EMAIL_PROVIDER = 'console';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');
const { hashPassword } = await import('#src/lib/password/password.js');

const app = createApp();
const uniq = (t) => `patch_${t}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeAgent(role) {
  const email = `${uniq(role)}@test.local`;
  const user = await prisma.user.create({
    data: { role, email, fullName: `Test ${role}`, passwordHash: await hashPassword('Passw0rd!') },
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200);
  return { agent, userId: user.id };
}

describe('patches — superadmin-only surface', () => {
  let sa, admin;

  beforeAll(async () => {
    sa = await makeAgent('superadmin');
    admin = await makeAgent('admin');
  });

  it('superadmin lists patches incl. the shipped example', async () => {
    const res = await sa.agent.get('/api/patches');
    expect(res.status).toBe(200);
    const example = res.body.patches.find((p) => p.id === '001-example-noop');
    expect(example).toBeTruthy();
    expect(['never_run', 'success', 'running']).toContain(example.status);
  });

  it('admin is forbidden from listing (403)', async () => {
    const res = await admin.agent.get('/api/patches');
    expect(res.status).toBe(403);
  });

  it('admin is forbidden from running (403)', async () => {
    const res = await admin.agent.post('/api/patches/001-example-noop/run');
    expect(res.status).toBe(403);
  });

  it('unknown patch id returns 404', async () => {
    const res = await sa.agent.post('/api/patches/does-not-exist/run');
    expect(res.status).toBe(404);
  });

  it('superadmin runs the example patch → 202, resolves to success, ledger + audit written', async () => {
    const runRes = await sa.agent.post('/api/patches/001-example-noop/run');
    expect(runRes.status).toBe(202);
    expect(runRes.body.status).toBe('running');
    const executionId = runRes.body.executionId;

    // Poll until the background run finalizes (non-blocking model).
    let row;
    for (let i = 0; i < 25; i++) {
      row = await prisma.patchExecution.findUnique({ where: { id: executionId } });
      if (row && row.status !== 'running') break;
      await sleep(100);
    }
    expect(row.status).toBe('success');
    expect(row.executedBy).toBe(sa.userId);
    expect(row.finishedAt).not.toBeNull();

    const auditRow = await prisma.auditLog.findFirst({
      where: { eventType: 'patch_run', actorId: sa.userId },
      orderBy: { at: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorType).toBe('admin'); // superadmin→admin coercion
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/test/integration/patch.superadmin.test.js`
Expected: FAIL — `/api/patches` is not mounted (404 on the list route).

- [ ] **Step 3: Implement the controller**

Create `server/src/modules/patch/controller.js`:

```js
// @ts-check
import * as patchService from './service.js';

export async function list(_req, res, next) {
  try {
    res.json({ patches: await patchService.list() });
  } catch (e) {
    next(e);
  }
}

export async function run(req, res, next) {
  try {
    const result = await patchService.run({ patchId: req.params.id, userId: req.session.userId });
    res.status(202).json(result);
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 4: Implement the router**

Create `server/src/modules/patch/index.js`:

```js
// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import { makeRateLimiter } from '../../middleware/rateLimit/rateLimit.js';

// Patch runs are rare + consequential; a low ceiling is plenty and blunts accidental spamming.
const patchRunLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  code: 'RATE_LIMITED',
  keyGenerator: (req) => req.session?.userId ?? req.ip,
});

export const patchRouter = Router();
// GET /api/patches — list available patches + execution history (superadmin-only).
patchRouter.get('/', requireRole('superadmin'), c.list);
// POST /api/patches/:id/run — start a non-blocking run (superadmin-only).
patchRouter.post('/:id/run', requireRole('superadmin'), patchRunLimiter, c.run);
```

- [ ] **Step 5: Wire the router into `routes.js`**

In `server/src/routes.js`, add the import alongside the other module routers (after line 11):

```js
import { patchRouter } from './modules/patch/index.js';
```

And mount it among the feature routers, BEFORE the `/api` 404 catch-all (after the analytics line, ~line 29):

```js
  app.use('/api/patches', patchRouter);
```

- [ ] **Step 6: Run the integration test to verify pass**

Run (DB up, migrated per Task 2): `npx vitest run server/test/integration/patch.superadmin.test.js`
Expected: PASS (all). If `001-example-noop` shows `success` from a prior run and you re-run the suite, the example is `repeatable:true` so the run still returns 202 and resolves to `success`.

- [ ] **Step 7: Commit** (after approval)

---

### Task 6: Role-aware sidebar + the superadmin-only Patches link

**Files:**
- Modify: `client/src/context/session/session.jsx` (export `SessionContext`, add `useOptionalSession`)
- Modify: `client/src/layouts/SidebarLayout/SidebarLayout.jsx` (filter links by role)
- Modify: `client/src/modules/admin/admin.routes.jsx` (add the Patches link with `roles`)
- Modify: `client/test/unit/layouts/SidebarLayout/SidebarLayout.test.jsx` (extend)

**Interfaces:**
- Consumes: `useOptionalSession()` (new) → `{ session }|null`.
- Produces: `SidebarLayout` hides link entries whose `roles` array excludes the current role; `ADMIN_LINKS` gains `{ to:'/admin/patches', label:'Patches', roles:['superadmin'] }`.

**Client tests run in the client workspace** (`client/vitest.config.js`, jsdom, `#src` alias).

- [ ] **Step 1: Write the failing SidebarLayout role-filter test**

Append to `client/test/unit/layouts/SidebarLayout/SidebarLayout.test.jsx` (the file already mocks the api + imports `SidebarLayout`). Add the context import near the top imports:

```js
import { SessionContext } from '#src/context/session/session.jsx';
```

And add these cases inside the `describe('SidebarLayout', ...)` block:

```js
  const withRole = (role, links) =>
    render(
      <MemoryRouter>
        <SessionContext.Provider value={{ session: role ? { role } : null, loading: false }}>
          <SidebarLayout links={links}>x</SidebarLayout>
        </SessionContext.Provider>
      </MemoryRouter>,
    );

  const LINKS = [
    { to: '/admin/doctors', label: 'Doctors' },
    { to: '/admin/patches', label: 'Patches', roles: ['superadmin'] },
  ];

  it('hides a roles-gated link from a non-matching role', () => {
    withRole('admin', LINKS);
    expect(screen.getByRole('link', { name: 'Doctors' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Patches' })).toBeNull();
  });

  it('shows a roles-gated link to the matching role', () => {
    withRole('superadmin', LINKS);
    expect(screen.getByRole('link', { name: 'Patches' })).toBeTruthy();
  });

  it('shows ungated links even with no session', () => {
    withRole(null, LINKS);
    expect(screen.getByRole('link', { name: 'Doctors' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Patches' })).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && npx vitest run test/unit/layouts/SidebarLayout/SidebarLayout.test.jsx`
Expected: FAIL — `SessionContext` is not exported, and unfiltered `SidebarLayout` renders the Patches link for `admin`.

- [ ] **Step 3: Export the context + an optional hook**

In `client/src/context/session/session.jsx`:

Change line 5 from:

```js
const SessionContext = createContext(null);
```

to:

```js
export const SessionContext = createContext(null);
```

And add, after the existing `useSession` function (end of file):

```js
/** Non-throwing session accessor for cross-cutting chrome (e.g. SidebarLayout) that may render
 *  outside a provider in tests. Returns `null` when there is no provider. */
export function useOptionalSession() {
  return useContext(SessionContext);
}
```

- [ ] **Step 4: Filter links in `SidebarLayout`**

In `client/src/layouts/SidebarLayout/SidebarLayout.jsx`, add the import (after line 2):

```js
import { useOptionalSession } from '../../context/session/session.jsx';
```

Inside `SidebarLayout`, after the `handleLogout` definition and before the `return`, add:

```js
  const ctx = useOptionalSession();
  const role = ctx?.session?.role;
  const visibleLinks = links.filter((l) => !l.roles || (role && l.roles.includes(role)));
```

Change the map source from `links` to `visibleLinks`:

```jsx
        {visibleLinks.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="sidebar__link">
            {l.label}
          </NavLink>
        ))}
```

- [ ] **Step 5: Add the Patches link to `ADMIN_LINKS`**

In `client/src/modules/admin/admin.routes.jsx`, append to the `ADMIN_LINKS` array (after the Settings entry, line 19):

```js
  { to: '/admin/patches', label: 'Patches', roles: ['superadmin'] },
```

- [ ] **Step 6: Run to verify pass**

Run: `cd client && npx vitest run test/unit/layouts/SidebarLayout/SidebarLayout.test.jsx`
Expected: PASS — incl. the original logout test (unchanged; renders with no provider → `useOptionalSession` returns null, all ungated links show).

- [ ] **Step 7: Commit** (after approval)

---

### Task 7: Client patch module — hook + view + route

**Files:**
- Create: `client/src/modules/patch/usePatches.js`
- Create: `client/src/modules/patch/views/Patches/Patches.jsx`
- Create: `client/src/modules/patch/patch.routes.jsx`
- Modify: `client/src/routes.jsx` (aggregate `patchRoutes(session)`)
- Create: `client/test/unit/modules/patch/views/Patches/Patches.test.jsx`

**Interfaces:**
- Consumes: `api` (apiClient); `@tanstack/react-query` v5; `SidebarLayout`, `ADMIN_LINKS`, `ConfirmDialog`, `Button`, `Alert`, `RoleRoute`.
- Produces: `usePatches() => { patches: UseQueryResult, runPatch: UseMutationResult }`; `Patches` view; `patchRoutes(session) => RouteObject[]`.

- [ ] **Step 1: Write the failing view test**

Create `client/test/unit/modules/patch/views/Patches/Patches.test.jsx` (mirrors `AdminSettings.test.jsx`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from '#src/lib/apiClient/apiClient.js';
import { Patches } from '#src/modules/patch/views/Patches/Patches.jsx';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Patches />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PATCH = {
  id: '001-example-noop',
  description: 'Example no-op.',
  repeatable: true,
  checksum: 'abc',
  status: 'never_run',
  drift: false,
  lastExecution: null,
  executions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ patches: [PATCH] });
  api.post.mockResolvedValue({ executionId: 'e1', status: 'running' });
});

describe('Patches view', () => {
  it('lists available patches with their status', async () => {
    renderView();
    expect(await screen.findByText('001-example-noop')).toBeTruthy();
    expect(screen.getByText('Never run')).toBeTruthy();
  });

  it('Run opens a confirm dialog then POSTs to the run endpoint', async () => {
    renderView();
    await screen.findByText('001-example-noop');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(api.post).not.toHaveBeenCalled(); // confirm gate first
    fireEvent.click(screen.getByRole('button', { name: 'Run patch' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/patches/001-example-noop/run'));
  });

  it('History reveals prior executions', async () => {
    api.get.mockResolvedValue({
      patches: [{
        ...PATCH,
        status: 'failed',
        lastExecution: { id: 'e0', status: 'failed', startedAt: '2026-07-05T10:00:00Z', finishedAt: '2026-07-05T10:00:01Z', error: 'boom' },
        executions: [{ id: 'e0', status: 'failed', startedAt: '2026-07-05T10:00:00Z', finishedAt: '2026-07-05T10:00:01Z', error: 'boom', result: null }],
      }],
    });
    renderView();
    await screen.findByText('001-example-noop');
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && npx vitest run test/unit/modules/patch/views/Patches/Patches.test.jsx`
Expected: FAIL — the module files do not exist.

- [ ] **Step 3: Implement the hook**

Create `client/src/modules/patch/usePatches.js`:

```js
// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/** Patches module data + run mutation. Polls (v5 signature: receives the query) while any patch runs. */
export function usePatches() {
  const qc = useQueryClient();

  const patches = useQuery({
    queryKey: ['patches'],
    queryFn: () => api.get('/patches'),
    refetchInterval: (query) =>
      query.state.data?.patches?.some((p) => p.status === 'running') ? 2000 : false,
  });

  const runPatch = useMutation({
    mutationFn: (id) => api.post(`/patches/${id}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patches'] }),
  });

  return { patches, runPatch };
}
```

- [ ] **Step 4: Implement the view**

Create `client/src/modules/patch/views/Patches/Patches.jsx`:

```jsx
// @ts-check
import { Fragment, useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { ConfirmDialog } from '../../../../shared/ConfirmDialog/ConfirmDialog.jsx';
import { ADMIN_LINKS } from '../../../admin/admin.routes.jsx';
import { usePatches } from '../../usePatches.js';

const STATUS_LABEL = {
  never_run: 'Never run',
  running: 'Running…',
  success: 'Succeeded',
  failed: 'Failed',
  interrupted: 'Interrupted',
};
const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

export function Patches() {
  const { patches, runPatch } = usePatches();
  const [confirmId, setConfirmId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const rows = patches.data?.patches ?? [];

  const confirmRun = () => {
    runPatch.mutate(confirmId, { onSettled: () => setConfirmId(null) });
  };

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Patches</h1>
      <p className="help">Run a deployed database patch. Every run is recorded below.</p>

      {patches.isLoading && <p>Loading…</p>}
      {patches.error && <Alert variant="danger">{patches.error.message}</Alert>}
      {runPatch.error && <Alert variant="danger">{runPatch.error.message}</Alert>}

      {!patches.isLoading && rows.length === 0 && <p className="empty">No patches are deployed.</p>}

      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Patch</th>
              <th>Status</th>
              <th>Last run</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td>
                    <strong>{p.id}</strong>
                    <div className="help">{p.description}</div>
                  </td>
                  <td>
                    {STATUS_LABEL[p.status] ?? p.status}
                    {p.drift && (
                      <span className="help danger" title="File changed since its last success">
                        {' '}
                        (file changed)
                      </span>
                    )}
                  </td>
                  <td>{fmt(p.lastExecution?.finishedAt ?? p.lastExecution?.startedAt)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    >
                      {expandedId === p.id ? 'Hide history' : 'History'}
                    </Button>{' '}
                    <Button size="sm" onClick={() => setConfirmId(p.id)} disabled={p.status === 'running'}>
                      Run
                    </Button>
                  </td>
                </tr>
                {expandedId === p.id && (
                  <tr>
                    <td colSpan={4}>
                      {p.executions.length === 0 ? (
                        <p className="help">No runs yet.</p>
                      ) : (
                        <ul className="patch-history">
                          {p.executions.map((e) => (
                            <li key={e.id}>
                              <strong>{STATUS_LABEL[e.status] ?? e.status}</strong> — started {fmt(e.startedAt)}
                              {e.finishedAt ? `, finished ${fmt(e.finishedAt)}` : ''}
                              {e.error && <div className="help danger">{e.error}</div>}
                              {e.result && <div className="help">{JSON.stringify(e.result)}</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {confirmId && (
        <ConfirmDialog
          title="Run patch"
          intent="danger"
          confirmLabel="Run patch"
          isLoading={runPatch.isPending}
          onConfirm={confirmRun}
          onCancel={() => setConfirmId(null)}
        >
          <p>
            Run <strong>{confirmId}</strong> against the live database? It executes immediately and the
            run is recorded.
          </p>
        </ConfirmDialog>
      )}
    </SidebarLayout>
  );
}
```

- [ ] **Step 5: Implement the route + aggregate it**

Create `client/src/modules/patch/patch.routes.jsx`:

```jsx
// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { Patches } from './views/Patches/Patches.jsx';

/** Superadmin-only Patches route. The SERVER (requireRole('superadmin')) is the real boundary. */
export const patchRoutes = (session) => [
  {
    path: '/admin/patches',
    element: (
      <RoleRoute session={session} role={['superadmin']}>
        <Patches />
      </RoleRoute>
    ),
  },
];
```

In `client/src/routes.jsx`, add the import (after line 11):

```js
import { patchRoutes } from './modules/patch/patch.routes.jsx';
```

And spread it into the aggregated array (after `...adminRoutes(session),`, line 26):

```js
  ...patchRoutes(session),
```

- [ ] **Step 6: Run to verify pass**

Run: `cd client && npx vitest run test/unit/modules/patch/views/Patches/Patches.test.jsx`
Expected: PASS (all three).

- [ ] **Step 7: Commit** (after approval)

---

### Task 8: Full-suite verification (gate)

**Files:** none (verification only).

- [ ] **Step 1: Server + shared suite**

Run: `npm test` (root Vitest — `server/test/**` + `shared/test/**`; needs the migrated DB up for integration).
Expected: PASS. Confirm `patch.superadmin.test.js`, `loader.test.js`, `service.test.js` green and no regression in `admin.test.js` / `auth.test.js` / `booking.test.js`.

- [ ] **Step 2: Client suite**

Run: `cd client && npx vitest run`
Expected: PASS. Confirm `SidebarLayout.test.jsx` (incl. the original logout case) + `Patches.test.jsx` green.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (no new errors from the edits).

---

### Task 9: Playwright end-to-end verification (PHASE 2 — against the running app at http://localhost:3000)

**Files:** none (interactive MCP-Playwright).

**Precondition:** the app must be running against the DB migrated + reseeded in Task 2 (so `baseline.superadmin@dermestha.test` exists and `patch_executions` is present). Restart the app if it was running against a pre-migration DB.

- [ ] **Step 1: Superadmin sees the Patches tab and the list**

`browser_navigate` → `http://localhost:3000/login`; log in as `baseline.superadmin@dermestha.test` / `Test123!`.
`browser_snapshot` → the sidebar shows a **Patches** link; open `/admin/patches`; assert `001-example-noop` is listed with a status.

- [ ] **Step 2: Run the example patch and watch it resolve**

Click **Run** → confirm. `browser_snapshot` shows `Running…`, then (poll/`browser_wait_for`) `Succeeded` with a timestamp. Expand **History** → the run appears with started/finished times.

- [ ] **Step 3: Admin does NOT see Patches**

Log out; log in as `baseline.admin@dermestha.test` / `Test123!`. `browser_snapshot` → **no Patches link**. `browser_navigate` → `http://localhost:3000/admin/patches` → redirected away (RoleRoute sends non-superadmin to `/`). Optionally confirm `GET /api/patches` returns 403 via `browser_network_requests`.

- [ ] **Step 4: Server stays healthy after a run**

Confirm the app remains responsive (navigate other admin tabs) immediately after a patch run — the non-blocking model means the request returned before execution finished.

---

## Doc-Impact (tracked; applied only at END, after code committed + user approval — per CLAUDE.md & design §9)

- **04 DATABASE** — new `patch_executions` table + `PatchStatus` enum; regenerated single baseline (new migration filename; `uniq_active_slot` re-appended).
- **05 API** — new `/api/patches` module (`GET /`, `POST /:id/run`), superadmin-only; 202 + 404/409 semantics.
- **08 SECURITY** — first superadmin-only surface; "executes committed code, no arbitrary input" model; non-blocking/failure-isolated execution; audit `patch_run` logged as `actor_type='admin'` (coercion).
- **11 ADR** — new ADR: file-based, forward-only, superadmin-run data patches; own `/api/patches` module; boundary vs. Prisma migrations (DDL stays in migrations); non-blocking fire-and-track execution.
- **12 TEST CASES** — patch allow/deny, run-once, failure-isolation/rollback, history.
- **13 STATUS** — build-progress entry.
- **15 CONFIG** — expected none (confirm at end).

---

## Self-Review

**Spec coverage:**
- §2 D1 file-based → loader only reads shipped files (Task 3); D2 JS `up(tx)` → Task 3/4; D3 own `/api/patches` → Task 5; D4 superadmin-only → Tasks 5/6/7 guards; D5 DDL boundary → README (Task 3); D6 non-blocking → Task 4 `run`/`runPatch` + test "does not await"; D7 forward-only/run-once → Task 4 guards; D8 history → `PatchExecution` (Task 1) + `list` (Task 4) + view history (Task 7). ✅
- §3 data model → Task 1. §4 execution model (202, guards, stale/interrupted, total catch) → Tasks 4/5. §5 module files → Tasks 3–5. §6 API + audit → Task 5. §7 client (role-aware nav, view, statuses, history, ConfirmDialog) → Tasks 6/7. §8 tests → loader/service/integration/client across Tasks 3–7. ✅

**Placeholder scan:** every code step shows complete content; the only "fill-from-pattern" is Task 2 (follows the `dermestha-migration-reset` skill, exact `uniq_active_slot` SQL given). No TBD/TODO.

**Type/name consistency:** `run({patchId,userId})`, `runPatch({patch,executionId,userId})`, `list(client)` consistent across Task 4 (impl), its test, and Task 5 (controller). API shape (`{ patches: [...] }`, `202 {executionId,status}`) consistent across Task 5 server + Task 7 client hook/test. `roles` link field consistent across Task 6 (`ADMIN_LINKS`, `SidebarLayout` filter) and its test. Status vocabulary (`never_run/running/success/failed/interrupted`) consistent across service `deriveStatus`, the view `STATUS_LABEL`, and the integration/client tests.

**Verified against the working tree:** `requireRole` variadic + `superadmin` in schema (present); `RoleRoute` accepts arrays (present); `SidebarLayout` renders without a provider in its existing test (so `useOptionalSession` must be non-throwing — designed accordingly); controller/apiClient/ConfirmDialog/useAdmin patterns matched to the real files.

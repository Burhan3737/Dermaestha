# Patches Module — Design

| Field       | Value                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------- |
| Date        | 2026-07-05                                                                                 |
| Status      | Draft — awaiting user review                                                               |
| Topic       | Superadmin-only "Patches" surface — run deployed JS DB-remediation files on demand         |
| Skill       | superpowers:brainstorming (opted in)                                                       |
| Depends on  | Superadmin-role plumbing (working tree, currently uncommitted): `Role.superadmin`, `requireRole('admin','superadmin')` dual-listing, migration `20260705115543_init`. |

---

## 1. Goal & framing

Give a **superadmin** a UI to execute **version-controlled database-patch files** that ship inside the deployed image — without any shell or direct-DB access. This is the **first genuinely superadmin-only surface**, i.e. the "later cycle" the superadmin-role design (§1) deferred: the first place where superadmin's capabilities diverge from admin's.

**The operator workflow (the whole point):**

```
1. Author  prisma/patches/003-backfill-fee-snapshots.js   → commit → PR review
2. Deploy  (Render/Railway rebuilds the image with the file baked in)
3. Superadmin opens the Patches view → sees "003" as "Never run"
4. Clicks Run → confirm → executes (non-blocking) → status + history update live
```

**Value vs. the existing `prisma/scripts/*`:** `bootstrap-admin.js` / `seed-baseline.js` are CLI scripts requiring a machine with `DATABASE_URL` and a terminal. Patches are run from the deployed app by the least-privileged path that still works — a superadmin clicking a button.

---

## 2. Key decisions (settled with the user)

| # | Decision | Rationale |
| - | -------- | --------- |
| D1 | **File-based, not a SQL console.** | The only variable a request carries is *which shipped file* to run (`:id`). No arbitrary SQL, no injection surface. Every patch is code-reviewed and version-controlled before it can exist. |
| D2 | **JS patch modules** exporting `up(tx)`, not raw `.sql`. | Prisma's `$executeRawUnsafe` uses the extended protocol → multi-statement `.sql` files break; a JS `up(tx)` gets an atomic transaction client, can still run raw SQL per-statement, and is unit-testable. |
| D3 | **Own module + own route** — `server/src/modules/patch/` mounted at **`/api/patches`**, NOT under `/api/admin`. | User decision: stop polluting the admin namespace; each concern gets its own module. |
| D4 | **Superadmin-only** (`requireRole('superadmin')`, not `'admin'`). | Most privileged action in the app → most privileged role. Realizes the deferred superadmin-only cycle. |
| D5 | **Data/DML + targeted remediation only; schema DDL stays in Prisma migrations.** | Preserves the single-baseline migration discipline (ADR-46). Mixing DDL here would create migration drift. |
| D6 | **Non-blocking, failure-isolated execution** (fire-and-track). | A run must not block the server's other services and must not crash the process if it throws. §4. |
| D7 | **Forward-only; run-once by default** (ledger-guarded), `repeatable` opt-in. | Mirrors migrations. A mistake is fixed by a new patch, not a `down()`. |
| D8 | **Full execution history** — `patch_executions` records *every* run. | User requirement: know when each patch ran, when it failed, and its whole history. §3. |

---

## 3. Data model — the execution ledger (schema change → migration)

New Prisma model + status enum. This is the "collection that manages all patch executions."

```prisma
enum PatchStatus {
  running
  success
  failed
}

/// Append-only history of every patch run (one row per execution). The UI reads this to show
/// per-patch status + history. Written only by the patch service.
model PatchExecution {
  id         String      @id @default(cuid())
  /// The patch file's declared id, e.g. "003-backfill-fee-snapshots" (NOT a file path).
  patchId    String      @map("patch_id")
  /// sha256 of the file contents at run time — drift detection vs. a later edited redeploy.
  checksum   String
  status     PatchStatus  @default(running)
  /// The superadmin User.id who ran it.
  executedBy String      @map("executed_by")
  /// Failure message when status=failed (null otherwise).
  error      String?
  /// Success payload from up(tx), e.g. { rowsAffected } (null on failure).
  result     Json?
  startedAt  DateTime    @default(now()) @map("started_at") @db.Timestamptz(6)
  finishedAt DateTime?   @map("finished_at") @db.Timestamptz(6)

  @@index([patchId])
  @@index([startedAt])
  @@map("patch_executions")
}
```

- Duration is derived (`finishedAt − startedAt`); not stored.
- `executedBy` is a plain string id (no FK relation on `User` — keeps the model self-contained and the log durable even if a superadmin account is later removed; consistent with `AuditLog.actorId`).

**Migration mechanism (D5-consistent):** the app is not yet deployed and the repo keeps a single consolidated baseline (ADR-46), and the superadmin baseline `20260705115543_init` is itself still uncommitted. So we **regenerate the single baseline** to include `patch_executions` via the `dermestha-migration-reset` skill (re-appending the hand-written `uniq_active_slot` partial index), rather than stacking an additive migration. Destructive/human-gated step, same pattern as the superadmin cycle.

---

## 4. Execution model — non-blocking & failure-isolated

The hard requirement: **a patch run must not block the server, and a failing patch must not impact the server.**

`POST /api/patches/:id/run`:

1. `requireRole('superadmin')` + write rate-limiter (reuse the admin-write limiter pattern).
2. Resolve the patch by `:id` from the loader; `404 PATCH_NOT_FOUND` if unknown.
3. **Guard** (before any row is written):
   - non-`repeatable` patch already has a `success` execution → `409 PATCH_ALREADY_APPLIED`.
   - patch already has a live `running` execution → `409 PATCH_ALREADY_RUNNING` (blocks a double-click / two superadmins racing).
4. Insert a `PatchExecution` row (`status: running`, `executedBy`, `checksum`, `startedAt`).
5. **Kick off execution WITHOUT `await`** and immediately `202 { executionId }`:
   ```js
   runPatch(patch, executionId).catch(() => {}); // never awaited; errors handled inside
   return res.status(202).json({ executionId, status: 'running' });
   ```
6. `runPatch` (background, same process):
   - `await prisma.$transaction((tx) => patch.up(tx))` → on success, update the row to `success` + `result` + `finishedAt`.
   - **`try/catch` around everything** → on throw, update the row to `failed` + `error` (message) + `finishedAt`. The catch is total, so there is **no unhandled rejection** and the request already returned.
7. An `AuditLog` row is written for the run (§6).

**Honest constraint (documented):** Node is single-threaded, so a patch that does a *tight synchronous CPU loop* could still block the event loop. Patches are DB-I/O-bound (awaited queries yield), so in practice they do not block. Patch authors must write async I/O work, not CPU-bound loops. A truly isolated worker thread/process is **out of scope** (YAGNI for admin remediation scripts) and noted as a non-goal.

**Interrupted runs:** a server crash/redeploy mid-run orphans a `running` row. The list endpoint marks a `running` row whose `startedAt` is older than a threshold (e.g. 10 min) as **stale/interrupted** in the response (derived flag) so the UI never shows a permanently-spinning patch. No background reaper (YAGNI).

---

## 5. Server module — `server/src/modules/patch/`

A new, self-contained module (one clear purpose; mirrors the house module shape).

| File | Responsibility |
| ---- | -------------- |
| `loader.js` | Scan `prisma/patches/`, dynamically `import()` each `NNN-slug.js`, read raw contents to compute the sha256 checksum, and validate each module's shape (`id`, `description`, `up`, optional `repeatable`). Pure, testable (point it at a fixtures dir). |
| `service.js` | `list()` → available patch files ⨝ `patch_executions` (latest status + recent history + derived drift/stale flags). `run(patchId, userId)` → the §4 guard + insert + fire-and-track. `runPatch(...)` → the background txn + ledger finalize (exported for testing). |
| `controller.js` | Thin HTTP layer (envelope in/out). |
| `index.js` | `express.Router()`; `requireRole('superadmin')` on **every** route + write rate-limiter on the run route. Exports `patchRouter`. |

**Wiring:** `server/src/routes.js` gains `import { patchRouter }` and `app.use('/api/patches', patchRouter)` (placed among the feature routers, before the `/api` 404 catch-all).

**Patch file shape** — `prisma/patches/003-backfill-fee-snapshots.js`:

```js
export const id = '003-backfill-fee-snapshots';
export const description = 'Backfill feeAtBooking for confirmed appointments missing a snapshot.';
export const repeatable = false; // default false if omitted

/** @param {import('@prisma/client').Prisma.TransactionClient} tx */
export async function up(tx) {
  const rows = await tx.$executeRaw`UPDATE appointments SET fee_at_booking = /* ... */ WHERE fee_at_booking IS NULL`;
  return { rowsAffected: rows }; // captured into patch_executions.result
}
```

- Numeric filename prefix → stable display order.
- No upload / no dynamic path from the client: the loader only reads files already present in `prisma/patches/`.
- `prisma/patches/README.md` documents the contract + the "data/DML only, no DDL" boundary (D5).
- The directory ships with **one example/no-op patch** so the view isn't empty on first deploy and there is a fixture to test against.

---

## 6. API

All routes `requireRole('superadmin')`.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`  | `/api/patches` | List every available patch file with: `id`, `description`, `repeatable`, `checksum`, derived `status` (`never_run` / `running` / `success` / `failed` / `interrupted`), `lastExecution`, and recent `executions[]` (bounded, e.g. last 10) for the history UI. Also `drift: true` when the current file checksum differs from the last `success` checksum. |
| `POST` | `/api/patches/:id/run` | §4. `202 { executionId, status:'running' }`; `404` unknown id; `409` already-applied / already-running. |

Polling: the client re-fetches `GET /api/patches` on an interval while any patch is `running`. (No separate per-execution endpoint — the list already carries live status.)

**Audit:** each run writes one `AuditLog` row via the existing `record()` writer — `eventType:'patch_run'`, `actorType:'admin'` (per the superadmin→admin audit coercion established in the role design §5), `actorId:` the superadmin id, `meta:{ patchId, checksum, executionId }`. No new audit plumbing. (The `patch_executions` ledger is the detailed record; the audit row is the cross-cutting trail.)

---

## 7. Client — superadmin-only view

**New module `client/src/modules/patch/`:**
- `patch.routes.jsx` → `patchRoutes(session)` returning `/admin/patches` guarded `role={['superadmin']}` (reuses `RoleRoute`). Aggregated in `client/src/routes.jsx`.
- `views/Patches/Patches.jsx` + a `usePatches` hook (view→hook split, house pattern). Renders inside the existing `SidebarLayout` (superadmin already operates in the `/admin` console; a separate shell would be needless churn — the backend cleanliness the user asked for is fully delivered by `/api/patches`).

**Role-aware sidebar (zero churn to existing views):** `SidebarLayout` consumes `useSession()` and filters link entries by an optional `roles` field — mirroring the per-route roles model the codebase already uses. Entries without `roles` show for everyone (backward compatible; the doctor nav is unaffected). `ADMIN_LINKS` gains one entry:
```js
{ to: '/admin/patches', label: 'Patches', roles: ['superadmin'] },
```
Result: **admins never see the Patches link; a superadmin sees it from every console page.**

**The view (intuitive is a requirement):**
- A table of **all available patch files** (shown on navigate, per the requirement), each row: **patch id + description**, a **status badge**, **last run** (relative + absolute Karachi time), and a **Run** action.
- **Status badges:** `Never run` (neutral) · `Running…` (animated) · `Succeeded` (green + timestamp) · `Failed` (red + timestamp, error expandable) · `Interrupted` (amber, for stale `running`). A **drift** chip appears when the file changed since its last success.
- **Row expand → execution history:** each past run's status, started/finished time, who ran it, and error/result — the full history the user asked for.
- **Run flow:** the shared `ConfirmDialog` (danger intent — consistent with the confirm-gated admin actions the user built) → on confirm, `POST …/run`, optimistic `Running…`, then poll `GET /api/patches` (~2s) until the row resolves, showing success `result` or the `failed` error inline. `409`/`404` surface as a clear message.

---

## 8. Testing (TDD)

- **loader unit** — discovers fixture patches, computes checksum, validates shape, rejects a malformed module.
- **service unit** — `run` writes a `running` row then finalizes `success` with `result`; a throwing `up` finalizes `failed` with `error` and rolls the txn back (no partial writes); non-`repeatable` second run → `409`; concurrent `running` → `409`; the request path does **not** await the background work (returns before `up` resolves).
- **integration** (`server/test/integration/patch.superadmin.test.js`) — superadmin lists + runs an example patch (poll to terminal status); **admin gets 403** on list and run (proves the boundary); a deliberately-failing fixture patch leaves the DB unchanged and records `failed`; the audit row is written.
- **client unit** — Patches link hidden for admin / shown for superadmin; the run flow calls the endpoint and renders status transitions + history.

**Success criteria:** a superadmin opens `/admin/patches`, sees all files with correct statuses, runs a patch, watches it go `Running… → Succeeded` (or `Failed` with the error), and sees the run in history — while every other app service stays responsive and a failing patch neither blocks nor crashes the server; admins cannot see or reach the surface.

---

## 9. Spec-suite doc-impact (tracked; applied only at END, after code committed + user approval)

Per CLAUDE.md, recorded now, applied only after code is committed and the user approves (change-impact matrix in doc 00):

- **04 DATABASE** — new `patch_executions` table + `PatchStatus` enum; regenerated single baseline (new migration filename; re-append `uniq_active_slot`).
- **05 API** — new `/api/patches` module (list + run), superadmin-only.
- **08 SECURITY** — first superadmin-only surface; the "executes committed code against the prod DB, no arbitrary input" model; non-blocking/failure-isolated execution; audit `patch_run` (logged as `actor_type='admin'` via coercion).
- **11 ADR** — new ADR: "Patches — file-based, forward-only, superadmin-run data remediation; own `/api/patches` module; boundary vs. Prisma migrations (DDL stays in migrations); non-blocking fire-and-track execution."
- **12 TEST CASES** — patch allow/deny, run-once, failure-isolation/rollback, history.
- **13 STATUS** — build-progress entry.
- **15 CONFIG** — expected none (no new env var); confirm at end.

---

## 10. Assumptions & open points (flag at spec review)

1. **Client route stays in the `/admin` console** (`/admin/patches`, reusing `SidebarLayout`) rather than a separate top-level `/superadmin` shell — because superadmin already lands in `/admin` and the backend separation (the user's actual concern) is fully addressed by `/api/patches`. Flip if a separate shell is wanted.
2. **`interrupted` staleness threshold** (10 min) is a display heuristic; tune later.
3. Assumes the **superadmin-role plumbing is committed/kept** — this feature depends on `Role.superadmin` and the client `['admin','superadmin']` guards existing.

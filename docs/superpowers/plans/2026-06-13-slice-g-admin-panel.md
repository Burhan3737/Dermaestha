# Slice G — Admin Panel (M4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the admin panel against the spec: admin onboards/edits/deactivates doctors with photo upload and DA5 password reset (F10), manages the medicine catalogue UI (A-02, closing M3), monitors a five-source alert feed with email re-trigger (F12), searches the unified records & audit page with dispute flagging (F13), and tunes platform settings (F14) — screens A-01…A-05, all audit-logged, all behind `requireRole('admin')`.

**Architecture:** Zero schema changes — every field already exists. Doctor admin writes go into the existing doctor module as a new `admin.service.js`; alerts/records/audit/settings are read-mostly projections in a new `server/src/modules/admin/`. Photos: multer (memory) → magic-byte sniff → local disk under a named Docker volume → `express.static('/uploads')`. Alerts are a live query over Slice E's audit rows + a derived awaiting-prescription predicate + a new `system.unhandled_exception` bridge in `errorHandler`. Client: new `modules/admin/` with 5 views under the existing `SidebarLayout` (its `links` prop already exists).

**Tech Stack:** Node 20 ESM + Express, Prisma 6 (PostgreSQL), multer (new, server workspace), Vitest (unit: mocked Prisma in module-local test files; integration: real DB in `server/src/test/`), Zod DTOs in `shared/schemas/`, React 19 + TanStack Query + react-router 6.

**Spec:** `docs/superpowers/specs/2026-06-12-slice-g-admin-panel-design.md`

---

## Reality check (verified 2026-06-13 in source)

- **No migration needed.** `Doctor.photoUrl/status/isActive`, `User.mustChangePassword`, `Appointment.disputed`, `Settings` (id=1, seeded), `NotificationJob.status/attempts/lastError`, `AuditLog` all exist in `prisma/schema.prisma`.
- **Enums (exact values):** `PaymentStatus = pending|success|failed` (NOT "paid"), `NotificationStatus = pending|sent|failed|suppressed`, `DoctorStatus = pending|active`, `RefundStatus = initiated|retrying|settled|failed`.
- `prisma/seed.js:2` imports `'../server/src/lib/password.js'` — **stale path** (restructure moved it to `lib/password/password.js`); `npm run db:seed` currently throws `ERR_MODULE_NOT_FOUND` on a fresh checkout. Task 1 fixes it.
- `SidebarLayout` (`client/src/layouts/SidebarLayout/SidebarLayout.jsx`) **already accepts a `links` prop** (doctor default). Admin views just pass `ADMIN_LINKS`.
- `client/src/lib/apiClient/apiClient.js` has `get/post/put` only — **no `patch`, no multipart**. Task 2 adds `api.patch` + `api.upload`.
- `App.jsx:28` has the `/admin` `Placeholder` route to replace; `client/src/routes.jsx` aggregates module `*.routes.jsx` factories.
- `audit.record(e, client = prisma)` takes `{ eventType, actorType, actorId?, targetRef?, reason?, meta? }`.
- `errorHandler` (`server/src/http/errorHandler/errorHandler.js`) ignores `_req`; the 500 branch calls `captureException(err)` — the exception bridge hooks in there.
- `replaceWeeklyBlocks(userId, blocks)` in `doctor/service.js:151` resolves the doctor by `userId` — the admin path needs the doctorId-keyed core extracted (Task 7).
- Failed email job shape: `status:'failed'`, `attempts >= EMAIL_MAX_ATTEMPTS`, `lastError` set; dispatch worker picks `status:'pending'` rows with `scheduledFor <= now` and `nextAttemptAt null|<= now`.
- Baseline: `npm test` → **202 passed** (server+shared), `npm --workspace client test` → **59 passed** (per the Slice F merge log — re-verify at execution start).

**Execution preconditions:**
- DB container healthy; `.env` `DATABASE_URL` points at the dev DB; run `npm run db:seed` after Task 1 lands.
- **Branch:** creating a branch requires user approval (CLAUDE.md). At execution start, ask the user: branch `feature/slice-g` (recommended, matches prior slices) or work on `main`. Do not create a branch without their answer.
- **Build order is the approved vertical order:** prep → A-02 medicines → F10+A-01 doctors → F13+A-04 records → F12+A-03 alerts → F14+A-05 settings → integration → infra/verify.

---

### Task 1: Repo prep — fix the stale seed import + seed a dev admin

**Files:**
- Modify: `prisma/seed.js`

The restructure (ADR-26) moved `lib/password.js` → `lib/password/password.js`; seed.js was missed. Also: every admin screen needs an admin login in dev, and the seed has none (prod uses `bootstrap:admin`). Seed a dev admin alongside the demo doctors.

- [ ] **Step 1: Fix the import.** In `prisma/seed.js` line 2, change:

```js
import { hashPassword } from '../server/src/lib/password.js';
```

to:

```js
import { hashPassword } from '../server/src/lib/password/password.js';
```

- [ ] **Step 2: Seed a dev admin.** In `prisma/seed.js`, after the `for (const d of DOCTORS) { … }` loop and before the `console.log`, add:

```js
  await prisma.user.upsert({
    where: { email: 'admin@dermestha.dev' },
    update: {},
    create: {
      role: 'admin',
      email: 'admin@dermestha.dev',
      fullName: 'Dermestha Admin',
      passwordHash,
      mustChangePassword: false,
    },
  });
```

and update the final log line to:

```js
  console.log('Seed complete: settings + medicines + demo doctors + dev admin.');
```

- [ ] **Step 3: Run the seed to verify**

Run: `npm run db:seed`
Expected: `Seed complete: settings + medicines + demo doctors + dev admin.` (no `ERR_MODULE_NOT_FOUND`).

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.js
git commit -m "fix(seed): restructure-stale password import + dev admin account (Slice G prep)"
```

---

### Task 2: Client API client — `api.patch` + `api.upload`

**Files:**
- Modify: `client/src/lib/apiClient/apiClient.js`
- Modify: `client/src/lib/apiClient/apiClient.test.js`

A-02 edits medicines via `PATCH`, A-01 edits doctors via `PATCH` and uploads photos via `multipart/form-data` — none of which the client can send today.

- [ ] **Step 1: Write the failing tests.** Append to `client/src/lib/apiClient/apiClient.test.js` (self-contained block; stubs `fetch` itself):

```js
describe('api.patch / api.upload (Slice G)', () => {
  it('patch sends a JSON PATCH and returns the parsed body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'm1', isActive: false }),
    });
    const out = await api.patch('/admin/medicines/m1', { isActive: false });
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/medicines/m1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    expect(out).toEqual({ id: 'm1', isActive: false });
  });

  it('upload POSTs FormData without a JSON content-type and surfaces the error envelope', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'INVALID_FILE', message: 'Photo must be a JPEG, PNG, or WebP image.' } }),
    });
    const fd = new FormData();
    await expect(api.upload('/doctors/d1/photo', fd)).rejects.toMatchObject({
      code: 'INVALID_FILE',
      status: 400,
    });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/doctors/d1/photo');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe(fd);
    expect(opts.headers).toBeUndefined(); // browser sets the multipart boundary itself
  });
});
```

(If the file's existing tests import `api`/`ApiError` already, reuse those imports; otherwise add `import { api } from './apiClient.js';` at the top.)

- [ ] **Step 2: Run to verify they fail**

Run: `npm --workspace client test -- run src/lib/apiClient`
Expected: FAIL — `api.patch is not a function`.

- [ ] **Step 3: Implement.** In `client/src/lib/apiClient/apiClient.js`, extract the response handling and add the two methods (full replacement of everything below the `ApiError` class):

```js
async function parse(res) {
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(
      e.code ?? 'INTERNAL',
      e.message ?? 'Something went wrong.',
      res.status,
      e.details,
    );
  }
  return data;
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return parse(res);
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  /** Multipart POST. No Content-Type header — the browser sets the boundary. */
  upload: async (path, formData) => parse(await fetch(`/api${path}`, { method: 'POST', body: formData })),
};
```

- [ ] **Step 4: Run the client suite**

Run: `npm --workspace client test`
Expected: 61 passed (59 + 2), no regressions.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/apiClient
git commit -m "feat(client): api.patch + multipart api.upload (Slice G admin surface)"
```

---

### Task 3: Medicine `includeInactive` read (F11.01 admin list)

**Files:**
- Modify: `shared/schemas/medicine/medicine.js`
- Modify: `server/src/modules/medicine/service.js`
- Modify: `server/src/modules/medicine/controller.js`
- Modify: `server/src/modules/medicine/test.js`

A-02 must list deactivated medicines to reactivate them; the builder read stays active-only. Admin-only query param.

- [ ] **Step 1: Write the failing tests.** In `server/src/modules/medicine/test.js`, append inside the existing `medicine.list` describe (the file already mocks `prisma.medicine.findMany`):

```js
  it('includeInactive drops the isActive filter (admin catalogue view, F11.01)', async () => {
    prisma.medicine.findMany.mockResolvedValue([]);
    await list({ includeInactive: true });
    expect(prisma.medicine.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: 'asc' },
    });
  });

  it('includeInactive composes with search', async () => {
    prisma.medicine.findMany.mockResolvedValue([]);
    await list({ search: 'ada', includeInactive: true });
    expect(prisma.medicine.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'ada', mode: 'insensitive' } },
          { genericName: { contains: 'ada', mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/medicine/test.js`
Expected: 2 FAIL — `where` still contains `isActive: true`.

- [ ] **Step 3: Implement.**

(a) `shared/schemas/medicine/medicine.js` — extend the query schema:

```js
/** GET /api/medicines?search=&includeInactive=true (includeInactive: admin only). */
export const medicineSearchQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  includeInactive: z.literal('true').optional(),
});
```

(b) `server/src/modules/medicine/service.js` — replace `list`:

```js
/** Builder dropdown source (F11.01): active catalogue only; deactivated medicines vanish
 *  from here but never from existing prescriptions (snapshot rule #5).
 *  includeInactive (admin catalogue view only) lifts the isActive filter so A-02 can reactivate. */
export async function list({ search, includeInactive = false } = {}) {
  return prisma.medicine.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
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
```

(c) `server/src/modules/medicine/controller.js` — replace `list` (the route already allows doctor+admin; the param itself is admin-gated here):

```js
export async function list(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    if (includeInactive && req.session.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Not allowed.', 403);
    }
    res.json({ data: await medicineService.list({ search: req.query.search, includeInactive }) });
  } catch (e) {
    next(e);
  }
}
```

and add the import at the top: `import { AppError } from '../../http/AppError.js';`

- [ ] **Step 4: Run module tests + full suite**

Run: `npx vitest run server/src/modules/medicine/test.js` → PASS. `npm test` → 204 passed.

- [ ] **Step 5: Commit**

```bash
git add shared/schemas/medicine server/src/modules/medicine
git commit -m "feat(medicine): admin-only includeInactive catalogue read (F11.01 / A-02)"
```

---

### Task 4: A-02 Admin medicines view + admin client scaffolding

**Files:**
- Create: `client/src/modules/admin/admin.routes.jsx`
- Create: `client/src/modules/admin/useAdmin.js`
- Create: `client/src/modules/admin/views/AdminMedicines/AdminMedicines.jsx`
- Test: `client/src/modules/admin/views/AdminMedicines/AdminMedicines.test.jsx`
- Modify: `client/src/routes.jsx`
- Modify: `client/src/App.jsx`

This task establishes the entire admin client skeleton (routes factory, sidebar links, hook) on the cheapest screen — A-02's API was fully built in Slice F + Task 3.

- [ ] **Step 1: Write the failing view test** (`client/src/modules/admin/views/AdminMedicines/AdminMedicines.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '../../../../lib/apiClient/apiClient.js';
import { AdminMedicines } from './AdminMedicines.jsx';

const MEDS = {
  data: [
    { id: 'm1', name: 'Adapalene Gel', genericName: 'Adapalene', dosageForms: ['gel'], unitPrice: 30000, isActive: true },
    { id: 'm2', name: 'Old Balm', genericName: null, dosageForms: ['cream'], unitPrice: 10000, isActive: false },
  ],
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminMedicines />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(MEDS);
});

describe('AdminMedicines (A-02)', () => {
  it('lists all medicines incl. deactivated, with PKR prices and status badges', async () => {
    renderView();
    expect(await screen.findByText('Adapalene Gel')).toBeTruthy();
    expect(screen.getByText('Old Balm')).toBeTruthy();
    expect(screen.getByText('Rs 300')).toBeTruthy(); // 30000 paisa
    expect(screen.getByText('Deactivated')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/medicines?includeInactive=true');
  });

  it('deactivate button PATCHes isActive=false', async () => {
    api.patch.mockResolvedValue({ id: 'm1', isActive: false });
    renderView();
    await screen.findByText('Adapalene Gel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]);
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/admin/medicines/m1', { isActive: false }),
    );
  });

  it('add form POSTs name, dosage forms and paisa price', async () => {
    api.post.mockResolvedValue({ id: 'm3' });
    renderView();
    await screen.findByText('Adapalene Gel');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tretinoin' } });
    fireEvent.change(screen.getByLabelText('Dosage forms (comma-separated)'), {
      target: { value: 'cream, gel' },
    });
    fireEvent.change(screen.getByLabelText('Unit price (PKR)'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add medicine' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/medicines', {
        name: 'Tretinoin',
        dosageForms: ['cream', 'gel'],
        unitPrice: 20000,
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --workspace client test -- run src/modules/admin`
Expected: FAIL — cannot resolve `./AdminMedicines.jsx`.

- [ ] **Step 3: Create the hook** (`client/src/modules/admin/useAdmin.js`) — medicines slice only for now; later tasks extend it:

```js
// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * Admin module data/mutations (house pattern: one hook per module, enabled-gated queries).
 * @param {{ medicines?: boolean, medicinesSearch?: string }} [opts]
 */
export function useAdmin(opts = {}) {
  const { medicines: medicinesEnabled = false, medicinesSearch = '' } = opts;
  const qc = useQueryClient();

  const medicines = useQuery({
    queryKey: ['admin-medicines', medicinesSearch],
    queryFn: () =>
      api.get(
        `/medicines?includeInactive=true${medicinesSearch ? `&search=${encodeURIComponent(medicinesSearch)}` : ''}`,
      ),
    enabled: medicinesEnabled,
  });

  const invalidateMedicines = () => qc.invalidateQueries({ queryKey: ['admin-medicines'] });

  const createMedicine = useMutation({
    mutationFn: (body) => api.post('/admin/medicines', body),
    onSuccess: invalidateMedicines,
  });

  const updateMedicine = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/admin/medicines/${id}`, body),
    onSuccess: invalidateMedicines,
  });

  return { medicines, createMedicine, updateMedicine };
}
```

- [ ] **Step 4: Create the view** (`client/src/modules/admin/views/AdminMedicines/AdminMedicines.jsx`):

```jsx
// @ts-check
import { useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

const pkr = (paisa) => `Rs ${(paisa / 100).toLocaleString()}`;

export function AdminMedicines() {
  const [search, setSearch] = useState('');
  const { medicines, createMedicine, updateMedicine } = useAdmin({
    medicines: true,
    medicinesSearch: search,
  });
  const [form, setForm] = useState({ name: '', genericName: '', dosageForms: '', unitPrice: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    createMedicine.mutate(
      {
        name: form.name.trim(),
        ...(form.genericName.trim() ? { genericName: form.genericName.trim() } : {}),
        dosageForms: form.dosageForms.split(',').map((s) => s.trim()).filter(Boolean),
        unitPrice: Math.round(parseFloat(form.unitPrice) * 100),
      },
      { onSuccess: () => setForm({ name: '', genericName: '', dosageForms: '', unitPrice: '' }) },
    );
  };

  const rows = medicines.data?.data ?? [];

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Medicines</h1>

      <div className="section-card">
        <div className="filters">
          <Field label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {medicines.isLoading && <p>Loading…</p>}
        {medicines.error && <Alert variant="danger">{medicines.error.message}</Alert>}
        {!medicines.isLoading && rows.length === 0 && <p className="empty">No medicines.</p>}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Generic</th><th>Forms</th><th>Unit price</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.genericName ?? '—'}</td>
                  <td>{m.dosageForms.join(', ')}</td>
                  <td>{pkr(m.unitPrice)}</td>
                  <td>
                    {m.isActive ? (
                      <span className="badge badge--success">Active</span>
                    ) : (
                      <span className="badge badge--warning">Deactivated</span>
                    )}
                  </td>
                  <td>
                    {m.isActive ? (
                      <Button
                        variant="danger"
                        onClick={() => updateMedicine.mutate({ id: m.id, isActive: false })}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => updateMedicine.mutate({ id: m.id, isActive: true })}
                      >
                        Reactivate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section-card">
        <h2>Add medicine</h2>
        {createMedicine.error && <Alert variant="danger">{createMedicine.error.message}</Alert>}
        <form onSubmit={submit}>
          <Field label="Name" id="med-name" value={form.name} onChange={set('name')} required />
          <Field label="Generic name (optional)" id="med-generic" value={form.genericName} onChange={set('genericName')} />
          <Field label="Dosage forms (comma-separated)" id="med-forms" value={form.dosageForms} onChange={set('dosageForms')} required />
          <Field label="Unit price (PKR)" id="med-price" type="number" min="1" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} required />
          <Button type="submit" isLoading={createMedicine.isPending}>Add medicine</Button>
        </form>
      </div>
    </SidebarLayout>
  );
}
```

(Check the actual prop names of `Field`/`Button` in `client/src/shared/` when wiring — `Field` forwards `...inputProps` and renders the label `htmlFor`/`id` pair; `Button` takes `variant`/`isLoading`. Adjust only if the real props differ.)

- [ ] **Step 5: Create the routes factory** (`client/src/modules/admin/admin.routes.jsx`):

```jsx
// @ts-check
import { Navigate } from 'react-router-dom';
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { AdminMedicines } from './views/AdminMedicines/AdminMedicines.jsx';

/** Admin sidebar links (A-01…A-05). Entries are added as the views land. */
export const ADMIN_LINKS = [
  { to: '/admin/medicines', label: 'Medicines' },
];

const guard = (session, el) => (
  <RoleRoute session={session} role="admin">
    {el}
  </RoleRoute>
);

export const adminRoutes = (session) => [
  { path: '/admin', element: guard(session, <Navigate to="/admin/medicines" replace />) },
  { path: '/admin/medicines', element: guard(session, <AdminMedicines />) },
];
```

(Later tasks add the other four links/routes and flip the `/admin` redirect to `/admin/doctors`.)

- [ ] **Step 6: Wire the aggregator + remove the placeholder.**

(a) `client/src/routes.jsx` — add the import and spread:

```js
import { adminRoutes } from './modules/admin/admin.routes.jsx';
```

and inside `buildRoutes`:

```js
  ...adminRoutes(session),
```

(b) `client/src/App.jsx` — delete the line:

```jsx
      <Route path="/admin" element={<Placeholder label="Admin panel" />} />
```

- [ ] **Step 7: Run the client suite**

Run: `npm --workspace client test`
Expected: 64 passed (61 + 3), no regressions.

- [ ] **Step 8: Commit**

```bash
git add client/src/modules/admin client/src/routes.jsx client/src/App.jsx
git commit -m "feat(client): A-02 admin medicines view + admin module scaffolding (routes, useAdmin, sidebar links)"
```

---

### Task 5: Doctor admin DTOs (shared Zod)

**Files:**
- Modify: `shared/schemas/doctor/doctor.js`

Declarative DTOs; exercised by Tasks 6–9 tests (same precedent as Slice F Task 2).

- [ ] **Step 1: Add to `shared/schemas/doctor/doctor.js`** (below the existing schemas; `availabilityBlockSchema` is already defined in this file):

```js
/** POST /api/doctors (F10.01, admin). Photo arrives via a separate multipart route. */
export const doctorCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(20),
  pmcNumber: z.string().trim().min(1).max(40),
  specialization: z.string().trim().min(1).max(120),
  /** PKR paisa. */
  fee: z.number().int().positive(),
  bio: z.string().trim().min(1).max(2000),
  /** DA1: admin-set initial password, shared out-of-band. */
  initialPassword: z.string().min(8).max(200),
  /** F10.01 optional weekly availability template. */
  blocks: z.array(availabilityBlockSchema).max(50).optional(),
});

/** PATCH /api/doctors/:id (F10.02). pmcNumber/email are NOT here — immutable (#8);
 *  their presence in a request body is rejected with 409 IMMUTABLE_FIELD before validation. */
export const doctorUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    specialization: z.string().trim().min(1).max(120).optional(),
    fee: z.number().int().positive().optional(),
    bio: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

/** POST /api/doctors/:id/reset-password (DA5). */
export const adminPasswordResetSchema = z.object({
  newPassword: z.string().min(8).max(200),
});
```

- [ ] **Step 2: Extend the list query schema.** In the same file, replace `doctorListQuerySchema` with:

```js
export const doctorListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  /** Admin-only (A-01): include pending + deactivated doctors. */
  includeInactive: z.literal('true').optional(),
});
```

- [ ] **Step 3: Run suite, commit**

Run: `npm test` → 204 passed (no behavior change yet).

```bash
git add shared/schemas/doctor
git commit -m "feat(schemas): doctor admin DTOs — create/update/reset + includeInactive (F10)"
```

---

### Task 6: Doctor admin service — `createDoctor` + `listAllDoctors`

**Files:**
- Create: `server/src/modules/doctor/admin.service.js`
- Test: `server/src/modules/doctor/admin.test.js`

New file inside the existing doctor module (feature-first, ADR-26): all admin-only doctor writes live here; the public read service stays untouched.

- [ ] **Step 1: Write the failing tests** (`server/src/modules/doctor/admin.test.js`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    doctor: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../lib/password/password.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-pw'),
}));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('./service.js', () => ({ replaceBlocksForDoctor: vi.fn().mockResolvedValue([]) }));

import { prisma } from '../../lib/prisma/prisma.js';
import * as audit from '../../services/audit/audit.service.js';
import { createDoctor, listAllDoctors } from './admin.service.js';

beforeEach(() => vi.clearAllMocks());

function arrangeTx() {
  const tx = {
    user: { create: vi.fn().mockResolvedValue({ id: 'u-new' }) },
    doctor: { create: vi.fn().mockResolvedValue({ id: 'd-new', userId: 'u-new' }) },
    availabilityBlock: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  return tx;
}

const CREATE_DATA = {
  fullName: 'Dr New',
  email: 'new@dermestha.dev',
  phone: '03001234567',
  pmcNumber: 'PMC-9999',
  specialization: 'Acne',
  fee: 250000,
  bio: 'New consultant.',
  initialPassword: 'Password123',
};

describe('createDoctor (F10.01 / DA1)', () => {
  it('creates User(doctor, mustChangePassword=true) + Doctor(pending, inactive) in one tx', async () => {
    const tx = arrangeTx();
    await createDoctor({ data: CREATE_DATA, actorId: 'admin1' });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        role: 'doctor',
        email: 'new@dermestha.dev',
        phone: '03001234567',
        fullName: 'Dr New',
        passwordHash: 'hashed-pw',
        mustChangePassword: true,
      },
    });
    expect(tx.doctor.create).toHaveBeenCalledWith({
      data: {
        userId: 'u-new',
        pmcNumber: 'PMC-9999',
        specialization: 'Acne',
        fee: 250000,
        bio: 'New consultant.',
        isActive: false,
        status: 'pending',
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.created', actorType: 'admin', actorId: 'admin1', targetRef: 'd-new' }),
    );
  });

  it('persists the optional weekly template blocks in the same tx', async () => {
    const tx = arrangeTx();
    const blocks = [{ weekday: 1, startTime: '18:00', endTime: '21:00' }];
    await createDoctor({ data: { ...CREATE_DATA, blocks }, actorId: 'admin1' });
    expect(tx.availabilityBlock.createMany).toHaveBeenCalledWith({
      data: [{ doctorId: 'd-new', weekday: 1, startTime: '18:00', endTime: '21:00' }],
    });
  });

  it('maps P2002 on email to 409 EMAIL_TAKEN and on pmc_number to 409 PMC_TAKEN', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['email'] } });
    await expect(createDoctor({ data: CREATE_DATA, actorId: 'a' })).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
      status: 409,
    });
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['pmc_number'] } });
    await expect(createDoctor({ data: CREATE_DATA, actorId: 'a' })).rejects.toMatchObject({
      code: 'PMC_TAKEN',
      status: 409,
    });
  });
});

describe('listAllDoctors (A-01)', () => {
  it('returns every doctor with contact fields and a future-confirmed count', async () => {
    prisma.doctor.findMany.mockResolvedValue([
      {
        id: 'd1',
        pmcNumber: 'PMC-1001',
        specialization: 'Acne',
        fee: 250000,
        bio: 'b',
        photoUrl: null,
        isActive: false,
        status: 'active',
        user: { fullName: 'Dr A', email: 'a@x.dev', phone: '0300' },
        _count: { appointments: 2 },
      },
    ]);
    const out = await listAllDoctors();
    expect(out[0]).toEqual({
      id: 'd1',
      fullName: 'Dr A',
      email: 'a@x.dev',
      phone: '0300',
      pmcNumber: 'PMC-1001',
      specialization: 'Acne',
      fee: 250000,
      bio: 'b',
      photoUrl: null,
      isActive: false,
      status: 'active',
      upcomingConfirmedCount: 2,
    });
    const arg = prisma.doctor.findMany.mock.calls[0][0];
    expect(arg.where).toBeUndefined(); // ALL doctors, not just active
    expect(arg.include._count.select.appointments.where.state).toBe('confirmed');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/doctor/admin.test.js`
Expected: FAIL — "Cannot find module './admin.service.js'".

- [ ] **Step 3: Implement** (`server/src/modules/doctor/admin.service.js`):

```js
// @ts-check
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { hashPassword } from '../../lib/password/password.js';
import { env } from '../../config/env/env.js';
import * as audit from '../../services/audit/audit.service.js';
import { replaceBlocksForDoctor } from './service.js';

/** Admin row shape for A-01 (incl. immutable fields, shown read-only in the UI). */
const toAdminRow = (d) => ({
  id: d.id,
  fullName: d.user.fullName,
  email: d.user.email,
  phone: d.user.phone,
  pmcNumber: d.pmcNumber,
  specialization: d.specialization,
  fee: d.fee,
  bio: d.bio,
  photoUrl: d.photoUrl,
  isActive: d.isActive,
  status: d.status,
  upcomingConfirmedCount: d._count.appointments,
});

/** A-01 list: every doctor (pending/active/deactivated) + Deactivation-Warning count (#9). */
export async function listAllDoctors() {
  const rows = await prisma.doctor.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { fullName: true, email: true, phone: true } },
      _count: {
        select: {
          appointments: { where: { state: 'confirmed', slotStart: { gt: new Date() } } },
        },
      },
    },
  });
  return rows.map(toAdminRow);
}

/**
 * F10.01 / DA1: one tx creates User(role=doctor, admin-set password, mustChangePassword=true)
 * + Doctor(pending, isActive=false — the Pending-State Rule) + the optional weekly template.
 */
export async function createDoctor({ data, actorId }) {
  const { initialPassword, blocks, fullName, email, phone, ...profile } = data;
  const passwordHash = await hashPassword(initialPassword);
  let doctor;
  try {
    doctor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { role: 'doctor', email, phone, fullName, passwordHash, mustChangePassword: true },
      });
      const created = await tx.doctor.create({
        data: {
          userId: user.id,
          pmcNumber: profile.pmcNumber,
          specialization: profile.specialization,
          fee: profile.fee,
          bio: profile.bio,
          isActive: false,
          status: 'pending',
        },
      });
      if (blocks?.length) {
        await tx.availabilityBlock.createMany({
          data: blocks.map((b) => ({ doctorId: created.id, ...b })),
        });
      }
      return created;
    });
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'P2002') {
      const target = String(/** @type {any} */ (e)?.meta?.target ?? '');
      if (target.includes('pmc')) {
        throw new AppError('PMC_TAKEN', 'A doctor with this PMC number already exists.', 409);
      }
      throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
    }
    throw e;
  }
  await audit.record({
    eventType: 'doctor.created',
    actorType: 'admin',
    actorId,
    targetRef: doctor.id,
  });
  return doctor;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/modules/doctor/admin.test.js` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/doctor/admin.service.js server/src/modules/doctor/admin.test.js
git commit -m "feat(doctor): admin createDoctor (tx, pending-state, DA1) + listAllDoctors with confirmed-count (F10.01)"
```

---

### Task 7: Doctor admin service — update, (de/re)activate, DA5 reset, admin availability

**Files:**
- Modify: `server/src/modules/doctor/service.js` (extract `replaceBlocksForDoctor`)
- Modify: `server/src/modules/doctor/admin.service.js`
- Modify: `server/src/modules/doctor/admin.test.js`

- [ ] **Step 1: Write the failing tests.** Append to `server/src/modules/doctor/admin.test.js` (extend the import line to `import { createDoctor, listAllDoctors, updateDoctor, setDoctorActive, resetDoctorPassword, adminReplaceBlocks } from './admin.service.js';`):

```js
import { hashPassword } from '../../lib/password/password.js';
import { replaceBlocksForDoctor } from './service.js';

describe('updateDoctor (F10.02)', () => {
  beforeEach(() => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
  });

  it('splits user fields (fullName/phone) from doctor fields and audits the changed keys', async () => {
    const tx = {
      user: { update: vi.fn().mockResolvedValue({}) },
      doctor: { update: vi.fn().mockResolvedValue({ id: 'd1' }) },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    await updateDoctor({ id: 'd1', data: { fullName: 'Dr Renamed', fee: 300000 }, actorId: 'admin1' });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { fullName: 'Dr Renamed' },
    });
    expect(tx.doctor.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { fee: 300000 } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'doctor.updated',
        targetRef: 'd1',
        meta: { fields: ['fullName', 'fee'] },
      }),
    );
  });

  it('unknown id → 404 NOT_FOUND', async () => {
    prisma.doctor.findUnique.mockResolvedValue(null);
    await expect(updateDoctor({ id: 'nope', data: { fee: 1 }, actorId: 'a' })).rejects.toMatchObject(
      { code: 'NOT_FOUND', status: 404 },
    );
  });
});

describe('setDoctorActive (F10.03 / #9)', () => {
  it('deactivate sets isActive=false ONLY — no cascade fields touched', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    prisma.doctor.update.mockResolvedValue({ id: 'd1', isActive: false });
    await setDoctorActive({ id: 'd1', isActive: false, actorId: 'admin1' });
    expect(prisma.doctor.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { isActive: false },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.deactivated', targetRef: 'd1' }),
    );
  });

  it('reactivate restores listing AND promotes a pending doctor to active status', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1', status: 'pending' });
    prisma.doctor.update.mockResolvedValue({ id: 'd1', isActive: true });
    await setDoctorActive({ id: 'd1', isActive: true, actorId: 'admin1' });
    expect(prisma.doctor.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { isActive: true, status: 'active' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.reactivated' }),
    );
  });
});

describe('resetDoctorPassword (DA5)', () => {
  it('hashes the admin-set password and re-arms mustChangePassword', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    prisma.user.update.mockResolvedValue({});
    await resetDoctorPassword({ id: 'd1', newPassword: 'NewPass123', actorId: 'admin1' });
    expect(hashPassword).toHaveBeenCalledWith('NewPass123');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: 'hashed-pw', mustChangePassword: true },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.password_reset', targetRef: 'd1' }),
    );
  });
});

describe('adminReplaceBlocks (F10.01/.02 weekly template)', () => {
  it('delegates to the doctorId-keyed core and audits', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    await adminReplaceBlocks({ doctorId: 'd1', blocks: [], actorId: 'admin1' });
    expect(replaceBlocksForDoctor).toHaveBeenCalledWith('d1', []);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.availability_updated', targetRef: 'd1' }),
    );
  });

  it('unknown doctor → 404', async () => {
    prisma.doctor.findUnique.mockResolvedValue(null);
    await expect(
      adminReplaceBlocks({ doctorId: 'nope', blocks: [], actorId: 'a' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/doctor/admin.test.js`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 3: Extract the availability core.** In `server/src/modules/doctor/service.js`, replace the existing `replaceWeeklyBlocks` function with the two functions below — the body is **identical** to the current one except the doctor lookup moves into the wrapper:

```js
/** Core block replacement, keyed by doctorId (shared by the doctor-own and admin paths).
 *  Enforces the BLOCK_HAS_BOOKINGS guard (edge #14) before replacing. */
export async function replaceBlocksForDoctor(doctorId, blocks) {
  const futureActive = await prisma.appointment.findMany({
    where: {
      doctorId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotStart: { gt: new Date() },
      // Lazy expiry (ADR-23): an expired slot_locked no longer occupies the slot, so it must
      // not spuriously trigger BLOCK_HAS_BOOKINGS. Mirrors the exclusion in generateSlots.
      NOT: { state: 'slot_locked', lockExpiresAt: { lt: new Date() } },
    },
    select: { id: true, slotStart: true },
  });
  const orphans = futureActive.filter((a) => {
    const dateYMD = formatInTimeZone(a.slotStart, KARACHI, 'yyyy-MM-dd');
    return !blocksCoverSlot(blocks, a.slotStart, dateYMD);
  });
  if (orphans.length > 0) {
    throw new AppError(
      'BLOCK_HAS_BOOKINGS',
      'Cancel the affected bookings before changing this availability.',
      409,
      {
        appointmentIds: orphans.map((o) => o.id),
      },
    );
  }

  await prisma.$transaction([
    prisma.availabilityBlock.deleteMany({ where: { doctorId } }),
    prisma.availabilityBlock.createMany({
      data: blocks.map((b) => ({ doctorId, ...b })),
    }),
  ]);
  return getWeeklyBlocks(doctorId);
}

export async function replaceWeeklyBlocks(userId, blocks) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor profile not found.', 404);
  return replaceBlocksForDoctor(doctor.id, blocks);
}
```

- [ ] **Step 4: Implement the admin functions.** Append to `server/src/modules/doctor/admin.service.js`:

```js
/** F10.02: PATCH editable fields. fullName/phone live on User; the rest on Doctor.
 *  pmcNumber/email never reach this function (rejected at the route, #8). */
export async function updateDoctor({ id, data, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const { fullName, phone, ...docFields } = data;
  const userFields = {
    ...(fullName !== undefined ? { fullName } : {}),
    ...(phone !== undefined ? { phone } : {}),
  };
  await prisma.$transaction(async (tx) => {
    if (Object.keys(userFields).length) {
      await tx.user.update({ where: { id: doctor.userId }, data: userFields });
    }
    if (Object.keys(docFields).length) {
      await tx.doctor.update({ where: { id }, data: docFields });
    }
  });
  await audit.record({
    eventType: 'doctor.updated',
    actorType: 'admin',
    actorId,
    targetRef: id,
    meta: { fields: Object.keys(data) },
  });
}

/** F10.03 / #9: flips listing visibility ONLY — appointments, login, panel access untouched.
 *  First activation of a `pending` doctor also promotes status to `active` (Pending-State Rule). */
export async function setDoctorActive({ id, isActive, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const updated = await prisma.doctor.update({
    where: { id },
    data: isActive ? { isActive: true, status: 'active' } : { isActive: false },
  });
  await audit.record({
    eventType: isActive ? 'doctor.reactivated' : 'doctor.deactivated',
    actorType: 'admin',
    actorId,
    targetRef: id,
  });
  return updated;
}

/** DA5: admin-mediated recovery; the doctor must change it on next login (DA3). */
export async function resetDoctorPassword({ id, newPassword, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: doctor.userId },
    data: { passwordHash, mustChangePassword: true },
  });
  await audit.record({
    eventType: 'doctor.password_reset',
    actorType: 'admin',
    actorId,
    targetRef: id,
  });
}

/** Admin write of the weekly template (F10.01/.02). Same core + guard as the doctor-own path. */
export async function adminReplaceBlocks({ doctorId, blocks, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const result = await replaceBlocksForDoctor(doctorId, blocks);
  await audit.record({
    eventType: 'doctor.availability_updated',
    actorType: 'admin',
    actorId,
    targetRef: doctorId,
  });
  return result;
}
```

- [ ] **Step 5: Run module tests + full suite** (the `replaceWeeklyBlocks` refactor must not break the existing doctor tests)

Run: `npx vitest run server/src/modules/doctor` → PASS. `npm test` → 211 passed.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/doctor
git commit -m "feat(doctor): admin update/deactivate/reactivate, DA5 reset, admin availability write over extracted core (F10.02/.03)"
```

---

### Task 8: Photo pipeline — `UPLOADS_DIR` env, magic-byte sniff, `saveDoctorPhoto`, static serving

**Files:**
- Modify: `server/src/config/env/env.js`
- Modify: `server/src/modules/doctor/admin.service.js`
- Modify: `server/src/modules/doctor/admin.test.js`
- Modify: `server/src/index.js`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing tests.** Append to `server/src/modules/doctor/admin.test.js` (the `node:fs/promises` mock from Task 6 is already in place; extend the import to add `saveDoctorPhoto, sniffImageExt`):

```js
import { mkdir, writeFile } from 'node:fs/promises';

describe('sniffImageExt (magic bytes — extension and client MIME are never trusted)', () => {
  it('detects jpeg / png / webp and rejects everything else (incl. SVG)', () => {
    expect(sniffImageExt(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImageExt(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffImageExt(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('webp');
    expect(sniffImageExt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageExt(Buffer.from([0x00, 0x01]))).toBeNull();
  });
});

describe('saveDoctorPhoto (F10.01 photo upload)', () => {
  it('writes uploads/doctors/<id>.<ext>, updates photoUrl, audits', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    prisma.doctor.update.mockResolvedValue({ id: 'd1' });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const out = await saveDoctorPhoto({ id: 'd1', buffer: jpeg, actorId: 'admin1' });
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('doctors'), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('d1.jpg'), jpeg);
    expect(prisma.doctor.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { photoUrl: '/uploads/doctors/d1.jpg' },
    });
    expect(out).toEqual({ photoUrl: '/uploads/doctors/d1.jpg' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.photo_updated', targetRef: 'd1' }),
    );
  });

  it('rejects a non-image buffer with 400 INVALID_FILE and writes nothing', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    await expect(
      saveDoctorPhoto({ id: 'd1', buffer: Buffer.from('<svg/>'), actorId: 'a' }),
    ).rejects.toMatchObject({ code: 'INVALID_FILE', status: 400 });
    expect(writeFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/doctor/admin.test.js`
Expected: FAIL — `sniffImageExt` / `saveDoctorPhoto` not exported.

- [ ] **Step 3: Add the env var.** In `server/src/config/env/env.js`, add to the schema object (after `ERROR_TRACKING_DSN`):

```js
  UPLOADS_DIR: z.string().default('./uploads'),
```

and in `.env.example` add (matching the file's existing comment style):

```
# Doctor profile photos land here; in Docker this path is the dermestha_uploads volume.
UPLOADS_DIR=./uploads
```

- [ ] **Step 4: Implement.** Append to `server/src/modules/doctor/admin.service.js` (its imports from Task 6 already include `mkdir`, `writeFile`, `path`, `env`):

```js
/** JPEG/PNG/WebP by magic bytes (F10.01). SVG and everything else → null (XSS vector). */
export function sniffImageExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** Writes the validated photo to UPLOADS_DIR (server-generated filename — no traversal). */
export async function saveDoctorPhoto({ id, buffer, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id }, select: { id: true } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const ext = sniffImageExt(buffer);
  if (!ext) throw new AppError('INVALID_FILE', 'Photo must be a JPEG, PNG, or WebP image.', 400);
  const dir = path.resolve(env.UPLOADS_DIR, 'doctors');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.${ext}`), buffer);
  const photoUrl = `/uploads/doctors/${id}.${ext}`;
  await prisma.doctor.update({ where: { id }, data: { photoUrl } });
  await audit.record({
    eventType: 'doctor.photo_updated',
    actorType: 'admin',
    actorId,
    targetRef: id,
  });
  return { photoUrl };
}
```

- [ ] **Step 5: Serve the uploads statically.** In `server/src/index.js`, after `registerRoutes(app);` and before the `express.static(CLIENT_DIST)` line, add:

```js
  // Uploaded doctor photos (Slice G). In Docker this path is the dermestha_uploads volume.
  app.use('/uploads', express.static(path.resolve(env.UPLOADS_DIR)));
```

- [ ] **Step 6: Run module tests + full suite**

Run: `npx vitest run server/src/modules/doctor/admin.test.js` → PASS. `npm test` → 214 passed (env default keeps existing env tests green — spot-check `server/src/config/env/env.test.js` output).

- [ ] **Step 7: Commit**

```bash
git add server/src/config/env server/src/modules/doctor server/src/index.js .env.example
git commit -m "feat(doctor): photo pipeline — UPLOADS_DIR, magic-byte sniff, saveDoctorPhoto, /uploads static (F10.01)"
```

---

### Task 9: F10 routes + controller — immutability guard, multer, includeInactive branch

**Files:**
- Modify: `server/src/modules/doctor/controller.js`
- Modify: `server/src/modules/doctor/index.js`
- Modify: `server/src/modules/doctor/test.js` (only if an existing list test breaks — see Step 5)

- [ ] **Step 1: Install multer** (server workspace):

Run: `npm --workspace server install multer`
Expected: `package.json` + lockfile updated, no peer warnings that block install.

- [ ] **Step 2: Controller handlers.** Append to `server/src/modules/doctor/controller.js`:

```js
import * as adminService from './admin.service.js';

export async function create(req, res, next) {
  try {
    res.status(201).json(await adminService.createDoctor({ data: req.body, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function update(req, res, next) {
  try {
    await adminService.updateDoctor({ id: req.params.id, data: req.body, actorId: req.session.userId });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function deactivate(req, res, next) {
  try {
    res.json(await adminService.setDoctorActive({ id: req.params.id, isActive: false, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function reactivate(req, res, next) {
  try {
    res.json(await adminService.setDoctorActive({ id: req.params.id, isActive: true, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function resetPassword(req, res, next) {
  try {
    await adminService.resetDoctorPassword({
      id: req.params.id,
      newPassword: req.body.newPassword,
      actorId: req.session.userId,
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function photo(req, res, next) {
  try {
    if (!req.file?.buffer) throw new AppError('INVALID_FILE', 'Attach a photo file.', 400);
    res.json(await adminService.saveDoctorPhoto({ id: req.params.id, buffer: req.file.buffer, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function adminReplaceAvailability(req, res, next) {
  try {
    res.json({
      blocks: await adminService.adminReplaceBlocks({
        doctorId: req.params.id,
        blocks: req.body.blocks,
        actorId: req.session.userId,
      }),
    });
  } catch (e) {
    next(e);
  }
}
```

(`AppError` is already imported at the top of controller.js.)

- [ ] **Step 3: The list branch.** In `server/src/modules/doctor/controller.js`, replace the existing `list` handler:

```js
export async function list(req, res, next) {
  try {
    // includeInactive (A-01) is admin-only; the public listing path is unchanged.
    if (req.body.includeInactive === 'true') {
      if (req.session?.role !== 'admin') throw new AppError('FORBIDDEN', 'Not allowed.', 403);
      return res.json({ data: await adminService.listAllDoctors() });
    }
    res.json(await doctorService.listActiveDoctors(req.body /* parsed query, see route */));
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 4: Routes.** In `server/src/modules/doctor/index.js`, add imports:

```js
import multer from 'multer';
import { AppError } from '../../http/AppError.js';
import { makeRateLimiter } from '../../middleware/rateLimit/rateLimit.js';
import {
  doctorCreateSchema,
  doctorUpdateSchema,
  adminPasswordResetSchema,
} from '../../../../shared/schemas/index.js';
```

(merge the schema names into the existing `shared/schemas` import line), then add below `validateQuery`:

```js
// PMC/email immutability (#8): presence of either key in a PATCH body is a 409, not a silent strip.
const rejectImmutable = (req, _res, next) => {
  if ('pmcNumber' in (req.body ?? {}) || 'email' in (req.body ?? {})) {
    return next(new AppError('IMMUTABLE_FIELD', 'PMC number and email cannot be changed.', 409));
  }
  next();
};

// 2MB cap (F10.01). multer errors (oversize, wrong part) become the uniform 400 envelope.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const photoUpload = (req, res, next) =>
  upload.single('photo')(req, res, (err) => {
    if (err) return next(new AppError('INVALID_FILE', 'Photo must be a single file of at most 2MB.', 400));
    next();
  });

// Modest throttle on admin doctor writes (house style — same factory as payLimiter).
const adminWriteLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  code: 'RATE_LIMITED',
  keyGenerator: (req) => req.session?.userId ?? req.ip,
});
```

and the admin routes after the existing four `doctorsRouter` routes:

```js
// ── Admin doctor management (F10, doc 05 §F02/F10) ─────────────────────────
doctorsRouter.post('/', requireRole('admin'), adminWriteLimiter, validate(doctorCreateSchema), c.create);
doctorsRouter.patch('/:id', requireRole('admin'), adminWriteLimiter, rejectImmutable, validate(doctorUpdateSchema), c.update);
doctorsRouter.post('/:id/deactivate', requireRole('admin'), adminWriteLimiter, c.deactivate);
doctorsRouter.post('/:id/reactivate', requireRole('admin'), adminWriteLimiter, c.reactivate);
doctorsRouter.post('/:id/reset-password', requireRole('admin'), adminWriteLimiter, validate(adminPasswordResetSchema), c.resetPassword);
doctorsRouter.post('/:id/photo', requireRole('admin'), adminWriteLimiter, photoUpload, c.photo);
doctorsRouter.put('/:id/availability', requireRole('admin'), adminWriteLimiter, validate(availabilityReplaceSchema), c.adminReplaceAvailability);
```

(The 60-per-15-min ceiling is far above any human admin pace — it exists to blunt scripted abuse of a stolen session, per design §6. The Task 21 integration test issues well under 60 admin writes, so it is unaffected.)

(`availabilityReplaceSchema` is already imported in this file.)

- [ ] **Step 5: Run the full suite.** Routing/controller wiring is exercised by the Task 13/19 integration test; here the suite guards regressions.

Run: `npm test`
Expected: 214 passed. If an existing `doctor/test.js` list test fails because `list` now reads `req.body.includeInactive`, it will be because that test calls the controller directly — none currently do (they test the service); investigate before changing any test.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/doctor server/package.json package-lock.json
git commit -m "feat(doctor): F10 admin routes — create/edit (IMMUTABLE_FIELD), de/reactivate, DA5 reset, multer photo, admin availability"
```

---

### Task 10: A-01 Admin doctors — list, deactivate/reactivate, reset-password

**Files:**
- Modify: `client/src/modules/admin/useAdmin.js`
- Create: `client/src/modules/admin/views/AdminDoctors/AdminDoctors.jsx`
- Test: `client/src/modules/admin/views/AdminDoctors/AdminDoctors.test.jsx`
- Modify: `client/src/modules/admin/admin.routes.jsx`

Add/edit forms land in Task 11; this task ships the list + lifecycle actions as working software.

- [ ] **Step 1: Write the failing test** (`client/src/modules/admin/views/AdminDoctors/AdminDoctors.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '../../../../lib/apiClient/apiClient.js';
import { AdminDoctors } from './AdminDoctors.jsx';

const DOCTORS = {
  data: [
    {
      id: 'd1', fullName: 'Dr Ayesha Khan', email: 'a@x.dev', phone: '0300', pmcNumber: 'PMC-1001',
      specialization: 'Acne', fee: 250000, bio: 'b', photoUrl: null,
      isActive: true, status: 'active', upcomingConfirmedCount: 3,
    },
    {
      id: 'd2', fullName: 'Dr Pending', email: 'p@x.dev', phone: '0301', pmcNumber: 'PMC-2002',
      specialization: 'Eczema', fee: 300000, bio: 'b', photoUrl: null,
      isActive: false, status: 'pending', upcomingConfirmedCount: 0,
    },
  ],
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminDoctors />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(DOCTORS);
});

describe('AdminDoctors (A-01)', () => {
  it('lists every doctor with status badges via includeInactive', async () => {
    renderView();
    expect(await screen.findByText('Dr Ayesha Khan')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/doctors?includeInactive=true');
  });

  it('deactivation goes through a warning modal that shows the upcoming-confirmed count (#9)', async () => {
    api.post.mockResolvedValue({ id: 'd1', isActive: false });
    renderView();
    await screen.findByText('Dr Ayesha Khan');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(api.post).not.toHaveBeenCalled(); // nothing happens before confirm
    expect(screen.getByText(/3 upcoming confirmed appointment/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate doctor' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/doctors/d1/deactivate'));
  });

  it('reset-password modal posts the admin-set password (DA5)', async () => {
    api.post.mockResolvedValue({ ok: true });
    renderView();
    await screen.findByText('Dr Ayesha Khan');
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset password' })[0]);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/doctors/d1/reset-password', { newPassword: 'NewPass123' }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --workspace client test -- run src/modules/admin/views/AdminDoctors`
Expected: FAIL — cannot resolve `./AdminDoctors.jsx`.

- [ ] **Step 3: Extend the hook.** In `client/src/modules/admin/useAdmin.js`, extend the opts destructure to `{ medicines: medicinesEnabled = false, medicinesSearch = '', doctors: doctorsEnabled = false }`, and add before the `return`:

```js
  const doctors = useQuery({
    queryKey: ['admin-doctors'],
    queryFn: () => api.get('/doctors?includeInactive=true'),
    enabled: doctorsEnabled,
  });

  const invalidateDoctors = () => qc.invalidateQueries({ queryKey: ['admin-doctors'] });

  const createDoctor = useMutation({
    mutationFn: (body) => api.post('/doctors', body),
    onSuccess: invalidateDoctors,
  });

  const updateDoctor = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/doctors/${id}`, body),
    onSuccess: invalidateDoctors,
  });

  const setDoctorActive = useMutation({
    mutationFn: ({ id, isActive }) => api.post(`/doctors/${id}/${isActive ? 'reactivate' : 'deactivate'}`),
    onSuccess: invalidateDoctors,
  });

  const resetDoctorPassword = useMutation({
    mutationFn: ({ id, newPassword }) => api.post(`/doctors/${id}/reset-password`, { newPassword }),
  });

  const uploadDoctorPhoto = useMutation({
    mutationFn: ({ id, file }) => {
      const fd = new FormData();
      fd.append('photo', file);
      return api.upload(`/doctors/${id}/photo`, fd);
    },
    onSuccess: invalidateDoctors,
  });

  const saveDoctorBlocks = useMutation({
    mutationFn: ({ id, blocks }) => api.put(`/doctors/${id}/availability`, { blocks }),
    onSuccess: invalidateDoctors,
  });
```

and add them all to the returned object:

```js
  return {
    medicines, createMedicine, updateMedicine,
    doctors, createDoctor, updateDoctor, setDoctorActive,
    resetDoctorPassword, uploadDoctorPhoto, saveDoctorBlocks,
  };
```

- [ ] **Step 4: Create the view** (`client/src/modules/admin/views/AdminDoctors/AdminDoctors.jsx`):

```jsx
// @ts-check
import { useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

const pkr = (paisa) => `Rs ${(paisa / 100).toLocaleString()}`;

function statusBadge(d) {
  if (d.status === 'pending') return <span className="badge badge--info">Pending</span>;
  if (!d.isActive) return <span className="badge badge--warning">Deactivated</span>;
  return <span className="badge badge--success">Active</span>;
}

export function AdminDoctors() {
  const { doctors, setDoctorActive, resetDoctorPassword } = useAdmin({ doctors: true });
  const [deactivating, setDeactivating] = useState(null); // doctor row or null
  const [resetting, setResetting] = useState(null); // doctor row or null
  const [newPassword, setNewPassword] = useState('');

  const rows = doctors.data?.data ?? [];

  const confirmDeactivate = () =>
    setDoctorActive.mutate(
      { id: deactivating.id, isActive: false },
      { onSuccess: () => setDeactivating(null) },
    );

  const confirmReset = () =>
    resetDoctorPassword.mutate(
      { id: resetting.id, newPassword },
      { onSuccess: () => { setResetting(null); setNewPassword(''); } },
    );

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Doctors</h1>

      <div className="section-card">
        {doctors.isLoading && <p>Loading…</p>}
        {doctors.error && <Alert variant="danger">{doctors.error.message}</Alert>}
        {!doctors.isLoading && rows.length === 0 && <p className="empty">No doctors yet.</p>}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>PMC</th><th>Specialization</th><th>Fee</th><th>Status</th><th>Upcoming</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.fullName}</td>
                  <td>{d.pmcNumber}</td>
                  <td>{d.specialization}</td>
                  <td>{pkr(d.fee)}</td>
                  <td>{statusBadge(d)}</td>
                  <td>{d.upcomingConfirmedCount}</td>
                  <td>
                    {d.isActive ? (
                      <Button variant="danger" onClick={() => setDeactivating(d)}>Deactivate</Button>
                    ) : (
                      <Button variant="secondary" onClick={() => setDoctorActive.mutate({ id: d.id, isActive: true })}>
                        Activate
                      </Button>
                    )}{' '}
                    <Button variant="ghost" onClick={() => setResetting(d)}>Reset password</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deactivating && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__body">
              <h2>Deactivate {deactivating.fullName}?</h2>
              <p>
                {deactivating.upcomingConfirmedCount} upcoming confirmed appointment(s) will remain on
                their calendar and will be honoured — deactivation only removes the doctor from the
                public listing and blocks new bookings. Login is not revoked.
              </p>
            </div>
            <div className="modal__actions">
              <Button variant="ghost" onClick={() => setDeactivating(null)}>Cancel</Button>
              <Button variant="danger" isLoading={setDoctorActive.isPending} onClick={confirmDeactivate}>
                Deactivate doctor
              </Button>
            </div>
          </div>
        </div>
      )}

      {resetting && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__body">
              <h2>Reset password — {resetting.fullName}</h2>
              <p>Share the new password out-of-band; the doctor must change it on next login.</p>
              {resetDoctorPassword.error && (
                <Alert variant="danger">{resetDoctorPassword.error.message}</Alert>
              )}
              <Field
                label="New password"
                id="reset-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="modal__actions">
              <Button variant="ghost" onClick={() => setResetting(null)}>Cancel</Button>
              <Button isLoading={resetDoctorPassword.isPending} onClick={confirmReset}>Set password</Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
```

- [ ] **Step 5: Route + link + landing flip.** In `client/src/modules/admin/admin.routes.jsx`: import `AdminDoctors`, change the `/admin` redirect target to `/admin/doctors`, and update:

```jsx
export const ADMIN_LINKS = [
  { to: '/admin/doctors', label: 'Doctors' },
  { to: '/admin/medicines', label: 'Medicines' },
];
```

```jsx
export const adminRoutes = (session) => [
  { path: '/admin', element: guard(session, <Navigate to="/admin/doctors" replace />) },
  { path: '/admin/doctors', element: guard(session, <AdminDoctors />) },
  { path: '/admin/medicines', element: guard(session, <AdminMedicines />) },
];
```

- [ ] **Step 6: Run the client suite**

Run: `npm --workspace client test`
Expected: 67 passed (64 + 3), no regressions.

- [ ] **Step 7: Commit**

```bash
git add client/src/modules/admin
git commit -m "feat(client): A-01 admin doctors list — status badges, deactivation warning modal, DA5 reset (F10)"
```

---

### Task 11: A-01 Admin doctors — add/edit form, photo upload, weekly template editor

**Files:**
- Create: `client/src/modules/admin/components/WeeklyBlocksEditor/WeeklyBlocksEditor.jsx`
- Create: `client/src/modules/admin/components/DoctorForm/DoctorForm.jsx`
- Test: `client/src/modules/admin/components/DoctorForm/DoctorForm.test.jsx`
- Modify: `client/src/modules/admin/views/AdminDoctors/AdminDoctors.jsx`

- [ ] **Step 1: Write the failing test** (`client/src/modules/admin/components/DoctorForm/DoctorForm.test.jsx`):

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DoctorForm } from './DoctorForm.jsx';

describe('DoctorForm (A-01)', () => {
  it('add mode collects all F10.01 fields incl. initial password, submits PKR fee as paisa', () => {
    const onSubmit = vi.fn();
    render(<DoctorForm mode="add" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Dr New' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@x.dev' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '03001234567' } });
    fireEvent.change(screen.getByLabelText('PMC number'), { target: { value: 'PMC-9' } });
    fireEvent.change(screen.getByLabelText('Specialization'), { target: { value: 'Acne' } });
    fireEvent.change(screen.getByLabelText('Consultation fee (PKR)'), { target: { value: '2500' } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Consultant.' } });
    fireEvent.change(screen.getByLabelText('Initial password'), { target: { value: 'Password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save doctor' }));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        fullName: 'Dr New',
        email: 'new@x.dev',
        phone: '03001234567',
        pmcNumber: 'PMC-9',
        specialization: 'Acne',
        fee: 250000,
        bio: 'Consultant.',
        initialPassword: 'Password123',
        blocks: [],
      },
      null, // no photo file selected
    );
  });

  it('edit mode omits PMC, email and password entirely and shows the fee-snapshot note (#8/#6)', () => {
    render(
      <DoctorForm
        mode="edit"
        initial={{ fullName: 'Dr A', phone: '0300', specialization: 'Acne', fee: 250000, bio: 'b' }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByLabelText('PMC number')).toBeNull();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Initial password')).toBeNull();
    expect(screen.getByText(/never affect existing appointments/)).toBeTruthy();
  });

  it('weekly template editor adds a block row into the submitted payload', () => {
    const onSubmit = vi.fn();
    render(<DoctorForm mode="add" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    // defaults: Monday 09:00–17:00 — submit without filling the rest fails HTML validation,
    // so fill the required fields minimally first:
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'D' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'd@x.dev' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '03001234567' } });
    fireEvent.change(screen.getByLabelText('PMC number'), { target: { value: 'P-1' } });
    fireEvent.change(screen.getByLabelText('Specialization'), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText('Consultation fee (PKR)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('Initial password'), { target: { value: 'Password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save doctor' }));
    expect(onSubmit.mock.calls[0][0].blocks).toEqual([
      { weekday: 1, startTime: '09:00', endTime: '17:00' },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --workspace client test -- run src/modules/admin/components/DoctorForm`
Expected: FAIL — cannot resolve `./DoctorForm.jsx`.

- [ ] **Step 3: Weekly blocks editor** (`client/src/modules/admin/components/WeeklyBlocksEditor/WeeklyBlocksEditor.jsx`) — compact controlled list (the D-03 grid pattern, admin-scoped):

```jsx
// @ts-check
import { Button } from '../../../../shared/Button/Button.jsx';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Controlled editor for [{weekday,startTime,endTime}] (F10.01 weekly template). */
export function WeeklyBlocksEditor({ blocks, onChange }) {
  const update = (i, key, value) =>
    onChange(blocks.map((b, j) => (j === i ? { ...b, [key]: value } : b)));
  const remove = (i) => onChange(blocks.filter((_, j) => j !== i));
  const add = () => onChange([...blocks, { weekday: 1, startTime: '09:00', endTime: '17:00' }]);

  return (
    <div>
      {blocks.map((b, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="filters" style={{ marginBottom: 'var(--sp-2)' }}>
          <select
            className="input"
            aria-label={`Block ${i + 1} weekday`}
            value={b.weekday}
            onChange={(e) => update(i, 'weekday', Number(e.target.value))}
          >
            {WEEKDAYS.map((w, idx) => (
              <option key={w} value={idx}>{w}</option>
            ))}
          </select>
          <input
            className="input"
            type="time"
            aria-label={`Block ${i + 1} start`}
            value={b.startTime}
            onChange={(e) => update(i, 'startTime', e.target.value)}
          />
          <input
            className="input"
            type="time"
            aria-label={`Block ${i + 1} end`}
            value={b.endTime}
            onChange={(e) => update(i, 'endTime', e.target.value)}
          />
          <Button type="button" variant="ghost" onClick={() => remove(i)}>Remove</Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={add}>Add block</Button>
    </div>
  );
}
```

- [ ] **Step 4: Doctor form** (`client/src/modules/admin/components/DoctorForm/DoctorForm.jsx`):

```jsx
// @ts-check
import { useState } from 'react';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { WeeklyBlocksEditor } from '../WeeklyBlocksEditor/WeeklyBlocksEditor.jsx';

/**
 * A-01 add/edit form. Edit mode (F10.02) has NO pmc/email/password inputs — immutability by
 * absence (#8) — and shows the fee-snapshot note (#6). Photo is handed back as a File (or null);
 * the caller uploads it in a follow-up multipart request.
 * @param {{ mode: 'add'|'edit', initial?: object, isSaving?: boolean, error?: Error|null,
 *   onSubmit: (payload: object, photoFile: File|null) => void, onCancel: () => void }} props
 */
export function DoctorForm({ mode, initial = {}, isSaving = false, error = null, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    fullName: initial.fullName ?? '',
    email: '',
    phone: initial.phone ?? '',
    pmcNumber: '',
    specialization: initial.specialization ?? '',
    fee: initial.fee != null ? String(initial.fee / 100) : '',
    bio: initial.bio ?? '',
    initialPassword: '',
  });
  const [blocks, setBlocks] = useState(initial.blocks ?? []);
  const [photoFile, setPhotoFile] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const common = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      specialization: form.specialization.trim(),
      fee: Math.round(parseFloat(form.fee) * 100),
      bio: form.bio.trim(),
    };
    if (mode === 'add') {
      onSubmit(
        {
          ...common,
          email: form.email.trim(),
          pmcNumber: form.pmcNumber.trim(),
          initialPassword: form.initialPassword,
          blocks,
        },
        photoFile,
      );
    } else {
      onSubmit({ ...common, blocks }, photoFile);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert--danger" role="alert">{error.message}</div>}
      <Field label="Full name" id="df-name" value={form.fullName} onChange={set('fullName')} required />
      {mode === 'add' && (
        <>
          <Field label="Email" id="df-email" type="email" value={form.email} onChange={set('email')} required />
          <Field label="PMC number" id="df-pmc" value={form.pmcNumber} onChange={set('pmcNumber')} required />
        </>
      )}
      <Field label="Phone" id="df-phone" value={form.phone} onChange={set('phone')} required />
      <Field label="Specialization" id="df-spec" value={form.specialization} onChange={set('specialization')} required />
      <Field label="Consultation fee (PKR)" id="df-fee" type="number" min="1" step="0.01" value={form.fee} onChange={set('fee')} required />
      {mode === 'edit' && (
        <p className="help">Fee changes never affect existing appointments — the fee was snapshotted at booking.</p>
      )}
      <Field label="Bio" id="df-bio" value={form.bio} onChange={set('bio')} required />
      {mode === 'add' && (
        <Field
          label="Initial password"
          id="df-pw"
          type="password"
          value={form.initialPassword}
          onChange={set('initialPassword')}
          required
        />
      )}

      <Field
        label="Profile photo (JPEG/PNG/WebP, max 2MB)"
        id="df-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
      />
      {photoFile && <p className="help">Selected: {photoFile.name}</p>}

      <h3>Weekly availability template</h3>
      <WeeklyBlocksEditor blocks={blocks} onChange={setBlocks} />

      <div className="modal__actions" style={{ marginTop: 'var(--sp-4)' }}>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" isLoading={isSaving}>Save doctor</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Wire into the view.** In `client/src/modules/admin/views/AdminDoctors/AdminDoctors.jsx`:

(a) Add imports + hook fields:

```jsx
import { DoctorForm } from '../../components/DoctorForm/DoctorForm.jsx';
```

and destructure the extra mutations: `const { doctors, setDoctorActive, resetDoctorPassword, createDoctor, updateDoctor, uploadDoctorPhoto, saveDoctorBlocks } = useAdmin({ doctors: true });`

(b) Add state + handlers after the existing `useState` lines:

```jsx
  const [editing, setEditing] = useState(null); // null | 'add' | doctor row
  const afterSave = async (doctorId, blocks, photoFile, isEdit) => {
    if (isEdit) await saveDoctorBlocks.mutateAsync({ id: doctorId, blocks });
    if (photoFile) await uploadDoctorPhoto.mutateAsync({ id: doctorId, file: photoFile });
    setEditing(null);
  };
  const submitForm = (payload, photoFile) => {
    if (editing === 'add') {
      // blocks travel inside the create body; only the photo needs the follow-up request
      createDoctor.mutate(payload, {
        onSuccess: (created) => afterSave(created.id, [], photoFile, false),
      });
    } else {
      const { blocks, ...body } = payload;
      updateDoctor.mutate({ id: editing.id, ...body }, {
        onSuccess: () => afterSave(editing.id, blocks, photoFile, true),
      });
    }
  };
```

(c) Add an "Add doctor" button above the table, an "Edit" button per row, and the form panel; inside the first `section-card`, before the loading line:

```jsx
        <div className="modal__actions" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => setEditing('add')}>Add doctor</Button>
        </div>
```

per row, next to the existing action buttons:

```jsx
                    <Button variant="ghost" onClick={() => setEditing(d)}>Edit</Button>{' '}
```

and after the table's closing `section-card` div:

```jsx
      {editing && (
        <div className="section-card">
          <h2>{editing === 'add' ? 'Add doctor' : `Edit ${editing.fullName}`}</h2>
          <DoctorForm
            mode={editing === 'add' ? 'add' : 'edit'}
            initial={editing === 'add' ? {} : editing}
            isSaving={createDoctor.isPending || updateDoctor.isPending}
            error={createDoctor.error || updateDoctor.error}
            onSubmit={submitForm}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
```

**Availability-PUT guard:** in edit mode the blocks editor starts empty (the form does not fetch the doctor's current grid in v1), so an untouched editor must NOT issue a replace — it would wipe the doctor's existing schedule. In `afterSave`, write the guard as `if (isEdit && blocks.length > 0)` so the availability `PUT` fires only when the admin actually entered template rows.

- [ ] **Step 6: Run the client suite**

Run: `npm --workspace client test`
Expected: 70 passed (67 + 3), no regressions.

- [ ] **Step 7: Commit**

```bash
git add client/src/modules/admin
git commit -m "feat(client): A-01 doctor add/edit form — immutability by absence, photo upload, weekly template editor (F10)"
```

---

### Task 12: F13 DTOs + appointment dispute flag

**Files:**
- Create: `shared/schemas/admin/admin.js`
- Modify: `shared/schemas/index.js`
- Modify: `shared/schemas/appointment/appointment.js`
- Modify: `server/src/modules/appointment/service.js`
- Modify: `server/src/modules/appointment/controller.js`
- Modify: `server/src/modules/appointment/index.js`
- Modify: `server/src/modules/appointment/test.js`

- [ ] **Step 1: Write the failing test.** Append to `server/src/modules/appointment/test.js` (the file's existing prisma + audit mocks cover this; add `setDisputed` to the service import destructure at the top):

```js
describe('setDisputed (F13.02 / A-04)', () => {
  it('sets the flag, audits appointment.disputed — NOT a state transition', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    prisma.appointment.update.mockResolvedValue({ id: 'a1', disputed: true });
    await setDisputed({ appointmentId: 'a1', disputed: true, actorId: 'admin1' });
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { disputed: true },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'appointment.disputed',
        actorType: 'admin',
        actorId: 'admin1',
        targetRef: 'a1',
      }),
    );
  });

  it('clearing audits appointment.dispute_cleared; unknown id → 404', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1' });
    prisma.appointment.update.mockResolvedValue({ id: 'a1', disputed: false });
    await setDisputed({ appointmentId: 'a1', disputed: false, actorId: 'admin1' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'appointment.dispute_cleared' }),
    );
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(
      setDisputed({ appointmentId: 'nope', disputed: true, actorId: 'a' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/modules/appointment/test.js`
Expected: FAIL — `setDisputed` is not exported.

- [ ] **Step 3: DTOs.**

(a) `shared/schemas/appointment/appointment.js` — append:

```js
/** POST /api/appointments/:id/dispute (F13.02, admin). One route sets AND clears. */
export const disputeSchema = z.object({
  disputed: z.boolean(),
});
```

(b) Create `shared/schemas/admin/admin.js`:

```js
// @ts-check
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** GET /api/admin/records (F13.01 filter superset). */
export const recordsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  /** Matches patient email OR phone (one box in the UI). */
  patient: z.string().trim().max(200).optional(),
  doctorName: z.string().trim().max(200).optional(),
  appointmentId: z.string().trim().max(64).optional(),
  /** Matches payment providerRef OR refundRef. */
  paymentRef: z.string().trim().max(128).optional(),
  state: z.string().trim().max(40).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** GET /api/admin/audit (doc 05: appointmentId,userId,email,eventType,actorType,from,to). */
export const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  appointmentId: z.string().trim().max(64).optional(),
  userId: z.string().trim().max(64).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  eventType: z.string().trim().max(80).optional(),
  actorType: z.enum(['patient', 'doctor', 'admin', 'system']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** PUT /api/admin/settings (F14). Full replace of the three tunables, bounded. */
export const settingsUpdateSchema = z.object({
  /** Floor 30 per §4.1 #3; ceiling one day. */
  minBookingLeadMinutes: z.number().int().min(30).max(24 * 60),
  /** Basis points, 0–100%. */
  fallbackFeePctBps: z.number().int().min(0).max(10000),
  /** PKR paisa, non-negative. */
  fallbackFeeFixed: z.number().int().min(0),
});
```

(c) `shared/schemas/index.js` — add:

```js
export * from './admin/admin.js';
```

- [ ] **Step 4: Implement the service.** Append to `server/src/modules/appointment/service.js`:

```js
/** F13.02: support-workflow flag, orthogonal to the state machine — never a transition. */
export async function setDisputed({ appointmentId, disputed, actorId }) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true },
  });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { disputed },
  });
  await audit.record({
    eventType: disputed ? 'appointment.disputed' : 'appointment.dispute_cleared',
    actorType: 'admin',
    actorId,
    targetRef: appointmentId,
  });
  return updated;
}
```

- [ ] **Step 5: Controller + route.**

(a) Append to `server/src/modules/appointment/controller.js`:

```js
export async function dispute(req, res, next) {
  try {
    res.json(
      await appointmentService.setDisputed({
        appointmentId: req.params.id,
        disputed: req.body.disputed,
        actorId: req.session.userId,
      }),
    );
  } catch (e) {
    next(e);
  }
}
```

(Match the file's actual service-import alias — the other handlers in this controller call the same module; reuse their alias.)

(b) In `server/src/modules/appointment/index.js`: add `disputeSchema` to the shared-schemas import, define an admin write limiter below the existing `payLimiter` (the `makeRateLimiter` import is already there):

```js
const adminWriteLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  code: 'RATE_LIMITED',
  keyGenerator: (req) => req.session?.userId ?? req.ip,
});
```

and the route after the `/:id/cancel` route:

```js
// POST /api/appointments/:id/dispute  (admin; flag set/clear — not a transition) (F13.02)
appointmentsRouter.post('/:id/dispute', requireRole('admin'), adminWriteLimiter, validate(disputeSchema), c.dispute);
```

- [ ] **Step 6: Run module tests + full suite**

Run: `npx vitest run server/src/modules/appointment/test.js` → PASS. `npm test` → 216 passed.

- [ ] **Step 7: Commit**

```bash
git add shared/schemas server/src/modules/appointment
git commit -m "feat(appointment): admin dispute flag set/clear + F13/F14 shared DTOs (F13.02)"
```

---

### Task 13: Admin module — records list + record detail

**Files:**
- Create: `server/src/modules/admin/service.js`
- Test: `server/src/modules/admin/test.js`

- [ ] **Step 1: Write the failing tests** (`server/src/modules/admin/test.js`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    appointment: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    notificationJob: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    settings: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));

import { prisma } from '../../lib/prisma/prisma.js';
import * as audit from '../../services/audit/audit.service.js';
import { listRecords, getRecordDetail } from './service.js';

beforeEach(() => {
  vi.clearAllMocks();
  // listRecords runs findMany+count through one $transaction array call.
  prisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
});

const ROW = {
  id: 'a1',
  slotStart: new Date('2099-01-02T13:00:00Z'),
  slotEnd: new Date('2099-01-02T13:30:00Z'),
  state: 'prescription_issued',
  disputed: false,
  forSelf: false,
  subjectName: 'Ali',
  patient: { fullName: 'Parent P', email: 'p@t.test' },
  doctor: { user: { fullName: 'Dr A' } },
  payments: [
    { status: 'failed', amount: 250000, providerRef: 'pf_bad', refundRef: null, refundStatus: null },
    { status: 'success', amount: 250000, providerRef: 'pf_ok', refundRef: 'rf_1', refundStatus: 'settled' },
  ],
};

describe('admin.listRecords (F13.01)', () => {
  it('maps doc-02 row columns; the SUCCESS payment wins (enum is success, not paid)', async () => {
    prisma.appointment.findMany.mockResolvedValue([ROW]);
    prisma.appointment.count.mockResolvedValue(1);
    const out = await listRecords({ page: 1, pageSize: 20 });
    expect(out.data[0]).toEqual({
      id: 'a1',
      slotStart: ROW.slotStart,
      slotEnd: ROW.slotEnd,
      state: 'prescription_issued',
      disputed: false,
      patientName: 'Parent P',
      patientEmail: 'p@t.test',
      subjectName: 'Ali',
      doctorName: 'Dr A',
      amountPaid: 250000,
      paymentRef: 'pf_ok',
      refundRef: 'rf_1',
    });
    expect(out.page).toEqual({ number: 1, size: 20, total: 1 });
  });

  it('composes the filter superset into the where clause', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.appointment.count.mockResolvedValue(0);
    await listRecords({
      page: 2,
      pageSize: 10,
      patient: 'p@t.test',
      doctorName: 'Ayesha',
      paymentRef: 'pf_ok',
      state: 'confirmed',
      from: '2099-01-01',
      to: '2099-02-01',
    });
    const arg = prisma.appointment.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(10);
    expect(arg.take).toBe(10);
    expect(arg.orderBy).toEqual({ slotStart: 'desc' });
    expect(arg.where.state).toBe('confirmed');
    expect(arg.where.patient.OR[0].email.contains).toBe('p@t.test');
    expect(arg.where.doctor.user.fullName.contains).toBe('Ayesha');
    expect(arg.where.payments.some.OR).toEqual([
      { providerRef: 'pf_ok' },
      { refundRef: 'pf_ok' },
    ]);
    expect(arg.where.slotStart.gte).toEqual(new Date('2099-01-01'));
  });
});

describe('admin.getRecordDetail (F13.02)', () => {
  it('returns the appointment + transition history + prescriptions + email jobs', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      ...ROW,
      feeAtBooking: 250000,
      prescriptions: [{ id: 'rx1', issuedAt: new Date('2099-01-02T14:00:00Z'), items: [] }],
      notificationJobs: [{ id: 'n1', type: 'booking_confirmation', status: 'failed', lastError: 'boom' }],
    });
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'e1', at: new Date(), eventType: 'appointment.confirmed', actorType: 'system' },
    ]);
    const out = await getRecordDetail('a1');
    expect(out.appointment.id).toBe('a1');
    expect(out.history[0].eventType).toBe('appointment.confirmed');
    expect(out.prescriptions).toHaveLength(1);
    expect(out.notificationJobs[0].status).toBe('failed');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { targetRef: 'a1' },
      orderBy: { at: 'asc' },
    });
  });

  it('unknown id → 404', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(getRecordDetail('nope')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/admin/test.js`
Expected: FAIL — "Cannot find module './service.js'".

- [ ] **Step 3: Implement** (`server/src/modules/admin/service.js`):

```js
// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import * as audit from '../../services/audit/audit.service.js';

/** Doc-02 F13.01 record row. The settled money figures come from the SUCCESS payment row
 *  (PaymentStatus enum: pending|success|failed — there is no "paid"). */
const toRecordRow = (a) => {
  const paid = a.payments.find((p) => p.status === 'success');
  return {
    id: a.id,
    slotStart: a.slotStart,
    slotEnd: a.slotEnd,
    state: a.state,
    disputed: a.disputed,
    patientName: a.patient.fullName,
    patientEmail: a.patient.email,
    subjectName: a.forSelf ? null : a.subjectName,
    doctorName: a.doctor.user.fullName,
    amountPaid: paid?.amount ?? null,
    paymentRef: paid?.providerRef ?? null,
    refundRef: paid?.refundRef ?? null,
  };
};

/** F13.01: unified, filtered, paginated, newest-first. Read-only projection. */
export async function listRecords({
  page = 1,
  pageSize = 20,
  patient,
  doctorName,
  appointmentId,
  paymentRef,
  state,
  from,
  to,
} = {}) {
  const where = {
    ...(appointmentId ? { id: appointmentId } : {}),
    ...(state ? { state } : {}),
    ...(patient
      ? {
          patient: {
            OR: [
              { email: { contains: patient, mode: 'insensitive' } },
              { phone: { contains: patient } },
            ],
          },
        }
      : {}),
    ...(doctorName
      ? { doctor: { user: { fullName: { contains: doctorName, mode: 'insensitive' } } } }
      : {}),
    ...(paymentRef
      ? { payments: { some: { OR: [{ providerRef: paymentRef }, { refundRef: paymentRef }] } } }
      : {}),
    ...(from || to
      ? {
          slotStart: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.appointment.findMany({
      where,
      orderBy: { slotStart: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { fullName: true, email: true } },
        doctor: { select: { user: { select: { fullName: true } } } },
        payments: {
          select: { status: true, amount: true, providerRef: true, refundRef: true, refundStatus: true },
        },
      },
    }),
    prisma.appointment.count({ where }),
  ]);
  return { data: rows.map(toRecordRow), page: { number: page, size: pageSize, total } };
}

/** F13.02: one appointment with its full transition history (audit), prescriptions, email jobs. */
export async function getRecordDetail(appointmentId) {
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { fullName: true, email: true } },
      doctor: { select: { user: { select: { fullName: true } } } },
      payments: true,
      prescriptions: { include: { items: true }, orderBy: { issuedAt: 'asc' } },
      notificationJobs: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!a) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  const history = await prisma.auditLog.findMany({
    where: { targetRef: appointmentId },
    orderBy: { at: 'asc' },
  });
  const { prescriptions, notificationJobs, ...appointment } = a;
  return { appointment: { ...appointment, ...toRecordRow(a) }, history, prescriptions, notificationJobs };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/modules/admin/test.js` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/admin
git commit -m "feat(admin): unified records projection — filter superset, success-payment mapping, record detail (F13)"
```

---

### Task 14: Admin module — audit query, email re-trigger, controller + router + mount

**Files:**
- Modify: `server/src/modules/admin/service.js`
- Modify: `server/src/modules/admin/test.js`
- Create: `server/src/modules/admin/controller.js`
- Create: `server/src/modules/admin/index.js`
- Modify: `server/src/routes.js`

- [ ] **Step 1: Write the failing tests.** Append to `server/src/modules/admin/test.js` (extend the import to `import { listRecords, getRecordDetail, listAuditEntries, resendEmail } from './service.js';`):

```js
describe('admin.listAuditEntries (F13.01 audit filters)', () => {
  it('filters by appointmentId/eventType/actorType/date and pages newest-first', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    await listAuditEntries({
      page: 1,
      pageSize: 50,
      appointmentId: 'a1',
      eventType: 'login',
      actorType: 'doctor',
      from: '2099-01-01',
    });
    const arg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      targetRef: 'a1',
      eventType: 'login',
      actorType: 'doctor',
      at: { gte: new Date('2099-01-01') },
    });
    expect(arg.orderBy).toEqual({ at: 'desc' });
  });

  it('email filter resolves the user and filters on actorId; unknown email matches nothing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    await listAuditEntries({ email: 'ghost@t.test' });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where.actorId).toBe('__no_match__');
  });
});

describe('admin.resendEmail (F12.02 Email-Only Re-Trigger)', () => {
  it('resets ONLY a failed job back to pending for the worker to pick up, and audits', async () => {
    prisma.notificationJob.findUnique.mockResolvedValue({
      id: 'n1',
      appointmentId: 'a1',
      type: 'booking_confirmation',
      status: 'failed',
    });
    prisma.notificationJob.update.mockResolvedValue({ id: 'n1', status: 'pending' });
    await resendEmail({ jobId: 'n1', actorId: 'admin1' });
    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { status: 'pending', attempts: 0, nextAttemptAt: null, lastError: null },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'admin.email_resend',
        actorId: 'admin1',
        targetRef: 'a1',
        meta: { jobId: 'n1', type: 'booking_confirmation' },
      }),
    );
  });

  it('a non-failed job → 409 INVALID_STATE; unknown job → 404', async () => {
    prisma.notificationJob.findUnique.mockResolvedValue({ id: 'n1', status: 'sent' });
    await expect(resendEmail({ jobId: 'n1', actorId: 'a' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      status: 409,
    });
    prisma.notificationJob.findUnique.mockResolvedValue(null);
    await expect(resendEmail({ jobId: 'nope', actorId: 'a' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/admin/test.js`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 3: Implement the services.** Append to `server/src/modules/admin/service.js`:

```js
/** F13.01 audit tab: filtered append-only log, newest-first. */
export async function listAuditEntries({
  page = 1,
  pageSize = 50,
  appointmentId,
  userId,
  email,
  eventType,
  actorType,
  from,
  to,
} = {}) {
  let actorId = userId;
  if (!actorId && email) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    actorId = u?.id ?? '__no_match__'; // unknown email must match nothing, not everything
  }
  const where = {
    ...(appointmentId ? { targetRef: appointmentId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(eventType ? { eventType } : {}),
    ...(actorType ? { actorType } : {}),
    ...(from || to
      ? { at: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { data: rows, page: { number: page, size: pageSize, total } };
}

/** F12.02: failed → pending (attempts reset); the existing dispatch worker re-sends.
 *  No parallel send path; emails only — refunds are NEVER re-triggered in-app (#10). */
export async function resendEmail({ jobId, actorId }) {
  const job = await prisma.notificationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError('NOT_FOUND', 'Notification job not found.', 404);
  if (job.status !== 'failed') {
    throw new AppError('INVALID_STATE', 'Only failed emails can be re-triggered.', 409);
  }
  const updated = await prisma.notificationJob.update({
    where: { id: jobId },
    data: { status: 'pending', attempts: 0, nextAttemptAt: null, lastError: null },
  });
  await audit.record({
    eventType: 'admin.email_resend',
    actorType: 'admin',
    actorId,
    targetRef: job.appointmentId,
    meta: { jobId, type: job.type },
  });
  return updated;
}
```

- [ ] **Step 4: Controller** (`server/src/modules/admin/controller.js`):

```js
// @ts-check
import * as adminService from './service.js';

export async function records(req, res, next) {
  try {
    res.json(await adminService.listRecords(req.query));
  } catch (e) {
    next(e);
  }
}

export async function recordDetail(req, res, next) {
  try {
    res.json(await adminService.getRecordDetail(req.params.id));
  } catch (e) {
    next(e);
  }
}

export async function auditEntries(req, res, next) {
  try {
    res.json(await adminService.listAuditEntries(req.query));
  } catch (e) {
    next(e);
  }
}

export async function resendEmail(req, res, next) {
  try {
    res.json(await adminService.resendEmail({ jobId: req.params.jobId, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 5: Router** (`server/src/modules/admin/index.js`) — Task 17/19 add the alerts + settings routes here:

```js
// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import { makeRateLimiter } from '../../middleware/rateLimit/rateLimit.js';
import { recordsQuerySchema, auditQuerySchema } from '../../../../shared/schemas/index.js';

// Validate req.query into req.query (Zod) without a body. Small inline middleware.
const validateQuery = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(r.error);
  req.query = r.data;
  next();
};

// Modest throttle on the mutating admin routes (design §6; same factory as payLimiter).
const adminWriteLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  code: 'RATE_LIMITED',
  keyGenerator: (req) => req.session?.userId ?? req.ip,
});

export const adminRouter = Router();
// GET /api/admin/records  (A-04 unified records, F13.01)
adminRouter.get('/records', requireRole('admin'), validateQuery(recordsQuerySchema), c.records);
// GET /api/admin/records/:id  (A-04 detail: history + prescriptions + email jobs, F13.02)
adminRouter.get('/records/:id', requireRole('admin'), c.recordDetail);
// GET /api/admin/audit  (A-04 audit tab, F13.01)
adminRouter.get('/audit', requireRole('admin'), validateQuery(auditQuerySchema), c.auditEntries);
// POST /api/admin/emails/:jobId/resend  (F12.02; :jobId = notification_jobs.id)
adminRouter.post('/emails/:jobId/resend', requireRole('admin'), adminWriteLimiter, c.resendEmail);
```

- [ ] **Step 6: Mount.** In `server/src/routes.js`, add the import:

```js
import { adminRouter } from './modules/admin/index.js';
```

and after the `app.use('/api/admin/medicines', adminMedicinesRouter);` line:

```js
  app.use('/api/admin', adminRouter);
```

(Mounted after the medicines router so `/api/admin/medicines` keeps matching its own router first.)

- [ ] **Step 7: Run module tests + full suite**

Run: `npx vitest run server/src/modules/admin/test.js` → PASS (8 tests). `npm test` → 220 passed.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/admin server/src/routes.js
git commit -m "feat(admin): audit query + email re-trigger (failed→pending) + /api/admin router mount (F13/F12.02)"
```

---

### Task 15: A-04 Records & audit — list view, filter bar, shared `Pagination`

**Files:**
- Create: `client/src/shared/Pagination/Pagination.jsx`
- Create: `client/src/modules/admin/views/AdminRecords/AdminRecords.jsx`
- Test: `client/src/modules/admin/views/AdminRecords/AdminRecords.test.jsx`
- Modify: `client/src/modules/admin/useAdmin.js`
- Modify: `client/src/modules/admin/admin.routes.jsx`

- [ ] **Step 1: Write the failing test** (`client/src/modules/admin/views/AdminRecords/AdminRecords.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '../../../../lib/apiClient/apiClient.js';
import { AdminRecords } from './AdminRecords.jsx';

const RECORDS = {
  data: [
    {
      id: 'a1', slotStart: '2099-01-02T13:00:00Z', slotEnd: '2099-01-02T13:30:00Z',
      state: 'prescription_issued', disputed: true, patientName: 'Parent P', patientEmail: 'p@t.test',
      subjectName: 'Ali', doctorName: 'Dr A', amountPaid: 250000, paymentRef: 'pf_ok', refundRef: null,
    },
  ],
  page: { number: 1, size: 20, total: 45 },
};
const AUDIT = {
  data: [
    { id: 'e1', at: '2099-01-02T13:05:00Z', eventType: 'appointment.confirmed', actorType: 'system', actorId: null, targetRef: 'a1', reason: null },
  ],
  page: { number: 1, size: 50, total: 1 },
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminRecords />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) =>
    Promise.resolve(path.startsWith('/admin/audit') ? AUDIT : RECORDS),
  );
});

describe('AdminRecords (A-04)', () => {
  it('renders record rows with who-for, money columns and a disputed badge', async () => {
    renderView();
    expect(await screen.findByText('Parent P')).toBeTruthy();
    expect(screen.getByText(/for: Ali/)).toBeTruthy();
    expect(screen.getByText('Rs 2,500')).toBeTruthy();
    expect(screen.getByText('Disputed')).toBeTruthy();
    expect(screen.getByText(/Page 1 of 3/)).toBeTruthy(); // 45 / 20
  });

  it('filter submit re-queries with the filter querystring', async () => {
    renderView();
    await screen.findByText('Parent P');
    fireEvent.change(screen.getByLabelText('Patient email / phone'), { target: { value: 'p@t.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('patient=p%40t.test')),
    );
  });

  it('audit tab lists audit entries from /admin/audit', async () => {
    renderView();
    await screen.findByText('Parent P');
    fireEvent.click(screen.getByRole('button', { name: 'Audit log' }));
    expect(await screen.findByText('appointment.confirmed')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --workspace client test -- run src/modules/admin/views/AdminRecords`
Expected: FAIL — cannot resolve `./AdminRecords.jsx`.

- [ ] **Step 3: Shared Pagination** (`client/src/shared/Pagination/Pagination.jsx`):

```jsx
// @ts-check
import { Button } from '../Button/Button.jsx';

/** Server-page navigator over the house `{ number, size, total }` page envelope. */
export function Pagination({ page, onPage }) {
  const pages = Math.max(1, Math.ceil(page.total / page.size));
  return (
    <div className="filters" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
      <Button variant="ghost" disabled={page.number <= 1} onClick={() => onPage(page.number - 1)}>
        Previous
      </Button>
      <span>
        Page {page.number} of {pages}
      </span>
      <Button variant="ghost" disabled={page.number >= pages} onClick={() => onPage(page.number + 1)}>
        Next
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Hook queries.** In `client/src/modules/admin/useAdmin.js`, add a local helper above `useAdmin`:

```js
/** Object → querystring, skipping empty values. */
const qs = (obj) => {
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};
```

extend the opts destructure with `recordsFilters = null, auditFilters = null`, and add:

```js
  const records = useQuery({
    queryKey: ['admin-records', recordsFilters],
    queryFn: () => api.get(`/admin/records${qs(recordsFilters)}`),
    enabled: Boolean(recordsFilters),
  });

  const auditEntries = useQuery({
    queryKey: ['admin-audit', auditFilters],
    queryFn: () => api.get(`/admin/audit${qs(auditFilters)}`),
    enabled: Boolean(auditFilters),
  });
```

and add `records, auditEntries` to the returned object.

- [ ] **Step 5: The view** (`client/src/modules/admin/views/AdminRecords/AdminRecords.jsx`):

```jsx
// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { Pagination } from '../../../../shared/Pagination/Pagination.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

const pkr = (paisa) => (paisa == null ? '—' : `Rs ${(paisa / 100).toLocaleString()}`);
const karachi = (iso) =>
  new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });

const EMPTY_FILTERS = { patient: '', doctorName: '', appointmentId: '', paymentRef: '', from: '', to: '' };

export function AdminRecords() {
  const [tab, setTab] = useState('records');
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState({ page: 1 });
  const [auditApplied, setAuditApplied] = useState({ page: 1 });
  const { records, auditEntries } = useAdmin({
    recordsFilters: tab === 'records' ? applied : null,
    auditFilters: tab === 'audit' ? auditApplied : null,
  });
  const set = (k) => (e) => setDraft((f) => ({ ...f, [k]: e.target.value }));
  const search = (e) => {
    e.preventDefault();
    setApplied({ ...draft, page: 1 });
  };

  const rows = records.data?.data ?? [];
  const auditRows = auditEntries.data?.data ?? [];

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Records &amp; audit log</h1>

      <div className="tabs">
        <button type="button" className={`tab${tab === 'records' ? ' tab--active' : ''}`} onClick={() => setTab('records')}>
          Records
        </button>
        <button type="button" className={`tab${tab === 'audit' ? ' tab--active' : ''}`} onClick={() => setTab('audit')}>
          Audit log
        </button>
      </div>

      {tab === 'records' && (
        <div className="section-card">
          <form className="filters" onSubmit={search}>
            <Field label="Patient email / phone" id="f-patient" value={draft.patient} onChange={set('patient')} />
            <Field label="Doctor name" id="f-doctor" value={draft.doctorName} onChange={set('doctorName')} />
            <Field label="Appointment ID" id="f-appt" value={draft.appointmentId} onChange={set('appointmentId')} />
            <Field label="Payment ref" id="f-payref" value={draft.paymentRef} onChange={set('paymentRef')} />
            <Field label="From" id="f-from" type="date" value={draft.from} onChange={set('from')} />
            <Field label="To" id="f-to" type="date" value={draft.to} onChange={set('to')} />
            <Button type="submit">Search</Button>
          </form>

          {records.isLoading && <p>Loading…</p>}
          {records.error && <Alert variant="danger">{records.error.message}</Alert>}
          {!records.isLoading && rows.length === 0 && <p className="empty">No matching records.</p>}
          {rows.length > 0 && (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Slot</th><th>Patient</th><th>Doctor</th><th>State</th><th>Paid</th><th>Payment ref</th><th>Refund ref</th><th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{karachi(r.slotStart)}</td>
                      <td>
                        {r.patientName}
                        {r.subjectName && <span className="help"> (for: {r.subjectName})</span>}
                      </td>
                      <td>{r.doctorName}</td>
                      <td>
                        <span className="badge badge--info">{r.state}</span>{' '}
                        {r.disputed && <span className="badge badge--danger">Disputed</span>}
                      </td>
                      <td>{pkr(r.amountPaid)}</td>
                      <td>{r.paymentRef ?? '—'}</td>
                      <td>{r.refundRef ?? '—'}</td>
                      <td>
                        <Link to={`/admin/records/${r.id}`}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {records.data?.page && (
                <Pagination page={records.data.page} onPage={(p) => setApplied((f) => ({ ...f, page: p }))} />
              )}
            </>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="section-card">
          {auditEntries.isLoading && <p>Loading…</p>}
          {auditEntries.error && <Alert variant="danger">{auditEntries.error.message}</Alert>}
          {!auditEntries.isLoading && auditRows.length === 0 && <p className="empty">No audit entries.</p>}
          {auditRows.length > 0 && (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>When (Karachi)</th><th>Event</th><th>Actor</th><th>Target</th><th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((eRow) => (
                    <tr key={eRow.id}>
                      <td>{karachi(eRow.at)}</td>
                      <td>{eRow.eventType}</td>
                      <td>{eRow.actorType}{eRow.actorId ? ` (${eRow.actorId})` : ''}</td>
                      <td>{eRow.targetRef ?? '—'}</td>
                      <td>{eRow.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditEntries.data?.page && (
                <Pagination page={auditEntries.data.page} onPage={(p) => setAuditApplied((f) => ({ ...f, page: p }))} />
              )}
            </>
          )}
        </div>
      )}
    </SidebarLayout>
  );
}
```

- [ ] **Step 6: Route + link.** In `client/src/modules/admin/admin.routes.jsx`: import `AdminRecords`, add `{ to: '/admin/records', label: 'Records & audit' }` to `ADMIN_LINKS` (after Medicines), and add to `adminRoutes`:

```jsx
  { path: '/admin/records', element: guard(session, <AdminRecords />) },
```

- [ ] **Step 7: Run the client suite**

Run: `npm --workspace client test`
Expected: 73 passed (70 + 3), no regressions.

- [ ] **Step 8: Commit**

```bash
git add client/src/shared/Pagination client/src/modules/admin
git commit -m "feat(client): A-04 records & audit view — filter superset, tabs, shared Pagination (F13.01)"
```

---

### Task 16: A-04 Record detail — history, prescriptions, dispute toggle, email resend

**Files:**
- Create: `client/src/modules/admin/views/AdminRecordDetail/AdminRecordDetail.jsx`
- Test: `client/src/modules/admin/views/AdminRecordDetail/AdminRecordDetail.test.jsx`
- Modify: `client/src/modules/admin/useAdmin.js`
- Modify: `client/src/modules/admin/admin.routes.jsx`

- [ ] **Step 1: Write the failing test** (`client/src/modules/admin/views/AdminRecordDetail/AdminRecordDetail.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '../../../../lib/apiClient/apiClient.js';
import { AdminRecordDetail } from './AdminRecordDetail.jsx';

const DETAIL = {
  appointment: {
    id: 'a1', slotStart: '2099-01-02T13:00:00Z', slotEnd: '2099-01-02T13:30:00Z',
    state: 'prescription_issued', disputed: false, patientName: 'Parent P', patientEmail: 'p@t.test',
    subjectName: 'Ali', doctorName: 'Dr A', amountPaid: 250000, paymentRef: 'pf_ok', refundRef: null,
    feeAtBooking: 250000,
  },
  history: [
    { id: 'e1', at: '2099-01-02T12:00:00Z', eventType: 'appointment.confirmed', actorType: 'system', reason: null },
    { id: 'e2', at: '2099-01-02T14:00:00Z', eventType: 'appointment.prescription_issued', actorType: 'doctor', reason: null },
  ],
  prescriptions: [{ id: 'rx1', issuedAt: '2099-01-02T14:00:00Z', items: [{ id: 'i1', medicineName: 'Adapalene Gel' }] }],
  notificationJobs: [
    { id: 'n1', type: 'booking_confirmation', status: 'sent', lastError: null },
    { id: 'n2', type: 'prescription_ready', status: 'failed', lastError: 'SMTP boom' },
  ],
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/records/a1']}>
        <Routes>
          <Route path="/admin/records/:id" element={<AdminRecordDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(DETAIL);
});

describe('AdminRecordDetail (A-04 detail)', () => {
  it('shows the transition history and linked prescriptions', async () => {
    renderView();
    expect(await screen.findByText('appointment.confirmed')).toBeTruthy();
    expect(screen.getByText('appointment.prescription_issued')).toBeTruthy();
    expect(screen.getByText('Adapalene Gel')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/admin/records/a1');
  });

  it('resend is offered ONLY on failed jobs and confirms before POSTing', async () => {
    api.post.mockResolvedValue({ id: 'n2', status: 'pending' });
    renderView();
    await screen.findByText('appointment.confirmed');
    const resendButtons = screen.getAllByRole('button', { name: 'Resend' });
    expect(resendButtons).toHaveLength(1); // only the failed prescription_ready job
    fireEvent.click(resendButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Resend email' })); // confirm modal
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/emails/n2/resend'));
  });

  it('dispute toggle confirms then POSTs the flag', async () => {
    api.post.mockResolvedValue({ id: 'a1', disputed: true });
    renderView();
    await screen.findByText('appointment.confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Mark disputed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/appointments/a1/dispute', { disputed: true }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --workspace client test -- run src/modules/admin/views/AdminRecordDetail`
Expected: FAIL — cannot resolve `./AdminRecordDetail.jsx`.

- [ ] **Step 3: Hook additions.** In `client/src/modules/admin/useAdmin.js`, extend opts with `recordDetailId = null` and add:

```js
  const recordDetail = useQuery({
    queryKey: ['admin-record', recordDetailId],
    queryFn: () => api.get(`/admin/records/${recordDetailId}`),
    enabled: Boolean(recordDetailId),
  });

  const invalidateRecord = () => {
    qc.invalidateQueries({ queryKey: ['admin-record'] });
    qc.invalidateQueries({ queryKey: ['admin-records'] });
  };

  const resendEmail = useMutation({
    mutationFn: ({ jobId }) => api.post(`/admin/emails/${jobId}/resend`),
    onSuccess: invalidateRecord,
  });

  const setDisputed = useMutation({
    mutationFn: ({ id, disputed }) => api.post(`/appointments/${id}/dispute`, { disputed }),
    onSuccess: invalidateRecord,
  });
```

and add `recordDetail, resendEmail, setDisputed` to the returned object.

- [ ] **Step 4: The view** (`client/src/modules/admin/views/AdminRecordDetail/AdminRecordDetail.jsx`):

```jsx
// @ts-check
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

const pkr = (paisa) => (paisa == null ? '—' : `Rs ${(paisa / 100).toLocaleString()}`);
const karachi = (iso) =>
  new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });

export function AdminRecordDetail() {
  const { id } = useParams();
  const { recordDetail, resendEmail, setDisputed } = useAdmin({ recordDetailId: id });
  const [confirming, setConfirming] = useState(null); // null | {kind:'resend', jobId} | {kind:'dispute', disputed}

  const d = recordDetail.data;

  const confirm = () => {
    const done = { onSuccess: () => setConfirming(null) };
    if (confirming.kind === 'resend') resendEmail.mutate({ jobId: confirming.jobId }, done);
    else setDisputed.mutate({ id, disputed: confirming.disputed }, done);
  };

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <p>
        <Link to="/admin/records">← Records</Link>
      </p>
      {recordDetail.isLoading && <p>Loading…</p>}
      {recordDetail.error && <Alert variant="danger">{recordDetail.error.message}</Alert>}
      {d && (
        <>
          <h1>Appointment {d.appointment.id}</h1>

          <div className="section-card">
            <p>
              <strong>{d.appointment.patientName}</strong>
              {d.appointment.subjectName && <span> (for: {d.appointment.subjectName})</span>} with{' '}
              <strong>{d.appointment.doctorName}</strong> — {karachi(d.appointment.slotStart)}
            </p>
            <p>
              <span className="badge badge--info">{d.appointment.state}</span>{' '}
              {d.appointment.disputed && <span className="badge badge--danger">Disputed</span>}{' '}
              Paid: {pkr(d.appointment.amountPaid)} · Payment ref: {d.appointment.paymentRef ?? '—'} ·
              Refund ref: {d.appointment.refundRef ?? '—'}
            </p>
            {d.appointment.disputed ? (
              <Button variant="secondary" onClick={() => setConfirming({ kind: 'dispute', disputed: false })}>
                Clear disputed
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirming({ kind: 'dispute', disputed: true })}>
                Mark disputed
              </Button>
            )}
          </div>

          <div className="section-card">
            <h2>State history</h2>
            <table className="table">
              <thead>
                <tr><th>When (Karachi)</th><th>Event</th><th>Actor</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {d.history.map((h) => (
                  <tr key={h.id}>
                    <td>{karachi(h.at)}</td>
                    <td>{h.eventType}</td>
                    <td>{h.actorType}</td>
                    <td>{h.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-card">
            <h2>Prescriptions</h2>
            {d.prescriptions.length === 0 && <p className="empty">None.</p>}
            {d.prescriptions.map((rx) => (
              <p key={rx.id}>
                {karachi(rx.issuedAt)} — {rx.items.map((i) => i.medicineName).join(', ')}
              </p>
            ))}
          </div>

          <div className="section-card">
            <h2>Emails</h2>
            <table className="table">
              <thead>
                <tr><th>Type</th><th>Status</th><th>Last error</th><th /></tr>
              </thead>
              <tbody>
                {d.notificationJobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.type}</td>
                    <td>
                      <span className={`badge badge--${j.status === 'failed' ? 'danger' : j.status === 'sent' ? 'success' : 'info'}`}>
                        {j.status}
                      </span>
                    </td>
                    <td>{j.lastError ?? '—'}</td>
                    <td>
                      {j.status === 'failed' && (
                        <Button variant="secondary" onClick={() => setConfirming({ kind: 'resend', jobId: j.id })}>
                          Resend
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirming && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__body">
              {confirming.kind === 'resend' ? (
                <p>Re-queue this failed email? The dispatch worker will retry it within a minute.</p>
              ) : (
                <p>{confirming.disputed ? 'Mark' : 'Clear'} the disputed flag on this appointment?</p>
              )}
              {(resendEmail.error || setDisputed.error) && (
                <Alert variant="danger">{(resendEmail.error || setDisputed.error).message}</Alert>
              )}
            </div>
            <div className="modal__actions">
              <Button variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
              <Button isLoading={resendEmail.isPending || setDisputed.isPending} onClick={confirm}>
                {confirming.kind === 'resend' ? 'Resend email' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
```

- [ ] **Step 5: Route.** In `client/src/modules/admin/admin.routes.jsx`: import `AdminRecordDetail` and add:

```jsx
  { path: '/admin/records/:id', element: guard(session, <AdminRecordDetail />) },
```

- [ ] **Step 6: Run the client suite**

Run: `npm --workspace client test`
Expected: 76 passed (73 + 3), no regressions.

- [ ] **Step 7: Commit**

```bash
git add client/src/modules/admin
git commit -m "feat(client): A-04 record detail — transition history, prescriptions, dispute toggle, gated email resend (F13.02)"
```

---

### Task 17: F12 alerts — feed query + unhandled-exception audit bridge

**Files:**
- Modify: `server/src/modules/admin/service.js`
- Modify: `server/src/modules/admin/test.js`
- Modify: `server/src/modules/admin/controller.js`
- Modify: `server/src/modules/admin/index.js`
- Modify: `server/src/http/errorHandler/errorHandler.js`
- Modify: `server/src/http/errorHandler/errorHandler.test.js`

- [ ] **Step 1: Write the failing alerts tests.** Append to `server/src/modules/admin/test.js` (extend the service import with `listAlerts`):

```js
describe('admin.listAlerts (F12.01 — five sources, no dedicated table)', () => {
  it('merges audit-row alerts with derived awaiting-prescription rows, newest first', async () => {
    const NOW = new Date('2099-01-10T12:00:00Z');
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'e1', at: new Date('2099-01-10T11:00:00Z'), eventType: 'email.send_failed_final',
        actorType: 'system', targetRef: 'a1', reason: 'prescription_ready: boom', meta: null,
      },
      {
        id: 'e2', at: new Date('2099-01-09T10:00:00Z'), eventType: 'payment.refund_exhausted',
        actorType: 'system', targetRef: 'a2', reason: 'gateway 500', meta: null,
      },
    ]);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a3', slotEnd: new Date('2099-01-09T18:00:00Z'),
        doctor: { user: { fullName: 'Dr A' } },
      },
    ]);
    prisma.notificationJob.findMany.mockResolvedValue([
      { id: 'n9', appointmentId: 'a1', type: 'prescription_ready', status: 'failed' },
    ]);
    const out = await listAlerts(NOW);
    expect(out.map((a) => a.kind)).toEqual([
      'email.send_failed_final',
      'awaiting_prescription',
      'payment.refund_exhausted',
    ]);
    // the email alert is enriched with its resendable failed jobs
    expect(out[0].failedJobs).toEqual([{ id: 'n9', appointmentId: 'a1', type: 'prescription_ready', status: 'failed' }]);
    // the derived predicate: completed, no prescription, slot ended >12h before now
    const apptArg = prisma.appointment.findMany.mock.calls[0][0];
    expect(apptArg.where.state).toBe('completed');
    expect(apptArg.where.prescriptions).toEqual({ none: {} });
    expect(apptArg.where.slotEnd.lte).toEqual(new Date('2099-01-10T00:00:00Z')); // NOW − 12h
    // the audit-source list covers all four eventTypes
    const auditArg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(auditArg.where.eventType.in).toEqual([
      'payment.reconciliation_mismatch',
      'payment.refund_exhausted',
      'email.send_failed_final',
      'system.unhandled_exception',
    ]);
  });
});
```

- [ ] **Step 2: Write the failing errorHandler test.** In `server/src/http/errorHandler/errorHandler.test.js`, add (adapt the mock-res helper the file already uses — it builds `res` with `status().json()` spies; add an audit mock at the top of the file if absent):

```js
vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));
import * as audit from '../../services/audit/audit.service.js';

it('writes a system.unhandled_exception audit row for non-AppError 500s (F12.01 bridge)', () => {
  const res = mockRes();
  errorHandler(new Error('kaboom'), { path: '/api/payments/x', method: 'POST' }, res, () => {});
  expect(res.status).toHaveBeenCalledWith(500);
  expect(audit.record).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: 'system.unhandled_exception',
      actorType: 'system',
      targetRef: '/api/payments/x',
      reason: 'kaboom',
      meta: { method: 'POST' },
    }),
  );
});
```

(`mockRes` here stands for the file's existing response-stub helper — reuse whatever it is actually named in that file.)

- [ ] **Step 3: Run to verify both fail**

Run: `npx vitest run server/src/modules/admin/test.js server/src/http/errorHandler/errorHandler.test.js`
Expected: FAIL — `listAlerts` missing; no audit call from errorHandler.

- [ ] **Step 4: Implement the bridge.** Replace `server/src/http/errorHandler/errorHandler.js` with:

```js
// @ts-check
import { ZodError } from 'zod';
import { AppError } from '../AppError.js';
import { captureException } from '../../lib/errorTracking/errorTracking.js';
import * as audit from '../../services/audit/audit.service.js';

/** Express error middleware — emits the uniform envelope (API.md §1.1). */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    const details = err.issues.reduce((acc, i) => ({ ...acc, [i.path.join('.')]: i.message }), {});
    return res
      .status(400)
      .json({ error: { code: 'VALIDATION_FAILED', message: 'Validation failed.', details } });
  }
  captureException(err);
  // F12.01 alert source #5: best-effort audit row (route + message only — no stack, no PII).
  // Fire-and-forget: an audit failure must never mask the original error response.
  audit
    .record({
      eventType: 'system.unhandled_exception',
      actorType: 'system',
      targetRef: req?.path,
      reason: String(err?.message ?? err).slice(0, 500),
      meta: { method: req?.method },
    })
    .catch(() => {});
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
}
```

- [ ] **Step 5: Implement the feed.** Append to `server/src/modules/admin/service.js`:

```js
const ALERT_EVENT_TYPES = [
  'payment.reconciliation_mismatch',
  'payment.refund_exhausted',
  'email.send_failed_final',
  'system.unhandled_exception',
];
const AWAITING_PRESCRIPTION_HOURS = 12;

/** F12.01: live projection — Slice E's alert audit rows + derived awaiting-prescription rows
 *  (same predicate as the D-02 badge) + the Task-17 exception bridge. No dedicated table. */
export async function listAlerts(now = new Date()) {
  const [auditRows, awaiting] = await Promise.all([
    prisma.auditLog.findMany({
      where: { eventType: { in: ALERT_EVENT_TYPES } },
      orderBy: { at: 'desc' },
      take: 100,
    }),
    prisma.appointment.findMany({
      where: {
        state: 'completed',
        prescriptions: { none: {} },
        slotEnd: { lte: new Date(now.getTime() - AWAITING_PRESCRIPTION_HOURS * 3600 * 1000) },
      },
      orderBy: { slotEnd: 'desc' },
      include: { doctor: { select: { user: { select: { fullName: true } } } } },
    }),
  ]);

  // Enrich email alerts with their resendable failed jobs (the audit row has no jobId).
  const emailTargets = auditRows
    .filter((r) => r.eventType === 'email.send_failed_final' && r.targetRef)
    .map((r) => r.targetRef);
  const failedJobs = emailTargets.length
    ? await prisma.notificationJob.findMany({
        where: { appointmentId: { in: emailTargets }, status: 'failed' },
        select: { id: true, appointmentId: true, type: true, status: true },
      })
    : [];

  const alerts = [
    ...auditRows.map((r) => ({
      id: r.id,
      kind: r.eventType,
      at: r.at,
      targetRef: r.targetRef,
      reason: r.reason,
      meta: r.meta,
      ...(r.eventType === 'email.send_failed_final'
        ? { failedJobs: failedJobs.filter((j) => j.appointmentId === r.targetRef) }
        : {}),
    })),
    ...awaiting.map((a) => ({
      id: `awaiting_${a.id}`,
      kind: 'awaiting_prescription',
      at: a.slotEnd,
      targetRef: a.id,
      reason: `No prescription ${AWAITING_PRESCRIPTION_HOURS}h after the consultation with ${a.doctor.user.fullName}.`,
      meta: null,
    })),
  ];
  return alerts.sort((x, y) => y.at.getTime() - x.at.getTime());
}
```

- [ ] **Step 6: Controller + route.** Append to `server/src/modules/admin/controller.js`:

```js
export async function alerts(_req, res, next) {
  try {
    res.json({ data: await adminService.listAlerts() });
  } catch (e) {
    next(e);
  }
}
```

and in `server/src/modules/admin/index.js` add before the records route:

```js
// GET /api/admin/alerts  (A-03 feed, F12.01)
adminRouter.get('/alerts', requireRole('admin'), c.alerts);
```

- [ ] **Step 7: Run tests + full suite**

Run: `npx vitest run server/src/modules/admin/test.js server/src/http/errorHandler/errorHandler.test.js` → PASS. `npm test` → 222 passed.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/admin server/src/http/errorHandler
git commit -m "feat(admin): F12 alert feed — audit-row sources + derived awaiting-prescription + unhandled-exception bridge"
```

---

### Task 18: A-03 Alert feed view

**Files:**
- Create: `client/src/modules/admin/views/AdminAlerts/AdminAlerts.jsx`
- Test: `client/src/modules/admin/views/AdminAlerts/AdminAlerts.test.jsx`
- Modify: `client/src/modules/admin/useAdmin.js`
- Modify: `client/src/modules/admin/admin.routes.jsx`

- [ ] **Step 1: Write the failing test** (`client/src/modules/admin/views/AdminAlerts/AdminAlerts.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '../../../../lib/apiClient/apiClient.js';
import { AdminAlerts } from './AdminAlerts.jsx';

const ALERTS = {
  data: [
    {
      id: 'e1', kind: 'email.send_failed_final', at: '2099-01-10T11:00:00Z', targetRef: 'a1',
      reason: 'prescription_ready: boom',
      failedJobs: [{ id: 'n9', appointmentId: 'a1', type: 'prescription_ready', status: 'failed' }],
    },
    { id: 'awaiting_a3', kind: 'awaiting_prescription', at: '2099-01-09T18:00:00Z', targetRef: 'a3', reason: 'No prescription 12h after the consultation with Dr A.' },
    { id: 'e2', kind: 'payment.refund_exhausted', at: '2099-01-09T10:00:00Z', targetRef: 'a2', reason: 'gateway 500' },
  ],
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminAlerts />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(ALERTS);
});

describe('AdminAlerts (A-03)', () => {
  it('renders alert cards with kind badges and record links', async () => {
    renderView();
    expect(await screen.findByText('gateway 500')).toBeTruthy();
    expect(screen.getByText('Awaiting prescription')).toBeTruthy();
    const links = screen.getAllByRole('link', { name: 'View record' });
    expect(links[0].getAttribute('href')).toBe('/admin/records/a1');
  });

  it('resend appears only on email-failure alerts and POSTs the failed job (F12.02)', async () => {
    api.post.mockResolvedValue({ id: 'n9', status: 'pending' });
    renderView();
    await screen.findByText('gateway 500');
    const resend = screen.getAllByRole('button', { name: /Resend prescription_ready/ });
    expect(resend).toHaveLength(1);
    fireEvent.click(resend[0]);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/emails/n9/resend'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --workspace client test -- run src/modules/admin/views/AdminAlerts`
Expected: FAIL — cannot resolve `./AdminAlerts.jsx`.

- [ ] **Step 3: Hook addition.** In `client/src/modules/admin/useAdmin.js`, extend opts with `alerts: alertsEnabled = false` and add (the `resendEmail` mutation from Task 16 already invalidates records; extend its `onSuccess` to also invalidate alerts):

```js
  const alerts = useQuery({
    queryKey: ['admin-alerts'],
    queryFn: () => api.get('/admin/alerts'),
    enabled: alertsEnabled,
  });
```

change `invalidateRecord` to:

```js
  const invalidateRecord = () => {
    qc.invalidateQueries({ queryKey: ['admin-record'] });
    qc.invalidateQueries({ queryKey: ['admin-records'] });
    qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  };
```

and add `alerts` to the returned object.

- [ ] **Step 4: The view** (`client/src/modules/admin/views/AdminAlerts/AdminAlerts.jsx`):

```jsx
// @ts-check
import { Link } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

const KIND_LABEL = {
  'payment.reconciliation_mismatch': { label: 'Payment mismatch', variant: 'danger' },
  'payment.refund_exhausted': { label: 'Refund failed', variant: 'danger' },
  'email.send_failed_final': { label: 'Email failed', variant: 'warning' },
  'system.unhandled_exception': { label: 'Exception', variant: 'danger' },
  awaiting_prescription: { label: 'Awaiting prescription', variant: 'warning' },
};

const karachi = (iso) =>
  new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });

export function AdminAlerts() {
  const { alerts, resendEmail } = useAdmin({ alerts: true });
  const rows = alerts.data?.data ?? [];

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>System health</h1>
      <div className="section-card">
        {alerts.isLoading && <p>Loading…</p>}
        {alerts.error && <Alert variant="danger">{alerts.error.message}</Alert>}
        {resendEmail.error && <Alert variant="danger">{resendEmail.error.message}</Alert>}
        {!alerts.isLoading && rows.length === 0 && <p className="empty">No alerts — all clear.</p>}
        {rows.map((a) => {
          const kind = KIND_LABEL[a.kind] ?? { label: a.kind, variant: 'info' };
          return (
            <div key={a.id} className="section-card" style={{ marginBottom: 'var(--sp-3)' }}>
              <p>
                <span className={`badge badge--${kind.variant}`}>{kind.label}</span>{' '}
                <span className="help">{karachi(a.at)}</span>
              </p>
              <p>{a.reason ?? '—'}</p>
              <p>
                {a.targetRef && <Link to={`/admin/records/${a.targetRef}`}>View record</Link>}
                {(a.failedJobs ?? []).map((j) => (
                  <Button
                    key={j.id}
                    variant="secondary"
                    isLoading={resendEmail.isPending}
                    onClick={() => resendEmail.mutate({ jobId: j.id })}
                    style={{ marginLeft: 'var(--sp-2)' }}
                  >
                    Resend {j.type}
                  </Button>
                ))}
              </p>
            </div>
          );
        })}
      </div>
    </SidebarLayout>
  );
}
```

- [ ] **Step 5: Route + link.** In `client/src/modules/admin/admin.routes.jsx`: import `AdminAlerts`, add `{ to: '/admin/alerts', label: 'System health' }` to `ADMIN_LINKS`, and add:

```jsx
  { path: '/admin/alerts', element: guard(session, <AdminAlerts />) },
```

- [ ] **Step 6: Run the client suite**

Run: `npm --workspace client test`
Expected: 78 passed (76 + 2), no regressions.

- [ ] **Step 7: Commit**

```bash
git add client/src/modules/admin
git commit -m "feat(client): A-03 alert feed — five sources, record links, per-job email resend (F12)"
```

---

### Task 19: F14 settings — service + routes

**Files:**
- Modify: `server/src/modules/admin/service.js`
- Modify: `server/src/modules/admin/test.js`
- Modify: `server/src/modules/admin/controller.js`
- Modify: `server/src/modules/admin/index.js`

(`settingsUpdateSchema` already exists from Task 12.)

- [ ] **Step 1: Write the failing tests.** Append to `server/src/modules/admin/test.js` (extend the service import with `getSettings, updateSettings`):

```js
describe('admin settings (F14)', () => {
  it('getSettings reads the singleton row', async () => {
    prisma.settings.findUnique.mockResolvedValue({ id: 1, minBookingLeadMinutes: 60 });
    const out = await getSettings();
    expect(prisma.settings.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(out.minBookingLeadMinutes).toBe(60);
  });

  it('updateSettings writes the three tunables and audits before→after (F14.03)', async () => {
    prisma.settings.findUnique.mockResolvedValue({
      id: 1, minBookingLeadMinutes: 60, fallbackFeePctBps: 0, fallbackFeeFixed: 0,
    });
    prisma.settings.update.mockResolvedValue({
      id: 1, minBookingLeadMinutes: 30, fallbackFeePctBps: 250, fallbackFeeFixed: 0,
    });
    const data = { minBookingLeadMinutes: 30, fallbackFeePctBps: 250, fallbackFeeFixed: 0 };
    await updateSettings({ data, actorId: 'admin1' });
    expect(prisma.settings.update).toHaveBeenCalledWith({ where: { id: 1 }, data });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'settings.updated',
        actorType: 'admin',
        actorId: 'admin1',
        meta: {
          before: { minBookingLeadMinutes: 60, fallbackFeePctBps: 0, fallbackFeeFixed: 0 },
          after: { minBookingLeadMinutes: 30, fallbackFeePctBps: 250, fallbackFeeFixed: 0 },
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/admin/test.js`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 3: Implement.** Append to `server/src/modules/admin/service.js`:

```js
const settingsShape = (s) => ({
  minBookingLeadMinutes: s.minBookingLeadMinutes,
  fallbackFeePctBps: s.fallbackFeePctBps,
  fallbackFeeFixed: s.fallbackFeeFixed,
});

/** F14: single seeded row (id=1). Booking + refund code reads it live — no cache to bust. */
export async function getSettings() {
  return prisma.settings.findUnique({ where: { id: 1 } });
}

/** F14.03: every change is an admin-actor audit entry with the before→after diff. */
export async function updateSettings({ data, actorId }) {
  const before = await prisma.settings.findUnique({ where: { id: 1 } });
  const updated = await prisma.settings.update({ where: { id: 1 }, data });
  await audit.record({
    eventType: 'settings.updated',
    actorType: 'admin',
    actorId,
    meta: { before: settingsShape(before), after: settingsShape(updated) },
  });
  return updated;
}
```

- [ ] **Step 4: Controller + routes.** Append to `server/src/modules/admin/controller.js`:

```js
export async function getSettings(_req, res, next) {
  try {
    res.json(await adminService.getSettings());
  } catch (e) {
    next(e);
  }
}

export async function putSettings(req, res, next) {
  try {
    res.json(await adminService.updateSettings({ data: req.body, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}
```

In `server/src/modules/admin/index.js`: add `settingsUpdateSchema` to the shared-schemas import, `import { validate } from '../../middleware/validate/validate.js';`, and the routes:

```js
// GET/PUT /api/admin/settings  (A-05, F14; lead-time floor 30 enforced by the DTO)
adminRouter.get('/settings', requireRole('admin'), c.getSettings);
adminRouter.put('/settings', requireRole('admin'), adminWriteLimiter, validate(settingsUpdateSchema), c.putSettings);
```

- [ ] **Step 5: Run tests + full suite**

Run: `npx vitest run server/src/modules/admin/test.js` → PASS. `npm test` → 224 passed.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/admin
git commit -m "feat(admin): F14 settings — bounded PUT over the singleton row, before/after audit"
```

---

### Task 20: A-05 Settings view

**Files:**
- Create: `client/src/modules/admin/views/AdminSettings/AdminSettings.jsx`
- Test: `client/src/modules/admin/views/AdminSettings/AdminSettings.test.jsx`
- Modify: `client/src/modules/admin/useAdmin.js`
- Modify: `client/src/modules/admin/admin.routes.jsx`

- [ ] **Step 1: Write the failing test** (`client/src/modules/admin/views/AdminSettings/AdminSettings.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '../../../../lib/apiClient/apiClient.js';
import { AdminSettings } from './AdminSettings.jsx';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ id: 1, minBookingLeadMinutes: 60, fallbackFeePctBps: 250, fallbackFeeFixed: 5000 });
});

describe('AdminSettings (A-05)', () => {
  it('pre-fills current values (fee fixed shown in PKR)', async () => {
    renderView();
    expect(await screen.findByLabelText('Minimum booking lead time (minutes)')).toHaveProperty('value', '60');
    expect(screen.getByLabelText('Fallback fee — percentage (basis points)')).toHaveProperty('value', '250');
    expect(screen.getByLabelText('Fallback fee — fixed (PKR)')).toHaveProperty('value', '50');
  });

  it('save confirms, then PUTs the bounded payload with paisa conversion', async () => {
    api.put.mockResolvedValue({ id: 1 });
    renderView();
    const lead = await screen.findByLabelText('Minimum booking lead time (minutes)');
    fireEvent.change(lead, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(api.put).not.toHaveBeenCalled(); // confirm gate first — these values steer money math
    fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin/settings', {
        minBookingLeadMinutes: 30,
        fallbackFeePctBps: 250,
        fallbackFeeFixed: 5000,
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --workspace client test -- run src/modules/admin/views/AdminSettings`
Expected: FAIL — cannot resolve `./AdminSettings.jsx`.

- [ ] **Step 3: Hook addition.** In `client/src/modules/admin/useAdmin.js`, extend opts with `settings: settingsEnabled = false` and add:

```js
  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/admin/settings'),
    enabled: settingsEnabled,
  });

  const saveSettings = useMutation({
    mutationFn: (body) => api.put('/admin/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
  });
```

and add `settings, saveSettings` to the returned object.

- [ ] **Step 4: The view** (`client/src/modules/admin/views/AdminSettings/AdminSettings.jsx`):

```jsx
// @ts-check
import { useEffect, useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

export function AdminSettings() {
  const { settings, saveSettings } = useAdmin({ settings: true });
  const [form, setForm] = useState(null); // null until the query hydrates
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (settings.data && !form) {
      setForm({
        minBookingLeadMinutes: String(settings.data.minBookingLeadMinutes),
        fallbackFeePctBps: String(settings.data.fallbackFeePctBps),
        fallbackFeeFixed: String(settings.data.fallbackFeeFixed / 100), // paisa → PKR for display
      });
    }
  }, [settings.data, form]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = () =>
    saveSettings.mutate(
      {
        minBookingLeadMinutes: parseInt(form.minBookingLeadMinutes, 10),
        fallbackFeePctBps: parseInt(form.fallbackFeePctBps, 10),
        fallbackFeeFixed: Math.round(parseFloat(form.fallbackFeeFixed) * 100),
      },
      { onSuccess: () => setConfirming(false) },
    );

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Platform settings</h1>
      <div className="section-card">
        {settings.isLoading && <p>Loading…</p>}
        {settings.error && <Alert variant="danger">{settings.error.message}</Alert>}
        {saveSettings.error && <Alert variant="danger">{saveSettings.error.message}</Alert>}
        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirming(true);
            }}
          >
            <Field
              label="Minimum booking lead time (minutes)"
              id="s-lead"
              type="number"
              min="30"
              max="1440"
              value={form.minBookingLeadMinutes}
              onChange={set('minBookingLeadMinutes')}
              help="Applies to future booking attempts only; existing appointments are unaffected."
              required
            />
            <Field
              label="Fallback fee — percentage (basis points)"
              id="s-pct"
              type="number"
              min="0"
              max="10000"
              value={form.fallbackFeePctBps}
              onChange={set('fallbackFeePctBps')}
              help="Used only when the gateway does not report a per-transaction fee; a reported fee always wins."
              required
            />
            <Field
              label="Fallback fee — fixed (PKR)"
              id="s-fixed"
              type="number"
              min="0"
              step="0.01"
              value={form.fallbackFeeFixed}
              onChange={set('fallbackFeeFixed')}
              required
            />
            <Button type="submit">Save settings</Button>
          </form>
        )}
      </div>

      {confirming && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__body">
              <p>
                Save these values? The lead time changes which slots patients can book from the next
                request, and the fallback fee model feeds refund amounts.
              </p>
            </div>
            <div className="modal__actions">
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button isLoading={saveSettings.isPending} onClick={save}>Confirm save</Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
```

(If the real `Field` component does not render a `help` prop, move those two sentences into `<p className="help">` lines below the fields — check `client/src/shared/Field/Field.jsx` first; the Slice A implementation does support `help`.)

- [ ] **Step 5: Route + link.** In `client/src/modules/admin/admin.routes.jsx`: import `AdminSettings`, add `{ to: '/admin/settings', label: 'Settings' }` to `ADMIN_LINKS` (last), and add:

```jsx
  { path: '/admin/settings', element: guard(session, <AdminSettings />) },
```

- [ ] **Step 6: Run the client suite**

Run: `npm --workspace client test`
Expected: 80 passed (78 + 2), no regressions.

- [ ] **Step 7: Commit**

```bash
git add client/src/modules/admin
git commit -m "feat(client): A-05 platform settings — bounded form with money-math confirm gate (F14)"
```

---

### Task 21: Integration test — full admin journey (real DB)

**Files:**
- Create: `server/src/test/admin.integration.test.js`

- [ ] **Step 1: Write the test** (follows the house pattern of `server/src/test/*.integration.test.js`: env pinning, dynamic imports, `request.agent`):

```js
import { describe, it, expect, beforeAll } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const request = (await import('supertest')).default;
const { createApp } = await import('../index.js');
const { prisma } = await import('../lib/prisma/prisma.js');
const { hashPassword } = await import('../lib/password/password.js');

const app = createApp();
const uniq = (tag) => `sliceg_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

describe('admin journey — onboard → DA3 → immutability → deactivate (#9) → settings → records/alerts/resend', () => {
  let adminAgent;
  let adminEmail, doctorEmail, doctorId, doctorUserId;

  beforeAll(async () => {
    // Dedicated admin (bootstrap-admin pattern; never mutate seeded rows).
    adminEmail = `${uniq('admin')}@test.local`;
    await prisma.user.create({
      data: {
        role: 'admin',
        email: adminEmail,
        fullName: 'Test Admin',
        passwordHash: await hashPassword('AdminPass123'),
      },
    });
    adminAgent = request.agent(app);
    await adminAgent
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'AdminPass123' })
      .expect(200);
  });

  it('onboards a doctor: pending+inactive, hidden from public listing, audit row written', async () => {
    doctorEmail = `${uniq('doc')}@test.local`;
    const res = await adminAgent.post('/api/doctors').send({
      fullName: 'Dr Slice G',
      email: doctorEmail,
      phone: '03009998877',
      pmcNumber: uniq('PMC'),
      specialization: 'Acne',
      fee: 250000,
      bio: 'Integration-test doctor.',
      initialPassword: 'InitPass123',
      blocks: [{ weekday: 1, startTime: '18:00', endTime: '21:00' }],
    });
    expect(res.status).toBe(201);
    doctorId = res.body.id;
    doctorUserId = res.body.userId;
    expect(res.body.status).toBe('pending');
    expect(res.body.isActive).toBe(false);

    const pub = await request(app).get('/api/doctors?page=1&pageSize=50');
    expect(pub.body.data.find((d) => d.id === doctorId)).toBeUndefined();

    const auditRow = await prisma.auditLog.findFirst({
      where: { eventType: 'doctor.created', targetRef: doctorId },
    });
    expect(auditRow).not.toBeNull();
  });

  it('closes the DA1→DA3 loop: the new doctor must change the password before the panel', async () => {
    const docAgent = request.agent(app);
    const login = await docAgent
      .post('/api/auth/login')
      .send({ email: doctorEmail, password: 'InitPass123' })
      .expect(200);
    expect(login.body.mustChangePassword).toBe(true);

    // The DA3 gate blocks protected routes until the change…
    const blocked = await docAgent.get('/api/appointments');
    expect(blocked.status).toBe(403);

    await docAgent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'InitPass123', newPassword: 'OwnPass123' })
      .expect(200);
    await docAgent.get('/api/appointments').expect(200);
  });

  it('admin list includes the pending doctor; PATCH of pmcNumber → 409 IMMUTABLE_FIELD (#8)', async () => {
    const list = await adminAgent.get('/api/doctors?includeInactive=true').expect(200);
    expect(list.body.data.find((d) => d.id === doctorId)).toBeTruthy();

    const patch = await adminAgent.patch(`/api/doctors/${doctorId}`).send({ pmcNumber: 'PMC-HACK' });
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe('IMMUTABLE_FIELD');

    await adminAgent.patch(`/api/doctors/${doctorId}`).send({ fee: 300000 }).expect(200);
  });

  it('reactivate publishes; deactivate hides but PRESERVES a confirmed appointment (#9)', async () => {
    await adminAgent.post(`/api/doctors/${doctorId}/reactivate`).expect(200);
    let pub = await request(app).get('/api/doctors?page=1&pageSize=50');
    expect(pub.body.data.find((d) => d.id === doctorId)).toBeTruthy();

    // A real confirmed future appointment under this doctor.
    const patientEmail = `${uniq('pat')}@test.local`;
    const patient = await prisma.user.create({
      data: {
        role: 'patient',
        email: patientEmail,
        fullName: 'G Patient',
        phone: '03001112222',
        passwordHash: await hashPassword('PatPass123'),
        tosAcceptedAt: new Date(),
      },
    });
    const appt = await prisma.appointment.create({
      data: {
        doctorId,
        patientUserId: patient.id,
        slotStart: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        slotEnd: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 30 * 60 * 1000),
        state: 'confirmed',
        feeAtBooking: 250000,
      },
    });

    const deact = await adminAgent.post(`/api/doctors/${doctorId}/deactivate`).expect(200);
    expect(deact.body.isActive).toBe(false);

    pub = await request(app).get('/api/doctors?page=1&pageSize=50');
    expect(pub.body.data.find((d) => d.id === doctorId)).toBeUndefined();
    const kept = await prisma.appointment.findUnique({ where: { id: appt.id } });
    expect(kept.state).toBe('confirmed'); // no cancellation cascade

    // The count surfaces in the admin list for the warning modal.
    const list = await adminAgent.get('/api/doctors?includeInactive=true');
    expect(list.body.data.find((d) => d.id === doctorId).upcomingConfirmedCount).toBe(1);
  });

  it('DA5 reset re-arms mustChangePassword', async () => {
    await adminAgent
      .post(`/api/doctors/${doctorId}/reset-password`)
      .send({ newPassword: 'ResetPass123' })
      .expect(200);
    const user = await prisma.user.findUnique({ where: { id: doctorUserId } });
    expect(user.mustChangePassword).toBe(true);
  });

  it('settings PUT takes effect and floor-validates (F14)', async () => {
    const before = await adminAgent.get('/api/admin/settings').expect(200);
    const tooLow = await adminAgent.put('/api/admin/settings').send({
      minBookingLeadMinutes: 15,
      fallbackFeePctBps: 0,
      fallbackFeeFixed: 0,
    });
    expect(tooLow.status).toBe(400); // floor 30

    await adminAgent
      .put('/api/admin/settings')
      .send({ minBookingLeadMinutes: 45, fallbackFeePctBps: 250, fallbackFeeFixed: 0 })
      .expect(200);
    const after = await adminAgent.get('/api/admin/settings').expect(200);
    expect(after.body.minBookingLeadMinutes).toBe(45);

    // restore to keep other suites' lead-time assumptions intact
    await adminAgent.put('/api/admin/settings').send({
      minBookingLeadMinutes: before.body.minBookingLeadMinutes,
      fallbackFeePctBps: before.body.fallbackFeePctBps,
      fallbackFeeFixed: before.body.fallbackFeeFixed,
    });
  });

  it('records + audit + alerts + email resend round-trip (F13/F12)', async () => {
    const records = await adminAgent.get('/api/admin/records?doctorName=Slice%20G');
    expect(records.status).toBe(200);
    expect(records.body.data.length).toBeGreaterThanOrEqual(1);
    const apptId = records.body.data[0].id;

    // dispute toggle is audit-logged and surfaces in the detail
    await adminAgent.post(`/api/appointments/${apptId}/dispute`).send({ disputed: true }).expect(200);
    const detail = await adminAgent.get(`/api/admin/records/${apptId}`).expect(200);
    expect(detail.body.appointment.disputed).toBe(true);
    expect(detail.body.history.some((h) => h.eventType === 'appointment.disputed')).toBe(true);

    const auditRes = await adminAgent
      .get(`/api/admin/audit?appointmentId=${apptId}&eventType=appointment.disputed`)
      .expect(200);
    expect(auditRes.body.data).toHaveLength(1);

    // a forced-failed email job → appears via alerts enrichment → resend resets it
    const job = await prisma.notificationJob.create({
      data: {
        type: 'booking_confirmation',
        appointmentId: apptId,
        recipientEmail: 'p@t.test',
        scheduledFor: new Date(),
        status: 'failed',
        attempts: 5,
        lastError: 'forced for test',
      },
    });
    await prisma.auditLog.create({
      data: {
        eventType: 'email.send_failed_final',
        actorType: 'system',
        targetRef: apptId,
        reason: 'booking_confirmation: forced for test',
      },
    });
    const alerts = await adminAgent.get('/api/admin/alerts').expect(200);
    const emailAlert = alerts.body.data.find(
      (a) => a.kind === 'email.send_failed_final' && a.targetRef === apptId,
    );
    expect(emailAlert.failedJobs.map((j) => j.id)).toContain(job.id);

    await adminAgent.post(`/api/admin/emails/${job.id}/resend`).expect(200);
    const reset = await prisma.notificationJob.findUnique({ where: { id: job.id } });
    expect(reset.status).toBe('pending');
    expect(reset.attempts).toBe(0);

    const second = await adminAgent.post(`/api/admin/emails/${job.id}/resend`);
    expect(second.status).toBe(409); // no longer failed
  });

  it('every admin route 403s for a non-admin (DA6)', async () => {
    const stranger = request.agent(app);
    await stranger.post('/api/auth/signup').send({
      fullName: 'Nosy P',
      email: `${uniq('nosy')}@test.local`,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    await stranger.get('/api/admin/records').expect(403);
    await stranger.get('/api/admin/alerts').expect(403);
    await stranger.get('/api/admin/settings').expect(403);
    await stranger.post('/api/doctors').send({}).expect(403);
    await stranger.get('/api/doctors?includeInactive=true').expect(403);
  });
});
```

**Adapt-on-contact notes (verify against the real code before changing the test):** the DA3 gate's blocked-status (403 vs other) is defined in `server/src/middleware/mustChangePassword/mustChangePassword.js`, and the change-password route path is in `server/src/modules/auth/index.js` — pin the test to whatever those actually are.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/src/test/admin.integration.test.js`
Expected: PASS (8 tests). Failures here are real wiring bugs from Tasks 1–19 — fix the production code, not the assertions, unless an assumption marked "adapt-on-contact" was wrong.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: 232 passed.

- [ ] **Step 4: Commit**

```bash
git add server/src/test/admin.integration.test.js
git commit -m "test(admin): integration — onboard→DA3 loop, immutability, #9 non-cascade, settings, records/alerts/resend, DA6 gates"
```

---

### Task 22: Uploads volume, build verification, canon-sweep handoff

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add the uploads volume.** In `docker-compose.yml`, on the `app` service add:

```yaml
    volumes: ['dermestha_uploads:/app/uploads']
```

and extend the top-level volumes block:

```yaml
volumes:
  dermestha_pg:
  dermestha_uploads:
```

(The app's default `UPLOADS_DIR=./uploads` resolves to `/app/uploads` in the container — same mechanism that already keeps Postgres data alive across rebuilds.)

- [ ] **Step 2: Full verification**

Run: `npm test` → 232 passed.
Run: `npm --workspace client test` → 80 passed.
Run: `npm run build:client` → clean build, no new warnings.
Run: `npx prisma migrate status` → "Database schema is up to date!" (this slice added no migration).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "infra: dermestha_uploads volume — doctor photos survive container rebuilds (Slice G)"
```

- [ ] **Step 4: Canon-doc sweep — STOP and ask the user.** Per CLAUDE.md, list the proposed spec edits (design §8: docs 02, 05, 08, 10, 11, 12, 13, 15 — `includeInactive` params, admin availability route, dispute body, `:jobId` naming, new error codes, photo controls, uploads volume + `UPLOADS_DIR`, new ADR for photo storage + exception bridge, F10–F14 test cases, status sweep) and WAIT for explicit approval before touching any `docs/specification/` file.

- [ ] **Step 5: Finish the branch.** Use superpowers:finishing-a-development-branch (merge vs PR decision is the user's; `git push` requires explicit user approval per CLAUDE.md).

---

## Plan self-review notes (resolved during writing)

- `PaymentStatus` is `pending|success|failed` — Task 13 maps money columns from the `success` row; do not "fix" it to `paid`.
- Expected test counts are directional (exact baseline re-verified at execution start): 202 server / 59 client at merge of Slice F; this plan adds ~30 server + ~21 client.
- `:eventId` in doc 05 is implemented as `:jobId` (the notification-job id) — recorded for the canon sweep, not silently changed in the spec.
- The A-01 edit form intentionally starts with an empty availability editor and only PUTs when rows were entered (guard in Task 11) — an untouched editor must never wipe a doctor's live schedule.


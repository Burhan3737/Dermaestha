# Doctor appointments — time-based Upcoming/Past Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the doctor appointment view the patient's time-based Upcoming/Past split, so an appointment that has already ended moves to Past (read-only) instead of lingering under "Today" as cancellable.

**Architecture:** Server-side, `listForRole` stops branching the doctor onto a Karachi calendar-day window and reuses the patient's shared `upcomingWhere`/`pastWhere` fragments (role separation stays via the `doctorId` ownership filter + patient-name `include`). Client-side, `DoctorToday` drops its calendar-day filter, relabels the tabs Today/History → Upcoming/Past, shows full date+time (multi-day), and renders `pending` rows as inert (badge + note, no actions).

**Tech Stack:** Node/Express + Prisma (server), React + React Router + TanStack Query (client), Vitest + Testing Library (tests). ESM throughout.

## Global Constraints

- Upcoming rule (both roles): `pending` OR (`confirmed` AND `slotEnd ≥ now`); sort `slotStart` asc.
- Past rule (both roles): (`confirmed` AND `slotEnd < now`) OR `cancelled`; sort `slotStart` desc.
- Role separation: doctor query keeps `where.doctorId` + patient-name `include`; patient query keeps `where.patientUserId` + doctor `include`. No cross-role change.
- Join Call window is unchanged: active from slot-start − 10 min through slot-end + 5 min (doc 02 F05.03, doc 15 §3.4). Only `confirmed` rows get Join/Write-prescription/Cancel.
- `pending` rows in the doctor view are inert: amber "Payment pending" badge + "Awaiting payment confirmation" note; no Join, no Write-prescription, no Cancel.
- Tabs relabel only; routes stay `/doctor` and `/doctor/history`. Sidebar item stays "Appointments" → `/doctor`.
- **Commits are gated:** per project CLAUDE.md + user instruction, do NOT commit. Implement both tasks, leave the tree green, and hand off for the user's review; commit only after explicit approval. The `git commit` steps below are written for reference but are HELD until that approval.

---

### Task 1: Server — unify the doctor `listForRole` onto the time-based split

**Files:**
- Modify: `server/src/modules/appointment/service.js:65-84` (doctor branch of `listForRole`)
- Test: `server/test/unit/modules/appointment/service.test.js:117-138` (rewrite the doctor describe block)

**Interfaces:**
- Consumes: existing module-level `upcomingWhere(now)` / `pastWhere(now)` (`service.js:20-25`), unchanged.
- Produces: `listForRole({ role: 'doctor', userId, scope })` — for `scope` omitted/`'active'` returns rows matching `upcomingWhere(now)` filtered by `doctorId`, sorted `slotStart` asc; for `scope: 'history'` returns `pastWhere(now)` filtered by `doctorId`, sorted `slotStart` desc. Row shape is unchanged (`id, slotStart, slotEnd, state, forSelf, subjectName, patientName, hasPrescription`).

- [ ] **Step 1: Rewrite the doctor test block to assert the time-based split**

Replace the entire `describe('appointment.listForRole (doctor)', ...)` block (`service.test.js:117-138`) with:

```js
describe('appointment.listForRole (doctor)', () => {
  it('default (upcoming) scope = pending OR confirmed-not-yet-ended, filtered by doctorId, asc', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a1',
        slotStart: new Date('2099-01-04T13:00:00Z'),
        slotEnd: new Date('2099-01-04T13:30:00Z'),
        state: 'confirmed',
        forSelf: false,
        subjectName: 'Child',
        patient: { fullName: 'Parent P' },
        _count: { prescriptions: 0 },
      },
    ]);
    const rows = await listForRole({ role: 'doctor', userId: 'docUser' });
    expect(rows[0].patientName).toBe('Parent P');
    const arg = prisma.appointment.findMany.mock.calls[0][0];
    expect(arg.where.doctorId).toBe('d1');
    expect(arg.where.OR[0]).toEqual({ state: 'pending' });
    expect(arg.where.OR[1].state).toBe('confirmed');
    expect(arg.where.OR[1].slotEnd.gte).toBeInstanceOf(Date);
    expect(arg.where.slotStart).toBeUndefined(); // no calendar-day window any more
    expect(arg.orderBy).toEqual({ slotStart: 'asc' });
  });

  it('a confirmed appointment that already ended is NOT in the default scope (it belongs to Past)', async () => {
    // Regression for the reported bug: the default doctor scope must be the time-based upcoming
    // filter, so an ended-today confirmed row is excluded by slotEnd >= now (asserted on the where).
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.appointment.findMany.mockResolvedValue([]);
    await listForRole({ role: 'doctor', userId: 'docUser' });
    const arg = prisma.appointment.findMany.mock.calls[0][0];
    const cutoff = arg.where.OR[1].slotEnd.gte.getTime();
    expect(cutoff).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - cutoff).toBeLessThan(5000); // "now" captured at call time
  });

  it('history scope = confirmed-and-ended OR cancelled, filtered by doctorId, desc', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.appointment.findMany.mockResolvedValue([]);
    await listForRole({ role: 'doctor', userId: 'docUser', scope: 'history' });
    const arg = prisma.appointment.findMany.mock.calls[0][0];
    expect(arg.where.doctorId).toBe('d1');
    expect(arg.where.OR[0].state).toBe('confirmed');
    expect(arg.where.OR[0].slotEnd.lt).toBeInstanceOf(Date);
    expect(arg.where.OR[1]).toEqual({ state: 'cancelled' });
    expect(arg.orderBy).toEqual({ slotStart: 'desc' });
  });

  it('returns [] when the user is not a doctor', async () => {
    prisma.doctor.findUnique.mockResolvedValue(null);
    const rows = await listForRole({ role: 'doctor', userId: 'nope' });
    expect(rows).toEqual([]);
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the doctor block, verify it fails**

Run: `npm run test --workspace server -- appointment/service.test.js -t "listForRole (doctor)"`
Expected: FAIL — current code sets `where.slotStart` (day window) and `where.state === 'confirmed'`, so the `OR`/`slotStart undefined` assertions fail.

- [ ] **Step 3: Implement the time-based doctor branch**

In `server/src/modules/appointment/service.js`, replace the doctor branch (the block from the `const doctor = ...` line through the `const where = ... ` ternary, currently `:65-79`) so both scopes reuse the shared fragments. The new body of `listForRole` after the patient block becomes:

```js
  const doctor = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
  if (!doctor) return [];
  // F05.02: the doctor view is the same time-based Upcoming/Past split as the patient (ADR — new).
  // Upcoming = pending OR confirmed-not-yet-ended; Past = confirmed-and-ended OR cancelled.
  const stateWhere = scope === 'history' ? pastWhere(now) : upcomingWhere(now);
  const rows = await prisma.appointment.findMany({
    where: { doctorId: doctor.id, ...stateWhere },
    orderBy: { slotStart: scope === 'history' ? 'desc' : 'asc' },
    include: { patient: { select: { fullName: true } }, _count: { select: { prescriptions: true } } },
  });
```

Leave the `rows.map(...)` return shape untouched. Delete the now-unused `todayYMD` / `dayStart` / `dayEnd` lines and the `where` ternary. Do NOT remove the `formatInTimeZone` / `KARACHI` / `karachiWallTimeToUtc` imports — `lockSlot` still uses them.

- [ ] **Step 4: Run the doctor block, verify it passes**

Run: `npm run test --workspace server -- appointment/service.test.js -t "listForRole (doctor)"`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole appointment suite for no regression**

Run: `npm run test --workspace server -- appointment/service.test.js`
Expected: PASS (patient block + all other blocks unchanged).

- [ ] **Step 6: Commit (HELD — see Global Constraints; do not run until user approves)**

```bash
git add server/src/modules/appointment/service.js server/test/unit/modules/appointment/service.test.js
git commit -m "fix(appointment): doctor view uses time-based Upcoming/Past split"
```

---

### Task 2: Client — `DoctorToday` Upcoming/Past tabs, multi-day dates, inert pending rows

**Files:**
- Modify: `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx`
- Test: `client/test/unit/modules/doctor/views/DoctorToday/DoctorToday.test.jsx`

**Interfaces:**
- Consumes: `useDoctor({ appointmentsScope })` (unchanged — still requests `/appointments` or `/appointments?scope=history`), `formatKarachi` (`lib/format/format.js`), `stateLabel`/`stateBadge`.
- Produces: a view whose tabs read "Upcoming"/"Past" (links `/doctor` and `/doctor/history`), renders every server row (no client filtering), shows `formatKarachi(slotStart)` on each row, and renders `pending` rows with a badge + "Awaiting payment confirmation" note and no action buttons.

- [ ] **Step 1: Update the tabs/heading test + add the pending-row test**

In `DoctorToday.test.jsx`, replace the first test (`renders Today/History in-page tabs ...`, `:41-51`) with:

```js
  it('renders Upcoming/Past in-page tabs as route links, marking the active one', async () => {
    api.get.mockResolvedValue({ data: [] });
    setup('/doctor');
    await waitFor(() => expect(screen.getByRole('heading', { name: /upcoming/i })).toBeTruthy());
    const upcomingTab = screen.getByRole('link', { name: /^upcoming$/i });
    const pastTab = screen.getByRole('link', { name: /^past$/i });
    expect(upcomingTab.getAttribute('href')).toBe('/doctor');
    expect(pastTab.getAttribute('href')).toBe('/doctor/history');
    expect(upcomingTab.className).toContain('tab--active');
    expect(pastTab.className).not.toContain('tab--active');
  });

  it('renders a pending row as inert: badge + note, no Join/Cancel', async () => {
    const soon = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    api.get.mockResolvedValue({
      data: [
        {
          id: 'p1',
          slotStart: soon,
          slotEnd: new Date(Date.now() + 3 * 3600 * 1000 + 18e5).toISOString(),
          state: 'pending',
          forSelf: true,
          subjectName: null,
          patientName: 'Pending P',
        },
      ],
    });
    setup('/doctor');
    await waitFor(() => expect(screen.getByText('Pending P')).toBeTruthy());
    expect(screen.getByText('Payment pending')).toBeTruthy();
    expect(screen.getByText(/awaiting payment confirmation/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /join call/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
  });
```

Also update the second test's title/assertion (`lists today appointments ...`, `:53`) — rename to `lists upcoming appointments with the patient name` (body unchanged; a confirmed future row still renders the patient name). The `/doctor/history` test (`:126-148`) stays valid; its `getByRole('link', { name: /^history$/i })` must change to `/^past$/i`.

- [ ] **Step 2: Run the DoctorToday suite, verify the new/updated tests fail**

Run: `npm run test --workspace client -- DoctorToday.test.jsx`
Expected: FAIL — current view renders "Today"/"History" labels and has no pending branch.

- [ ] **Step 3: Remove the client-side day filter**

In `DoctorToday.jsx`, delete the `karachiDay` helper (`:11-12`) and change the rows line (`:25`) from the calendar-day filter to just the server rows:

```jsx
  const rows = list.data?.data ?? [];
```

Remove the now-unused `all`/`today` locals.

- [ ] **Step 4: Relabel tabs, heading, and empty state**

Replace the tabs + heading + empty-state block (`:30-42`) with Upcoming/Past copy:

```jsx
        <div className="tabs" role="tablist">
          <Link className={`tab${tab === 'today' ? ' tab--active' : ''}`} to="/doctor">
            Upcoming
          </Link>
          <Link className={`tab${tab === 'history' ? ' tab--active' : ''}`} to="/doctor/history">
            Past
          </Link>
        </div>
        <h1>{isHistory ? 'Past appointments' : 'Upcoming appointments'}</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && (
          <p className="help">{isHistory ? 'No past appointments.' : 'No upcoming appointments.'}</p>
        )}
```

(The `tab === 'today'`/`'history'` internal keys stay — they are derived from `pathname` and only the visible labels change.)

- [ ] **Step 5: Add the inert pending branch + show full date on every row**

Inside `rows.map((a) => { ... })`, add a `pending` short-circuit at the very top of the callback (before the `opensAt`/`closesAt` logic):

```jsx
            if (a.state === 'pending') {
              return (
                <div key={a.id} className="card appt-row">
                  <div className="appt-meta">
                    <div className="appt-head">
                      <div>
                        <p className="appt-name">{a.patientName}</p>
                        {!a.forSelf && <p className="appt-sub">for: {a.subjectName}</p>}
                        <p className="appt-sub tnum">{formatKarachi(a.slotStart)}</p>
                      </div>
                      <span className={`badge badge--${stateBadge(a.state)}`}>
                        {stateLabel(a.state)}
                      </span>
                    </div>
                    <div className="appt-actions">
                      <span className="help" style={{ margin: 0 }}>
                        Awaiting payment confirmation
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
```

Then, in the confirmed/other branch, make the date visible on all rows (Upcoming is now multi-day): remove the time-only column line (`{!isHistory && <div className="appt-time tnum">{formatKarachiTime(a.slotStart)}</div>}`) and change the history-only date sub-line so it always renders:

```jsx
                      <p className="appt-sub tnum">{formatKarachi(a.slotStart)}</p>
```

Remove the now-unused `formatKarachiTime` import (keep `formatKarachi`).

- [ ] **Step 6: Run the DoctorToday suite, verify it passes**

Run: `npm run test --workspace client -- DoctorToday.test.jsx`
Expected: PASS (tabs, upcoming list, pending-inert, cancel modal, join, history, awaiting-badge cases).

- [ ] **Step 7: Lint + full client suite for no regression**

Run: `npm run test --workspace client` then `npm run lint`
Expected: client suite PASS; lint introduces no new errors (pre-existing findings unchanged).

- [ ] **Step 8: Commit (HELD — see Global Constraints; do not run until user approves)**

```bash
git add client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx client/test/unit/modules/doctor/views/DoctorToday/DoctorToday.test.jsx
git commit -m "fix(doctor): Upcoming/Past appointment tabs with inert pending rows"
```

---

## Review-phase verification scenarios

Automated tests cover the `where`-fragment logic and the render branches. For the manual review pass (you'll look too), seed these via the `dermestha-db-test-data` skill against the local dev DB and check the doctor panel at `/doctor` and `/doctor/history`:

1. **Ended-today confirmed (the bug):** a `confirmed` appointment for doctor one earlier today whose `slotEnd` is already in the past → must appear under **Past** only, with **no Cancel button**; must NOT appear under Upcoming.
2. **Future confirmed:** a `confirmed` appointment later today or tomorrow → appears under **Upcoming**, shows the full date+time, Cancel + Write-prescription present, Join Call disabled until 10 min before start.
3. **Pending future:** a `pending` (unpaid) appointment for doctor one → appears under **Upcoming** with a "Payment pending" badge + "Awaiting payment confirmation" note and NO Join/Cancel/Write-prescription.
4. **Cancelled:** a `cancelled` appointment → appears under **Past** only, read-only.
5. **In-window confirmed:** a `confirmed` appointment starting within the next 10 minutes → Join Call is enabled under Upcoming.

## Spec doc-impact (tracked; applied only at end, after code committed + approval)

Per the design §6: doc 02 (F05.02 rewrite), doc 11 (new ADR superseding ADR-42's Today/History framing), doc 13 (D-02 line Today/History → Upcoming/Past), doc 06 (verify D-02 wording). Do not edit specs before the code is committed and approved.

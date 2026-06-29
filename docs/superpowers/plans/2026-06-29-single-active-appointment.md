# Single-Active-Appointment Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit a patient to one upcoming appointment (pending or confirmed) so a single account can hold at most one future slot, and let patients self-cancel a pending hold.

**Architecture:** Replace the existing No-Overlap check in `lockSlot` with a strictly-broader "single-active-appointment" guard (one service-layer query before insert). Re-light the already-orphaned `ACTIVE_LOCK_EXISTS` client wiring with corrected copy, and surface the existing `cancel()` flow on pending rows. No schema change.

**Tech Stack:** Node + Express + Prisma (server); React + TanStack Query + Vitest/RTL (client). JS + JSDoc (`@ts-check`).

## Global Constraints

- Single-active rule is keyed on `patientUserId` (spans subjects); states from `ACTIVE_APPOINTMENT_STATES = ['pending', 'confirmed']` (`server/src/config/constants.js`) — reuse, do not redefine.
- "In the past" boundary is `slotEnd > now` (`new Date()`), evaluated in the query.
- Error code stays `ACTIVE_LOCK_EXISTS` (HTTP 409); message: `Finish or cancel your current appointment before booking another.`
- The single-active check **replaces** the No-Overlap check; the `OVERLAP` error must no longer be thrown by `lockSlot`. Only code references to `OVERLAP` are `service.js` + `service.test.js` (doc `05` is spec-level, applied at END per governance).
- Check-then-insert (no DB constraint); the rare concurrent-double-lock race is an accepted residual.
- Match existing test style: the unified `vi.mock('#src/lib/prisma/prisma.js', …)` + direct prisma-mock pattern (no new mocks needed).
- **Commits require explicit user approval before running** (CLAUDE.md). Treat each "Commit" step as: stage, show the diff, and PAUSE for approval — do not run `git commit` unprompted.
- Run the full relevant suite green before each commit. Server: `npm test`. Client: `npm --workspace client run test`.

---

### Task 1: Server — replace No-Overlap with the single-active-appointment guard

**Files:**
- Modify: `server/src/modules/appointment/service.js` (the No-Overlap block, ~lines 181–191, inside `lockSlot`; and the function JSDoc ~line 157)
- Test: `server/test/unit/modules/appointment/service.test.js` (the `booking.lockSlot` describe, ~lines 206–262)

**Interfaces:**
- Consumes: `ACTIVE_APPOINTMENT_STATES` (already imported in `service.js`), `prisma.appointment.findFirst`, `AppError`.
- Produces: `lockSlot` now throws `AppError('ACTIVE_LOCK_EXISTS', …, 409)` when an active upcoming appointment exists; no longer throws `OVERLAP`. Signature unchanged.

- [ ] **Step 1: Replace the OVERLAP test and add a query-shape test**

In `service.test.js`, replace the existing test (`it('rejects an overlapping appointment with OVERLAP (409)', …)`, lines 240–246) with the two tests below. Also update the `beforeEach` comment on line 214 from `// no overlap by default` to `// no active appointment by default`.

```js
  it('rejects a 2nd booking when an active upcoming appointment exists (ACTIVE_LOCK_EXISTS, 409)', async () => {
    bookable();
    prisma.appointment.findFirst.mockResolvedValueOnce({ id: 'existing1' });
    await expect(
      lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }),
    ).rejects.toMatchObject({ code: 'ACTIVE_LOCK_EXISTS', status: 409 });
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('guards on active states + still-upcoming slotEnd only', async () => {
    bookable();
    prisma.appointment.create.mockResolvedValue({ id: 'a1', state: 'pending', feeAtBooking: 250000 });
    await lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true });
    expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientUserId: 'u1',
          state: { in: ['pending', 'confirmed'] },
          slotEnd: { gt: expect.any(Date) },
        }),
      }),
    );
  });
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

Run: `npm test -- server/test/unit/modules/appointment/service.test.js`
Expected: FAIL — the `ACTIVE_LOCK_EXISTS` test still gets `OVERLAP`; the query-shape test fails on the `slotEnd: { gt: Date }` / `state` shape (current query uses the overlap window).

- [ ] **Step 3: Replace the guard in `lockSlot`**

In `service.js`, replace the No-Overlap block (lines 181–191):

```js
  // 2. No-Overlap: no active appointment overlapping [slotStart, slotEnd).
  const overlap = await prisma.appointment.findFirst({
    where: {
      patientUserId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotStart: { lt: slotEnd },
      slotEnd: { gt: slotStartDate },
    },
    select: { id: true },
  });
  if (overlap) throw new AppError('OVERLAP', 'You already have an appointment at this time.', 409);
```

with:

```js
  // 2. Single-active-appointment: a patient may hold at most ONE upcoming appointment
  // (pending or confirmed). Strictly subsumes the old No-Overlap check.
  const active = await prisma.appointment.findFirst({
    where: {
      patientUserId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotEnd: { gt: new Date() },
    },
    select: { id: true },
  });
  if (active) {
    throw new AppError(
      'ACTIVE_LOCK_EXISTS',
      'Finish or cancel your current appointment before booking another.',
      409,
    );
  }
```

Then update the JSDoc on line 157: change `enforces No-Overlap` to `enforces the single-active-appointment limit`.

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npm test -- server/test/unit/modules/appointment/service.test.js`
Expected: PASS (all `booking.lockSlot` tests, including the unchanged happy-path, not-bookable, P2002, and doctor-404 cases).

- [ ] **Step 5: Confirm no stray `OVERLAP` remains in code**

Run: `git grep -n "OVERLAP" -- server/src server/test`
Expected: no matches (doc `05` reference is intentionally left for the END-of-task spec update).

- [ ] **Step 6: Commit (PAUSE for approval per CLAUDE.md)**

```bash
git add server/src/modules/appointment/service.js server/test/unit/modules/appointment/service.test.js
git commit -m "feat(appointment): cap patients at one upcoming appointment in lockSlot

Replace the No-Overlap check with a single-active-appointment guard
(ACTIVE_LOCK_EXISTS, 409); removes the now-unreachable OVERLAP path."
```

---

### Task 2: Client — re-light the block message link on the Booking page

**Files:**
- Modify: `client/src/modules/booking/views/Booking/Booking.jsx` (the `lockBlocked` link, lines 84–88)
- Test: `client/test/unit/modules/booking/views/Booking/Booking.test.jsx` (the block test, lines 75–88)

**Interfaces:**
- Consumes: existing `ACTIVE_LOCK_EXISTS` catch (`Booking.jsx:31`) and `lockBlocked` state — unchanged behavior, copy only.
- Produces: the block link now reads "Go to your appointments" (still `to="/appointments"`).

- [ ] **Step 1: Update the failing test copy**

In `Booking.test.jsx`, in the test `shows a "Go to your pending booking" link when an active lock blocks a new booking` (lines 75–88), rename it and change the link matcher:

```js
  it('shows a "Go to your appointments" link when an active appointment blocks a new booking', async () => {
    api.post.mockRejectedValueOnce({
      code: 'ACTIVE_LOCK_EXISTS',
      message: 'Finish or cancel your current appointment before booking another.',
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }));
    await waitFor(() =>
      expect(
        screen.getByText('Finish or cancel your current appointment before booking another.'),
      ).toBeTruthy(),
    );
    const link = screen.getByRole('link', { name: /go to your appointments/i });
    expect(link.getAttribute('href')).toBe('/appointments');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --workspace client run test -- test/unit/modules/booking/views/Booking/Booking.test.jsx`
Expected: FAIL — no link named "go to your appointments" (current label is "Go to your pending booking").

- [ ] **Step 3: Update the link label**

In `Booking.jsx`, change the `lockBlocked` link text (lines 84–88) from `Go to your pending booking` to `Go to your appointments`:

```jsx
        {lockBlocked && (
          <Link className="btn btn--secondary" to="/appointments">
            Go to your appointments
          </Link>
        )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --workspace client run test -- test/unit/modules/booking/views/Booking/Booking.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit (PAUSE for approval per CLAUDE.md)**

```bash
git add client/src/modules/booking/views/Booking/Booking.jsx client/test/unit/modules/booking/views/Booking/Booking.test.jsx
git commit -m "feat(booking): broaden block-message link copy to 'Go to your appointments'"
```

---

### Task 3: Client — expose Cancel on pending rows in Upcoming

**Files:**
- Modify: `client/src/modules/appointment/views/Upcoming/Upcoming.jsx` (the `pending` row actions, lines 66–75)
- Test: `client/test/unit/modules/appointment/views/Upcoming/Upcoming.test.jsx`

**Interfaces:**
- Consumes: existing `cancelId` state, `setCancelId`, `cancelMut`, and `<CancelModal>` already wired at the bottom of `Upcoming.jsx` (used by the confirmed branch) — no new imports.
- Produces: pending rows render a Cancel button that opens the shared `CancelModal` and POSTs `/appointments/:id/cancel`.

- [ ] **Step 1: Write the failing test**

Append this test inside the `describe('P-08 Upcoming', …)` block in `Upcoming.test.jsx`:

```js
  it('lets the patient cancel a pending hold (Cancel button → modal → POST cancel)', async () => {
    api.get.mockResolvedValue({
      data: [confirmedRow({ id: 'p1', state: 'pending', paymentReference: null })],
    });
    api.post.mockResolvedValue({ state: 'cancelled' });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.getByText(/this cannot be undone/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /cancel appointment/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/p1/cancel', {}));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --workspace client run test -- test/unit/modules/appointment/views/Upcoming/Upcoming.test.jsx`
Expected: FAIL — no Cancel button on the pending row (`getByRole('button', { name: /^cancel$/i })` not found).

- [ ] **Step 3: Add the Cancel button to the pending row**

In `Upcoming.jsx`, inside the pending branch's `appt-actions` div (lines 66–75), add a Cancel button after the existing Link/awaiting-confirmation markup, mirroring the confirmed branch's button:

```jsx
                    <div className="appt-actions">
                      <Link className="btn btn--primary btn--sm" to={`/book/pay/${a.id}`}>
                        {a.paymentReference ? 'View payment details' : 'Enter payment reference'}
                      </Link>
                      {a.paymentReference && (
                        <span className="help" style={{ margin: 0 }}>
                          Awaiting confirmation
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn btn--danger-ghost btn--sm"
                        onClick={() => setCancelId(a.id)}
                      >
                        Cancel
                      </button>
                    </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --workspace client run test -- test/unit/modules/appointment/views/Upcoming/Upcoming.test.jsx`
Expected: PASS (the new test plus the existing pending/confirmed tests).

- [ ] **Step 5: Run the full client + server suites**

Run: `npm --workspace client run test` then `npm test`
Expected: both green.

- [ ] **Step 6: Commit (PAUSE for approval per CLAUDE.md)**

```bash
git add client/src/modules/appointment/views/Upcoming/Upcoming.jsx client/test/unit/modules/appointment/views/Upcoming/Upcoming.test.jsx
git commit -m "feat(appointment): let patients cancel a pending hold from Upcoming"
```

---

## Post-implementation

- **Doc-impact (apply at END, after code committed, with approval — per CLAUDE.md & doc `00`):** docs `02` (booking constraint + pending-cancel), `05` (lock returns `ACTIVE_LOCK_EXISTS`, drop `OVERLAP`), `11` (new ADR — single-active cap, supersedes the No-Overlap rule), `12` (test cases), `13` (status). Doc `04` not impacted (no schema change).
- **Manual sanity (optional):** with a pending hold present, attempt a second booking → expect the block message + "Go to your appointments"; cancel the pending hold → second booking succeeds.

## Self-Review

- **Spec coverage:** §2.1 strict per-account limit → Task 1 guard (keyed on `patientUserId`, states `['pending','confirmed']`). §2.2 `slotEnd > now` boundary → Task 1 query + query-shape test. §2.3 replace No-Overlap / drop `OVERLAP` → Task 1 Steps 3 & 5. §2.4 reuse `ACTIVE_LOCK_EXISTS` + client wiring → Task 2. §2.5 check-then-insert → Task 1 (no DB constraint). §2.6 pending-cancel → Task 3. Test plan (§8) → tests in Tasks 1–3. Cleanup (§4) → Task 1 Step 5. All covered.
- **Placeholder scan:** none — every code/test/command step is concrete.
- **Type/name consistency:** `ACTIVE_LOCK_EXISTS`, `ACTIVE_APPOINTMENT_STATES`, `setCancelId`, `cancelMut`, `CancelModal`, route `/appointments`, endpoint `/appointments/:id/cancel` all match the existing code read during planning.

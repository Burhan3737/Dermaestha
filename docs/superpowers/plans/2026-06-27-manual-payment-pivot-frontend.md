# Manual Payment Pivot — Frontend Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Depends on Plan 1 (backend) being merged** — the endpoints/states below assume the 4-state model + new routes exist.

**Goal:** Replace the gateway-redirect booking UX with the manual flow — patient confirms a booking (slot locks), sees bank instructions + amount, submits a bank transaction reference, and waits for the admin; the admin reviews pending payments and accepts/rejects; admin edits the clinic bank details. All UI conforms to the existing design system (doc `06`).

**Architecture:** Reuse existing views/hooks and shared components (`Button`, `Field`, `Alert`, `Pagination`, `PatientLayout`, `SidebarLayout`), tokens, and `.section-card`/`.badge`/`.appt-row` classes. No new aesthetics. Add one patient screen (payment instructions + reference) and one admin review queue; adjust booking/appointment/admin hooks for the new endpoints.

**Tech Stack:** React 18, React Router, TanStack Query, Vitest + Testing Library. `@ts-check` JSDoc. Vite dev on `:5173` proxying `/api` → `:3000`.

**Source design:** `docs/superpowers/specs/2026-06-27-manual-payment-pivot-design.md` (§7, §9, §12). Backend is Plan 1.

## Global Constraints

- **Design conformance (doc `06`):** use existing tokens/components; the patient pay screen matches the booking-flow styling; the admin review queue matches the records-table styling. No bespoke CSS unless a token/class is genuinely missing (then add it to the shared stylesheet, not inline). (design §12)
- Money is PKR paisa; render with `formatPkr`. Times render with `formatKarachi`/`formatKarachiTable`.
- API via the shared `api` client (`api.get/post/put`); it prepends `/api`.
- Subagents MUST NOT touch `agentChangeLogs/`.
- Run from project root. Client tests: `npm --workspace client run test` (or `npm test` for all). Build: `npm run build:client`. Lint: `npm run lint`.

---

## File Structure

**Backend support (thin, for these screens)**
- `server/src/modules/admin/service.js` — `listRecords`: drop Payment-derived `amountPaid`/`refundRef`/`disputed`; use `feeAtBooking`, add `paymentReference`/`paymentSubmittedAt`; accept a `state` filter. `getRecordDetail`: drop Payment block.
- `server/src/modules/appointment/service.js` — `getForRole`: for a `pending` appointment owned by the patient, include `paymentInstructions { bankName, bankAccountName, bankAccountNumber, bankInstructions, amount }` and `paymentReference`.
- `shared/schemas/` — `settingsUpdateSchema`: add optional bank fields; drop `fallbackFee*` (refunds gone). `recordsQuerySchema`: add optional `state`.

**Frontend modify**
- `client/src/modules/booking/useBooking.js` — `confirmBooking` returns the appointment id (no redirect); drop `isLockReleased`/`isTerminalBooking` lock-expiry logic; appointment poll stops on `confirmed`/`cancelled`.
- `client/src/modules/booking/views/Booking/Booking.jsx` — button "Confirm booking" → lock → `navigate(/book/pay/:id)`.
- `client/src/modules/booking/views/PaymentInstructions/PaymentInstructions.jsx` — **new** patient screen.
- `client/src/modules/booking/booking.routes.jsx` — add `/book/pay/:id`; remove the gateway `PaymentReturn` route.
- Delete `client/src/modules/booking/views/PaymentReturn/PaymentReturn.jsx`.
- `client/src/modules/appointment/useAppointment.js` — replace `resumePayment` with `submitReference`; drop refund-quote usage in cancel.
- `client/src/modules/appointment/views/Upcoming/Upcoming.jsx` — `pending` card → "Awaiting confirmation" + "Enter/Update payment reference"; remove lock-expiry/Complete-payment redirect.
- `client/src/modules/appointment/components/CancelModal/CancelModal.jsx` — remove refund-quote display (no refunds).
- `client/src/modules/appointment/stateLabel.js` — labels/badges for `pending/confirmed/completed/cancelled`.
- `client/src/modules/admin/useAdmin.js` — add `acceptAppointment`/`rejectAppointment`; remove `setDisputed`; `saveSettings` payload incl. bank fields; add `pendingReview` query.
- `client/src/modules/admin/views/AdminRecords/AdminRecords.jsx` — drop `disputed`/`refundRef` columns; `state` badge via mapping.
- `client/src/modules/admin/views/AdminReview/AdminReview.jsx` — **new** review queue (accept/reject).
- `client/src/modules/admin/admin.routes.jsx` — add the review view + nav link.
- `client/src/modules/admin/views/AdminSettings/AdminSettings.jsx` — add bank fields; remove fallback-fee fields.

---

## Task F1: Backend support for the UI

**Files:** `server/src/modules/admin/service.js`, `server/src/modules/appointment/service.js`, `shared/schemas/*`
**Test:** `server/test/integration/admin.test.js`, `server/test/integration/booking.test.js`

**Interfaces:**
- Produces: `GET /api/admin/records?state=pending` filters by state and returns rows with `{ paymentReference, paymentSubmittedAt, feeAtBooking, state }` (no `amountPaid`/`refundRef`/`disputed`). `GET /api/appointments/:id` for an owned `pending` appointment returns `paymentInstructions` + `paymentReference`.

- [ ] **Step 1: Failing tests** — (a) records query with `state=pending` returns only pending rows with `paymentReference`; (b) patient `GET /appointments/:id` on a pending appt returns `paymentInstructions.amount === feeAtBooking` and the bank fields from settings.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Edit `listRecords`** — remove the `Payment` join; select `feeAtBooking`, `paymentReference`, `paymentSubmittedAt`, `state`; honor an optional `state` filter from the query. Edit `getRecordDetail` to drop the Payment section.
- [ ] **Step 4: Edit `getForRole`** — when `role === 'patient'` and `a.state === 'pending'`, load settings and attach:
```js
detail.paymentReference = a.paymentReference ?? null;
if (a.state === 'pending') {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  detail.paymentInstructions = {
    bankName: s?.bankName ?? null, bankAccountName: s?.bankAccountName ?? null,
    bankAccountNumber: s?.bankAccountNumber ?? null, bankInstructions: s?.bankInstructions ?? null,
    amount: a.feeAtBooking,
  };
}
```
Remove the old `if (a.state === 'confirmed') { refundQuote }` block.
- [ ] **Step 5: Edit schemas** — `settingsUpdateSchema`: add `bankName/bankAccountName/bankAccountNumber/bankInstructions` as `z.string().trim().max(...).optional()`; remove `fallbackFeePctBps`/`fallbackFeeFixed`. `recordsQuerySchema`: add `state: z.enum(['pending','confirmed','completed','cancelled']).optional()`. Update `admin/service.js updateSettings` to persist the bank fields and stop writing fallback-fee fields.
- [ ] **Step 6: Run → PASS** ; **Commit** `git commit -am "feat(admin/appointment): records state filter + patient payment instructions"`

---

## Task F2: Booking hook — confirm without redirect

**Files:** `client/src/modules/booking/useBooking.js`
**Test:** `client/test/unit/modules/booking/useBooking.test.js` (or the Booking view test)

**Interfaces:**
- Produces: `confirmBooking({ doctorId, slotStart, forSelf, subject }) → appointmentId` (string). `appointmentStatus` poll stops on `confirmed`/`cancelled`.

- [ ] **Step 1: Failing test** — `confirmBooking` posts `/appointments/lock` and resolves the new id (no `/pay`, no redirectUrl).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Rewrite** — delete `isLockReleased`/`isTerminalBooking` (lock-expiry gone); add:
```js
const confirmBooking = async ({ doctorId, slotStart, forSelf, subject }) => {
  const body = { doctorId, slotStart, forSelf };
  if (!forSelf) body.subject = { name: subject.name, age: Number(subject.age), relation: subject.relation };
  const appt = await api.post('/appointments/lock', body);
  track('booking_started', { doctorId });
  return appt.id;
};
```
Set the appointment poll `refetchInterval` to stop when `state` is `confirmed` or `cancelled`. Return `{ doctor, appointmentStatus, confirmBooking }`.
- [ ] **Step 4: Run → PASS** ; **Commit** `git commit -am "feat(booking): confirm booking returns id; drop gateway redirect"`

---

## Task F3: Patient payment-instructions screen (new)

**Files:** Create `client/src/modules/booking/views/PaymentInstructions/PaymentInstructions.jsx`; `client/src/modules/booking/booking.routes.jsx`; `client/src/modules/appointment/useAppointment.js` (add `submitReference`)
**Test:** `client/test/unit/modules/booking/PaymentInstructions.test.jsx`

**Interfaces:**
- Consumes: `GET /appointments/:id` → `{ state, paymentInstructions, paymentReference }`; `submitReference({ id, reference })` → `POST /appointments/:id/pay { reference }`.

- [ ] **Step 1: Failing test** — renders bank fields + amount; entering a reference and submitting calls `api.post('/appointments/:id/pay', { reference })`; after submit shows "Awaiting confirmation".
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Add `submitReference`** to `useAppointment.js`:
```js
const submitReference = useMutation({
  mutationFn: ({ id, reference }) => api.post(`/appointments/${id}/pay`, { reference }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['appointment'] }),
});
```
(Remove `resumePayment`.)
- [ ] **Step 4: Create the screen** (reuse `PatientLayout`, `.section-card`, `Field`, `Button`, `Alert`, `formatPkr`/`formatKarachi`):
```jsx
// PaymentInstructions.jsx
export function PaymentInstructions() {
  const { id } = useParams();
  const { detail, submitReference } = useAppointment({ detailId: id });
  const [ref, setRef] = useState('');
  const d = detail.data;
  const pi = d?.paymentInstructions;
  const submitted = Boolean(d?.paymentReference);
  return (
    <PatientLayout>
      <section className="section-card">
        <h1>Pay for your appointment</h1>
        {pi && (
          <>
            <p className="appt-sub tnum">{formatKarachi(d.slotStart)} · {formatPkr(pi.amount)}</p>
            <dl className="kv">
              <div><dt>Bank</dt><dd>{pi.bankName}</dd></div>
              <div><dt>Account name</dt><dd>{pi.bankAccountName}</dd></div>
              <div><dt>Account number</dt><dd>{pi.bankAccountNumber}</dd></div>
            </dl>
            {pi.bankInstructions && <p className="help">{pi.bankInstructions}</p>}
          </>
        )}
        {submitted ? (
          <Alert variant="info">Awaiting confirmation. We’ll email you once the admin verifies your payment.</Alert>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); submitReference.mutate({ id, reference: ref }); }}>
            <Field label="Bank transaction reference" id="pay-ref" value={ref}
              onChange={(e) => setRef(e.target.value)} required
              help="Enter the reference/transaction ID from your bank transfer so the admin can verify it." />
            {submitReference.error && <Alert variant="danger">{submitReference.error.message}</Alert>}
            <Button type="submit" isLoading={submitReference.isPending} disabled={ref.trim().length < 3}>
              I’ve paid — submit reference
            </Button>
          </form>
        )}
      </section>
    </PatientLayout>
  );
}
```
(If `.kv` is not an existing token class, render the three fields with the existing `.help`/`.appt-sub` pattern instead — do not invent styling; match the records/detail layout.)
- [ ] **Step 5: Route** — add `{ path: '/book/pay/:id', element: <PaymentInstructions/> }` to `booking.routes.jsx`.
- [ ] **Step 6: Run → PASS** ; **Commit** `git commit -am "feat(booking): patient payment-instructions + reference screen"`

---

## Task F4: Booking view — confirm then navigate to pay

**Files:** `client/src/modules/booking/views/Booking/Booking.jsx`
**Test:** `client/test/unit/modules/booking/views/Booking/Booking.test.jsx` (rewrite)

- [ ] **Step 1: Rewrite the test** — clicking "Confirm booking" calls lock then `navigate('/book/pay/<id>')` (no `window.location.href`).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Edit `Booking.jsx`** — use `useNavigate`; replace `confirmAndPay`:
```js
const navigate = useNavigate();
const { doctor, confirmBooking } = useBooking({ doctorId: id });
async function onConfirm() {
  setError(null); setLockBlocked(false); setBusy(true);
  try {
    const apptId = await confirmBooking({ doctorId: id, slotStart, forSelf, subject });
    navigate(`/book/pay/${apptId}`);
  } catch (e) {
    if (e.code === 'ACTIVE_LOCK_EXISTS') setLockBlocked(true);
    setError(e.message ?? 'Could not create the booking.'); setBusy(false);
  }
}
```
Change the button label to "Confirm booking" and `onClick={onConfirm}`.
- [ ] **Step 4: Run → PASS** ; **Commit** `git commit -am "feat(booking): confirm → navigate to payment instructions"`

---

## Task F5: Upcoming view — pending card + state labels

**Files:** `client/src/modules/appointment/views/Upcoming/Upcoming.jsx`, `client/src/modules/appointment/stateLabel.js`
**Test:** `client/test/unit/modules/appointment/views/Upcoming/Upcoming.test.jsx` (rewrite)

- [ ] **Step 1: Update `stateLabel.js`** — map `pending`→("Payment pending","warning"), `confirmed`→("Confirmed","success"), `completed`→("Completed","info"), `cancelled`→("Cancelled","neutral"). Remove `slot_locked`/`in_progress`/`*_no_show`/`*_refund` entries.
- [ ] **Step 2: Rewrite the test** — a `pending` row shows "Payment pending" + a link to `/book/pay/:id` labelled "Enter payment reference" (or "Awaiting confirmation" when `paymentReference` present); no "Complete payment" redirect; no `lockExpiresAt` text.
- [ ] **Step 3: Run → FAIL**
- [ ] **Step 4: Edit `Upcoming.jsx`** — replace the `a.state === 'slot_locked'` branch with a `pending` branch using the shared badge + a `<Link to={'/book/pay/'+a.id}>`; remove the `resumePayment` button and `lockExpiresAt`. Keep the confirmed branch (Join Call + Cancel). Remove the `isLate`/`refundQuote` logic in the cancel modal (Task F6).
- [ ] **Step 5: Run → PASS** ; **Commit** `git commit -am "feat(appointments): pending card + 4-state labels"`

---

## Task F6: CancelModal — no refund quote

**Files:** `client/src/modules/appointment/components/CancelModal/CancelModal.jsx`, `client/src/modules/appointment/useAppointment.js`
**Test:** `client/test/unit/modules/appointment/components/CancelModal/CancelModal.test.jsx`

- [ ] **Step 1: Update the test** — the modal shows a plain "Cancel this appointment? This cannot be undone." confirmation; no refund amount.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Edit `CancelModal.jsx`** — drop the `quote`/`lateNoRefund` props and refund copy; keep `onClose`/`onConfirm`. Update `Upcoming.jsx` call site to pass only `onClose`/`onConfirm`. Remove the `refundQuote`/`detail` plumbing.
- [ ] **Step 4: Run → PASS** ; **Commit** `git commit -am "feat(cancel): drop refund quote from cancel modal"`

---

## Task F7: Admin records table — drop refund/dispute columns

**Files:** `client/src/modules/admin/views/AdminRecords/AdminRecords.jsx`
**Test:** `client/test/unit/modules/admin/views/AdminRecords/AdminRecords.test.jsx` (if present; else add)

- [ ] **Step 1: Update/add the test** — table headers exclude "Refund ref"; no "Disputed" badge; state rendered via the shared label.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Edit `AdminRecords.jsx`** — remove the `Refund ref` column and the `r.disputed` badge; replace the raw `<span className="badge badge--info">{r.state}</span>` with `stateLabel`/`stateBadge`; the `Paid` column shows `feeAtBooking`; keep `Payment ref`.
- [ ] **Step 4: Run → PASS** ; **Commit** `git commit -am "feat(admin): records table without refund/dispute"`

---

## Task F8: Admin review queue (new) + accept/reject

**Files:** Create `client/src/modules/admin/views/AdminReview/AdminReview.jsx`; `client/src/modules/admin/useAdmin.js`; `client/src/modules/admin/admin.routes.jsx`
**Test:** `client/test/unit/modules/admin/views/AdminReview/AdminReview.test.jsx`

**Interfaces:**
- Consumes: `GET /admin/records?state=pending`; `acceptAppointment(id)` → `POST /admin/appointments/:id/accept`; `rejectAppointment(id)` → `.../reject`.

- [ ] **Step 1: Failing test** — lists pending rows (patient/doctor/slot/amount/paymentReference); "Accept" calls accept and removes the row; "Reject" calls reject.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Add hooks** to `useAdmin.js` (remove `setDisputed`):
```js
const pendingReview = useQuery({
  queryKey: ['admin-pending-review'],
  queryFn: () => api.get('/admin/records?state=pending'),
  enabled: opts.pendingReview ?? false,
});
const invalidateReview = () => { qc.invalidateQueries({ queryKey: ['admin-pending-review'] }); qc.invalidateQueries({ queryKey: ['admin-alerts'] }); };
const acceptAppointment = useMutation({ mutationFn: (id) => api.post(`/admin/appointments/${id}/accept`), onSuccess: invalidateReview });
const rejectAppointment = useMutation({ mutationFn: (id) => api.post(`/admin/appointments/${id}/reject`), onSuccess: invalidateReview });
```
Add them to the returned object.
- [ ] **Step 4: Create `AdminReview.jsx`** (reuse `SidebarLayout`, `.table`, `Button`, `Alert`, `formatPkr`/`formatKarachiTable`):
```jsx
export function AdminReview() {
  const { pendingReview, acceptAppointment, rejectAppointment } = useAdmin({ pendingReview: true });
  const rows = pendingReview.data?.data ?? [];
  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Payment review</h1>
      <div className="section-card">
        {pendingReview.isLoading && <p>Loading…</p>}
        {rows.length === 0 && !pendingReview.isLoading && <p className="empty">No payments awaiting review.</p>}
        {rows.length > 0 && (
          <table className="table">
            <thead><tr><th>Slot</th><th>Patient</th><th>Doctor</th><th>Amount</th><th>Bank ref</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatKarachiTable(r.slotStart)}</td>
                  <td>{r.patientName}</td>
                  <td>{r.doctorName}</td>
                  <td>{formatPkr(r.feeAtBooking)}</td>
                  <td>{r.paymentReference ?? '—'}</td>
                  <td>
                    <Button size="sm" isLoading={acceptAppointment.isPending} onClick={() => acceptAppointment.mutate(r.id)}>Accept</Button>{' '}
                    <Button variant="ghost" size="sm" onClick={() => rejectAppointment.mutate(r.id)}>Reject</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SidebarLayout>
  );
}
```
(Match `Button` props to the real component API — check `shared/Button/Button.jsx` for `size`/`variant`.)
- [ ] **Step 5: Route + nav** — add the view to `admin.routes.jsx` and an entry to `ADMIN_LINKS` (e.g. `/admin/review` → "Payment review").
- [ ] **Step 6: Run → PASS** ; **Commit** `git commit -am "feat(admin): payment review queue with accept/reject"`

---

## Task F9: Admin settings — bank details, drop fallback fee

**Files:** `client/src/modules/admin/views/AdminSettings/AdminSettings.jsx`, `client/src/modules/admin/useAdmin.js`
**Test:** `client/test/unit/modules/admin/views/AdminSettings/AdminSettings.test.jsx` (if present)

- [ ] **Step 1: Update/add the test** — the form shows bank fields and saving posts them; no fallback-fee fields.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Edit `AdminSettings.jsx`** — remove the two fallback-fee `Field`s and their payload keys; add `Field`s for `bankName`, `bankAccountName`, `bankAccountNumber`, and a textarea (or `Field` multiline) for `bankInstructions`; seed `form` from `settings.data`; include them in the `save` payload. Update the confirm-modal copy (remove the "feeds refund amounts" line).
- [ ] **Step 4: Edit `useAdmin.js`** — `saveSettings` JSDoc/body already posts the whole `body`; no signature change needed beyond the new fields flowing through.
- [ ] **Step 5: Run → PASS** ; **Commit** `git commit -am "feat(admin): editable clinic bank details in settings"`

---

## Task F10: Remove the gateway return page

**Files:** Delete `client/src/modules/booking/views/PaymentReturn/PaymentReturn.jsx`; `client/src/modules/booking/booking.routes.jsx`
**Test:** existing route/render tests

- [ ] **Step 1: Delete `PaymentReturn.jsx`** and remove its route + import from `booking.routes.jsx`.
- [ ] **Step 2: Grep** `grep -rn "PaymentReturn\|pay/return\|redirectUrl\|resumePayment\|isLockReleased\|lockExpiresAt\|setDisputed" client/src` → resolve each.
- [ ] **Step 3: Run client tests → PASS** ; **Commit** `git commit -am "chore: remove gateway return page + dead redirect paths"`

---

## Task F11: Green sweep — build, lint, client + e2e

- [ ] **Step 1:** Update any remaining client tests referencing old states/redirects (`VideoRoom.test.jsx` `joinSimUrl` already null in real mode; `Booking.test.jsx`, `Upcoming.test.jsx` covered above).
- [ ] **Step 2: Run** `npm test` (server+client) → green; `npm run build:client` → clean; `npm run lint` → clean.
- [ ] **Step 3: Manual smoke (mock providers)** — book → pay screen shows bank details + amount → submit reference → admin Payment review → Accept → patient sees Confirmed. (Use the `dermestha-db-test-data` skill or the baseline seed.)
- [ ] **Step 4: Commit** `git commit -am "test: client + e2e green for manual-payment UI"`

---

## Self-Review

**Spec coverage (design §7/§9/§12):** patient pay screen → F3/F4; admin review + accept/reject → F8 (+F1 data); cancellation UI → F5/F6; bank details editable → F9 (+F1 schema); records cleanup → F7; gateway removal → F10; design conformance → reuse of shared components throughout. ✅

**Placeholder scan:** no TBD/TODO; where a class/prop might not exist (`.kv`, `Button size`), the step says to verify against the real component and fall back to existing patterns — not a placeholder, a guard. ✅

**Type consistency:** `confirmBooking`, `submitReference`, `acceptAppointment`, `rejectAppointment`, `pendingReview`, `paymentInstructions` used consistently. Endpoints match Plan 1 (`POST /appointments/:id/pay`, `POST /admin/appointments/:id/accept|reject`). ✅

## Notes / risks

- **Hard dependency on Plan 1.** Build/merge Plan 1 first; F1's tests assume the 4-state model.
- Verify the real `Button`/`Field` component APIs (`size`, `variant`, multiline) before using them; match existing call sites.
- The patient pay screen needs the bank details to be readable by the patient — delivered via `getForRole`'s `paymentInstructions` (F1), NOT the admin-only settings endpoint.
- Keep `track()` analytics calls that still apply (`booking_started`); drop any tied to removed flows.

---

## Addendum (review-pass additions)

### Task F12: Admin record-detail — drop refund/dispute

**Files:** `client/src/modules/admin/views/AdminRecordDetail/AdminRecordDetail.jsx`, its test
**Why:** it renders `amountPaid`/`paymentRef`/`refundRef`/`disputed` and the **Mark/Clear disputed** buttons via `setDisputed` (removed in F8).

- [ ] **Step 1:** Update/add the test — detail shows state (via `stateLabel`), `feeAtBooking`, and `paymentReference`; no Refund ref, no Disputed badge, no Mark/Clear-disputed buttons.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3:** Edit the view — remove the `disputed` badge + the Mark/Clear-disputed `Button`s + the `confirming.kind === 'dispute'` modal branch + the `setDisputed` destructure; change line ~46 to show `feeAtBooking` + `paymentReference` only (drop `amountPaid`/`refundRef`); render state with `stateLabel`/`stateBadge`. Keep the state-history + email-jobs + prescriptions sections + the resend-email flow.
- [ ] **Step 4: Run → PASS** ; **Commit** `git commit -am "feat(admin): record detail without refund/dispute"`

### Task F13: Doctor today — prescription gate on `completed` only

**Files:** `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx`, its test
**Why:** `canWriteRx = a.state === 'completed' || a.state === 'prescription_issued'` — `prescription_issued` is dropped.

- [ ] **Step 1:** Update the test — the "Write prescription" CTA shows for a `completed` appointment; `showCancel` still gates on `confirmed`.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3:** Edit `DoctorToday.jsx` — `const canWriteRx = a.state === 'completed';` (line ~52); remove any `in_progress`/`prescription_issued` references. State badge already uses the shared `stateLabel`/`stateBadge` (updated in F5).
- [ ] **Step 4: Run → PASS** ; **Commit** `git commit -am "feat(doctor): prescription CTA gated on completed"`

### Task F14: Verify the remaining state consumers

- [ ] **Step 1:** `client/src/modules/appointment/views/Past/Past.jsx` — confirm it only renders state via `stateLabel`/`stateBadge` (no hard-coded removed-state filters). Adjust if it filters by `in_progress`/`*_no_show`.
- [ ] **Step 2:** `client/src/modules/booking/useBooking.js` — after F2/F10, if `appointmentStatus` (the old PaymentReturn poll) has no remaining consumer, delete it (dead code).
- [ ] **Step 3:** Final grep `grep -rn "prescription_issued\|in_progress\|slot_locked\|no_show\|amountPaid\|refundRef\|setDisputed\|resumePayment" client/src` → zero hits. **Commit** any fixes.

> **F11 (green sweep) now also covers:** `AdminRecordDetail.test`, `DoctorToday.test`, `Past.test` if present.

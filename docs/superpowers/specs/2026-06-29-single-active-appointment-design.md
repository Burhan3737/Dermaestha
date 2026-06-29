# Single-Active-Appointment Limit — Design

| Field        | Value                                                                              |
| ------------ | ---------------------------------------------------------------------------------- |
| Status       | Approved (design); implementation pending                                          |
| Date         | 2026-06-29                                                                          |
| Author       | Brainstormed with user (superpowers:brainstorming)                                 |
| Relates to   | ADR-43 (manual-payment pivot), ADR-07 (`uniq_active_slot`), ADR-23 (lazy expiry)   |
| Spec impact  | Tracked below (§9); applied at END of implementation per doc `00` governance       |

---

## 1. Context & goal

The manual-payment pivot (ADR-43) deliberately removed the timed slot-lock auto-expiry: booking a
slot creates a `pending` appointment that holds the slot until a human cancels/rejects it. A
side effect, surfaced in code review, is that **a single patient account can create unlimited
`pending` holds** — each one locks a different future slot forever (`lockSlot` only enforces
No-Overlap, not a per-patient cap). One account can squat a doctor's whole calendar.

**Goal:** limit a patient to **one upcoming appointment at a time**, so a patient holds at most one
future slot. This caps the squat surface at a single slot per account and keeps the booking model
simple to reason about, without re-introducing any background worker.

## 2. Decisions (locked in)

1. **Strict, one upcoming appointment per patient account.** A patient may have at most one
   appointment in an active state (`pending` OR `confirmed`) whose slot has not yet passed. The
   limit spans the whole account, **not** per subject — booking "for someone else" (`forSelf=false`)
   still counts against the same single-appointment cap (otherwise one account could hold unlimited
   slots by naming different subjects). Accepted v1 tradeoff: a parent cannot simultaneously hold
   their own and their child's upcoming appointment; they book them one at a time.
2. **"In the past" = `slotEnd > now`.** The guard blocks while the existing appointment's time
   window has not fully ended. The moment `slotEnd` passes, the patient is automatically free to book
   again — no worker, no admin action. An abandoned future `pending` hold therefore ties up exactly
   one future slot until it passes or the patient cancels it.
3. **Replace the No-Overlap check, do not add alongside it.** The single-active guard is a strict
   superset of No-Overlap (one upcoming appointment ⟹ never two overlapping). The existing
   No-Overlap check and its `OVERLAP` error become unreachable and are removed.
4. **Reuse the `ACTIVE_LOCK_EXISTS` error code + existing client wiring.** The client `Booking.jsx`
   already catches `ACTIVE_LOCK_EXISTS` and renders a "go to your appointments" link (orphaned when
   the old Single-Lock guard was removed). We re-light it with updated copy rather than add new UI.
   The code name stays `ACTIVE_LOCK_EXISTS` for minimal churn (the message text is updated).
5. **Check-then-insert, not a DB constraint.** The guard is a service-layer query before insert,
   matching the style of the No-Overlap check it replaces. Accepted residual: two simultaneous lock
   requests from one account could race past the check (same property the No-Overlap guard already
   had). A hand-edited partial unique index on `patient_user_id` would close this but is ADR-07-class
   machinery, out of scope for v1.
6. **Expose patient-cancel on `pending` holds.** The single-appointment rule is only humane if a
   patient can self-cancel an unpaid hold to unblock themselves. The server `cancel()` already
   accepts `pending`; the patient UI does not surface it. Add a Cancel button to `pending` rows on
   the Upcoming page, reusing the existing `CancelModal`.

## 3. Out of scope / deferred

- Any per-subject or per-doctor booking allowance (revisit only if the per-account limit becomes a
  real complaint).
- A DB-level uniqueness guarantee for "one active appointment per patient" (the check-then-insert
  residual is accepted).
- Refund/goodwill on cancelling a confirmed appointment — unchanged; paid is paid (ADR-43 #5).

## 4. Scope — changes

### Server
- `server/src/modules/appointment/service.js` — in `lockSlot`, **replace** the No-Overlap block
  (currently §"2. No-Overlap", ~lines 181–191) with the single-active-appointment guard:

  ```js
  // Single-active-appointment: a patient may hold at most ONE upcoming appointment
  // (pending or confirmed). Replaces No-Overlap, which this strictly subsumes.
  const active = await prisma.appointment.findFirst({
    where: {
      patientUserId,
      state: { in: ACTIVE_APPOINTMENT_STATES }, // ['pending','confirmed']
      slotEnd: { gt: new Date() },              // still upcoming (not yet in the past)
    },
    select: { id: true },
  });
  if (active) {
    throw new AppError('ACTIVE_LOCK_EXISTS',
      'Finish or cancel your current appointment before booking another.', 409);
  }
  ```
  Reuses the existing `ACTIVE_APPOINTMENT_STATES` constant (`server/src/config/constants.js`).
  Remove the now-unused `OVERLAP` throw and update the function's JSDoc.

### Client
- `client/src/modules/booking/views/Booking/Booking.jsx` — the `ACTIVE_LOCK_EXISTS` handler and the
  `lockBlocked` link already exist; update the link label/copy so it reads sensibly for a confirmed
  (not just pending) blocker, e.g. "Go to your appointments".
- `client/src/modules/appointment/views/Upcoming/Upcoming.jsx` — add a **Cancel** button to the
  `pending` row branch (alongside "Enter payment reference" / "View payment details"), wiring the
  existing `setCancelId` / `CancelModal` already used by the confirmed branch.

### Cleanup (orphans created by this change)
- Remove `OVERLAP` references that become unreachable: the server throw, plus any client/test/doc
  references. A repo-wide sweep for `OVERLAP` confirms the blast radius before deletion.

## 5. Flow — before → after

**Before:** Browse → pick slot → Confirm booking → `pending` hold → pay screen. Repeatable without
limit; each repeat holds another slot forever. Cancel available only on confirmed rows.

**After:**
- No upcoming appointment → Confirm booking works exactly as today (happy path unchanged).
- Already have an upcoming `pending`/`confirmed` → `lockSlot` throws `ACTIVE_LOCK_EXISTS` (409); no
  second hold is created. Booking screen shows the message + "Go to your appointments" link.
- From Upcoming, the patient either pays/completes the existing appointment, or **cancels** it
  (now possible on `pending` too) — freeing the slot and the guard — and books again.
- When the held slot's `slotEnd` passes, the guard auto-clears and the patient can book again.

Downstream (submit reference → admin accept/reject → confirmed → video → prescription) is unchanged.

## 6. Edge cases

- **Abandoned future `pending` hold:** blocks new bookings until its `slotEnd` passes OR the patient
  cancels it. The new Cancel button is the deliberate escape hatch.
- **Past, uncancelled `pending`/`confirmed`:** `slotEnd < now`, so it no longer blocks — consistent
  with the Upcoming/Past split, which already moves `confirmed` + ended rows to Past.
- **In-progress appointment** (`slotStart < now < slotEnd`): still blocks a new booking — intended.
- **Cancelled appointment:** terminal, not an active state — never blocks.
- **Booking for someone else:** counts against the same per-account cap (decision §2.1).
- **Concurrent double-lock:** accepted check-then-insert residual (decision §2.5).

## 7. Success criteria

- A patient with an upcoming `pending` or `confirmed` appointment is refused a second booking with
  `ACTIVE_LOCK_EXISTS` (409); no second row is created.
- A patient with only past/cancelled appointments can book normally.
- Cancelling the blocking appointment (from either `pending` or `confirmed`) immediately allows a new
  booking.
- The `pending` Upcoming row exposes a working Cancel button.
- `OVERLAP` is no longer thrown anywhere and has no dead references.

## 8. Testing (test-first)

Following superpowers:test-driven-development — write/adjust the failing test, then change code.

- **Server unit (`lockSlot`):** blocks a 2nd booking when an upcoming `pending` exists; blocks when
  an upcoming `confirmed` exists; **allows** when the only other appointment is past (`slotEnd < now`)
  or cancelled; **allows** after the blocker is cancelled. Remove/replace any test asserting the
  `OVERLAP` path.
- **Client (`Upcoming`):** the `pending` row renders a Cancel button that opens `CancelModal` and
  calls the cancel mutation.
- **Client (`Booking`):** an `ACTIVE_LOCK_EXISTS` error renders the "go to your appointments" link.

## 9. Spec doc-impact (tracked; applied at END per doc `00` governance)

| Doc | Change |
| --- | ------ |
| `02` Scope/Feature | Add the single-active-appointment booking constraint; note patient-cancel on `pending` holds |
| `05` API + state machine | `POST /api/appointments/lock` now returns `ACTIVE_LOCK_EXISTS` for a 2nd active booking; remove the `OVERLAP` error |
| `11` ADR | New ADR — single-active-appointment cap (re-introduces a per-patient constraint ADR-43 implicitly dropped; supersedes the No-Overlap rule) |
| `12` Test cases | Add single-active-appointment + pending-cancel TCs; retire any `OVERLAP`-specific TC |
| `13` Status | Update build state |

(Doc `04` Database is **not** impacted — no schema change. Final list is confirmed by the
post-implementation doc-impact check before any spec edit.)

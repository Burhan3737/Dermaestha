# Doctor appointments — time-based Upcoming / Past (mirror the patient)

| Field        | Value                                                      |
| ------------ | --------------------------------------------------------- |
| Status       | Design — approved verbally, pending written-spec review   |
| Date         | 2026-07-02                                                |
| Author       | Burhan (with agent)                                       |
| Skill        | superpowers:brainstorming                                 |
| Related docs | 02 (F05.02), 06 (D-02), 11 (ADR), 13                      |

---

## 1. Problem

The doctor's appointment view splits the default tab by **calendar day**, while the
patient's view splits by **time**. This inconsistency produces a concrete bug.

Current behaviour (`server/src/modules/appointment/service.js`):

- **Patient** (`:20-25`) — time-based:
  - **Upcoming** = `pending` OR (`confirmed` AND `slotEnd ≥ now`)
  - **Past** = (`confirmed` AND `slotEnd < now`) OR `cancelled`
- **Doctor** (`:69-79`) — calendar-day-based:
  - **Today** = `confirmed` AND `slotStart` within today's Karachi day `[00:00, 24:00)`
  - **History** = same `pastWhere` as the patient

**The bug:** a `confirmed` appointment that started earlier today and has already
ended (`slotEnd < now`) still matches `slotStart ∈ today`, so it stays under
**Today**. `DoctorToday.jsx:53` renders a **Cancel** button for every confirmed
non-history row, so the doctor can cancel an appointment that is already over. That
same appointment *also* appears under **History** (because `slotEnd < now`), so it is
both duplicated and wrongly actionable.

## 2. Goal

Give the doctor the **same time-based Upcoming / Past split as the patient**, so an
ended appointment moves to Past (read-only) and the two roles behave consistently.

## 3. Design

### 3.1 Semantics

The doctor view adopts the patient's split verbatim:

| Tab          | Rule                                              | Sort            |
| ------------ | ------------------------------------------------- | --------------- |
| **Upcoming** | `pending` OR (`confirmed` AND `slotEnd ≥ now`)    | slot time asc   |
| **Past**     | (`confirmed` AND `slotEnd < now`) OR `cancelled`  | slot time desc  |

Because this is byte-for-byte the patient's `upcomingWhere` / `pastWhere`, both roles
now share those two `where` fragments. **`pending` appointments become visible to the
doctor** (they were previously never shown) — deliberately, so the doctor knows a slot
is booked but not yet payment-confirmed. Pending rows are **inert** for the doctor: no
Join Call, no Write-prescription, no Cancel — badge + note only.

### 3.2 Role separation is preserved

Sharing the time-split rule does **not** merge the two result sets. The ownership
filter and the `include` stay role-specific:

```js
const stateWhere = scope === 'history' ? pastWhere(now) : upcomingWhere(now);
// patient: all of the patient's appointments, across every doctor
where: { patientUserId: userId, ...stateWhere }   // include: doctor detail
// doctor:  all of the doctor's appointments, across every patient
where: { doctorId: doctor.id, ...stateWhere }      // include: patient name
```

- **Patient** sees only their own rows, with doctor detail attached (`toPatientRow`).
- **Doctor** sees only their own rows, with the patient's name attached.
- No cross-role leakage; the only thing shared is the "is this upcoming or past?"
  boolean logic.

### 3.3 Call-window rule (confirmed)

Unchanged and already correct. **Join Call activates 10 minutes before slot start**
(doc 02 F05.03 Join-Activation Rule) and stays live through **slot-end + 5 min** (video
token window, doc 15 §3.4). `DoctorToday.jsx:45-47` already implements exactly this.

## 4. Changes

### 4.1 Server — `server/src/modules/appointment/service.js`

- In `listForRole`, delete the doctor-specific Karachi-day branch (`:69-79`
  `todayYMD`/`dayStart`/`dayEnd` and the day-window `where`). Both roles use the shared
  `upcomingWhere(now)` / `pastWhere(now)` fragments; the doctor branch keeps its
  `doctorId` ownership filter and its patient-name `include`.
- The doctor row mapping (`:85-94`) already returns `state`, so `pending` rows flow
  through with no new fields.
- No import removals — the `date-fns-tz` / `tz` helpers stay (still used by `lockSlot`).

### 4.2 Client — `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx`

- Delete the client-side `karachiDay` day-filter (`:25`) and the `karachiDay` helper
  (`:11-12`); render `rows = all` (the server already scopes correctly).
- **Tabs:** relabel `Today → Upcoming` and `History → Past`. Routes stay `/doctor` and
  `/doctor/history` (mirrors the patient, whose route is `/appointments/history` but is
  labelled "Past"). Active-tab derivation from `pathname` is unchanged.
- **Headings / empty states:** `Today's appointments → Upcoming appointments`;
  `No appointments today. → No upcoming appointments.` Past side aligns to the patient
  wording (`Past appointments` / `No past appointments.`).
- **Dates:** Upcoming is now multi-day, so show full date+time (`formatKarachi`) instead
  of the time-only left column (`formatKarachiTime`), matching the patient's Upcoming
  rows.
- **Pending rows:** show the amber "Payment pending" badge + a help note
  "Awaiting payment confirmation"; no Join Call / Write-prescription / Cancel.
- **Confirmed rows:** unchanged — Join gate (−10 min → +5 min), Write prescription,
  Cancel.

### 4.3 Tests

- `client/test/unit/modules/doctor/views/DoctorToday/DoctorToday.test.jsx`
  - Update tab-label / heading assertions (`Today`/`History` → `Upcoming`/`Past`).
  - Add a case: a `pending` row shows the badge + note and **no** Join / Cancel.
- `server/test/unit/modules/appointment/service.test.js`
  - Add a doctor case: a `confirmed` appointment that ended earlier today is returned
    under **Past**, not under the default (upcoming) scope — the direct regression test
    for the reported bug.
  - Add a doctor case: a future `pending` row appears under the doctor's upcoming scope.

## 5. Out of scope

- No schema change.
- No change to the cancel service authorisation (`cancel` in the service already permits
  a doctor to cancel `pending`/`confirmed`; we simply do not surface a Cancel button for
  pending rows in the doctor UI).
- No route/sidebar/URL renames (sidebar item stays "Appointments" → `/doctor`).

## 6. Spec doc-impact (tracked; applied only at end, after approval)

- **Doc 02 — F05.02**: rewrite the "doctor today view" to the time-based Upcoming/Past
  model (mirrors F05.01/F08.01); note that `pending` appointments are visible-but-inert
  (badge only) for doctors. Version bump + revision footer.
- **Doc 11 — new ADR (next free `ADR-NN`)**: record the switch from calendar-day
  "Today" to time-based "Upcoming" for the doctor, superseding the "Today/History"
  framing of ADR-42 (the route-link tabs mechanism itself is unchanged).
- **Doc 13 — Status tracker**: update the D-02 line that reads "Today/History" to
  "Upcoming/Past".
- **Doc 06 — D-02**: verify the D-02 design section for any "Today" wording and align if
  needed (confirm during implementation).

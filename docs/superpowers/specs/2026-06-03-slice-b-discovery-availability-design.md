# Slice B — Discovery & Availability — Design

| Field      | Value                                                                 |
| ---------- | -------------------------------------------------------------------- |
| Date       | 2026-06-03                                                          |
| Status     | Approved (design); implementation pending                           |
| Scope      | M1+M2 Slice B of 4 (B — Discovery & Availability)                   |
| Canon refs | docs/specification 02 (F02, F09), 04, 05, 06, 08, 15               |
| Depends on | Slice A (auth, session Context, apiClient, components, TanStack Query) |

---

## 1. Scope

**In:**
- Doctor discovery: public listing (active-only, paginated) + public profile.
- Doctor weekly availability: read + replace blocks, with the edge-#14 block-with-bookings guard.
- 30-minute slot generation from weekly blocks (future-only + lead-time filter + active-appointment exclusion) and a `nextAvailableSlot` for listing cards.
- The three nav layouts (patient TopNav + BottomTabs; doctor/admin Sidebar).
- Seeded demo doctors (so discovery/availability are demoable; admin onboarding is M4).
- Screens **P-02 (listing)**, **P-03 (profile)**, **D-03 (availability grid)**.

**Out (later slices):**
- Booking slot-lock & payment, full P-06 → **Slice C**.
- Admin doctor-onboarding (A1/F10) & **P-01 Landing** → **M4**.

## 2. Decisions (locked with the user)

1. **Doctor seeding:** extend `prisma/seed.js` with 2–3 demo doctors (`User role=doctor` + argon2 dev password + `Doctor` profile + weekly `AvailabilityBlock`s).
2. **Layouts:** build all three now — `PatientLayout` (TopNav desktop + BottomTabs mobile-when-logged-in) and `SidebarLayout` (doctor/admin).
3. **Profile/booking boundary:** P-03 displays available slots; selecting one routes to a Slice-C placeholder (no lock/pay in B).
4. **Timezone:** use **`date-fns-tz`** server-side for `Asia/Karachi` → UTC slot generation; client display uses native `Intl.DateTimeFormat({ timeZone: 'Asia/Karachi' })` (no client TZ dep). Recorded as **ADR-21**.

## 3. Backend

### Files (model → controller → service)
- `server/src/services/doctor.service.js`
  - `listActiveDoctors({ page, pageSize })` → `{ data, page }`; filter `isActive === true && status === 'active'`; join `user.fullName`; card fields (`id, fullName, specialization, fee, photoUrl`) + computed `nextAvailableSlot` (ISO or null).
  - `getPublicDoctor(id)` → active-only profile (`fullName, specialization, fee, bio, photoUrl`); `404 NOT_FOUND` if missing/inactive (no existence leak).
- `server/src/services/availability.service.js`
  - `getWeeklyBlocks(doctorId)` → blocks `[{ weekday, startTime, endTime }]`.
  - `replaceWeeklyBlocks(userId, blocks)` → resolve doctor by `userId`; in a `$transaction`, **guard (edge #14)**: if any active future appointment (`state in slot_locked,confirmed,in_progress,completed,prescription_issued,cancelled_no_refund`) has a `slotStart` not covered by the new block set → `409 BLOCK_HAS_BOOKINGS` (list conflicting appointment IDs in `details`); else delete + recreate the doctor's blocks.
  - `generateSlots(doctorId, dateYMD)` → for the date's weekday, expand each block into 30-min `[slotStart, slotEnd)` instants via date-fns-tz (`zonedTimeToUtc`), then filter: `slotStart > now`, `slotStart >= now + minBookingLeadMinutes` (Settings), and exclude any with an active-state appointment at that `slotStart`. Returns `[{ slotStart, slotEnd }]` (UTC ISO).
  - `nextAvailableSlot(doctorId)` → scan up to 14 days, first available slot or null.
- `server/src/controllers/doctor.controller.js`, `availability.controller.js` (thin).
- Routes (doc 05): `GET /api/doctors` (public, paginated), `GET /api/doctors/:id` (public), `GET /api/doctors/:id/availability` (doctor-own/admin; non-owner → 404), `PUT /api/availability` (doctor; doctorId from session), `GET /api/doctors/:id/slots?date=YYYY-MM-DD` (public).
- `server/src/lib/tz.js` — thin date-fns-tz wrapper: `karachiWallTimeToUtc(dateYMD, "HH:mm")`, `KARACHI = 'Asia/Karachi'`.
- Shared Zod DTOs (`shared/schemas/availability.js`): `availabilityReplaceSchema` (array of `{ weekday: 0–6 int, startTime/endTime: /^\d{2}:\d{2}$/, start<end }`), `doctorListQuerySchema` (`page`,`pageSize` coerced, capped), `slotsQuerySchema` (`date` `YYYY-MM-DD`).

### Authorization
- Public routes: no session. `GET /:id/availability`: `requireRole('doctor','admin')`; doctor may read only their own (`:id` must equal their `Doctor.id`, else 404). `PUT /api/availability`: `requireRole('doctor')`.

## 4. Frontend
- Layouts: `client/src/layouts/PatientLayout.jsx` (`.topnav` + `.tabbar`, responsive; tabs only when logged-in patient) and `SidebarLayout.jsx` (`.sidebar` doctor links: Today/Availability/History → placeholders except Availability).
- Components: `DoctorCard.jsx` (`.doc-card`), `SlotButton.jsx` (`.slot`), `WeeklyAvailabilityGrid.jsx` (D-03), and `client/src/lib/format.js` `formatPkr(paisa)` + `formatKarachi(iso)` (native Intl).
- Views: **P-02** `DoctorListing` (`useQuery(['doctors',page])` → `DoctorCard` grid + empty state; public), **P-03** `DoctorProfile` (`useQuery(['doctor',id])` + `useQuery(['slots',id,date])`; day-tabbed slot grid; "Book" → `/book/:id?slot=` placeholder), **D-03** `AvailabilityGrid` (doctor-only `RoleRoute`; `useQuery(['availability'])` + `useMutation` PUT; renders `409 BLOCK_HAS_BOOKINGS` inline).
- Routing: `/` → `DoctorListing` (Browse, public); `/doctors/:id` → profile; `/doctor/availability` → D-03. Patient login now lands on `/`. The `/` placeholder from Slice A is replaced by the listing.

## 5. Testing (hybrid)
- **Unit (mocked Prisma + fixed clock):** slot generation (30-min increments, weekday mapping, lead-time filter, Karachi→UTC correctness via date-fns-tz, active-appointment exclusion), `replaceWeeklyBlocks` guard, `listActiveDoctors` active-only filter, `nextAvailableSlot`.
- **Integration (real DB, supertest, seeded):** `GET /doctors` returns active seeded doctors and excludes `pending`/`isActive=false`; inactive `:id` → 404; doctor logs in → `PUT /availability` → `GET /doctors/:id/slots` reflects the change; non-owner `GET /:id/availability` → 404.
- **Frontend (RTL):** listing renders cards (name/fee/next-slot); profile renders slots; D-03 select+save calls the mutation; `formatPkr`/`formatKarachi`.

## 6. Governance (light)
- **ADR-21** (doc 11): adopt `date-fns-tz` server-side for Karachi↔UTC; client uses native `Intl`. *(required)*
- **doc 03**: one-line tech-stack note for `date-fns-tz`. *(minor)*
- **doc 13**: status sweep on completion (F02, F09, doctor/availability modules, frontend rows). *(required)*
- No changes to docs 04/05/14/15 (routes + models already specified; seed is data).

## 7. Success criteria
A patient browses active doctors → opens a profile → sees real available slots that respect the lead-time and render correctly in `Asia/Karachi`; a logged-in doctor edits weekly availability and the generated slots change; the block guard blocks an orphaning edit; all server + client suites green.

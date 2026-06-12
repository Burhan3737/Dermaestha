# Slice G — Admin Panel (M4) — Design

| Field      | Value                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date       | 2026-06-12                                                                                                                                             |
| Status     | Approved (brainstorming output); plan + build pending                                                                                                  |
| Slice      | G of 8 (third of the four v1-completion slices E→F→G→H)                                                                                                |
| Depends on | Slice F — merged to `main` (server + client suites green)                                                                                              |
| Canon refs | F10, F11.01, F12, F13, F14, F15.01/.05 (DA1/DA5); doc 02 §3.3 #3/#5/#6/#8/#9/#10; doc 05 §F02/F10, §F11, §F12/F13/F14 route tables; doc 06 screens A-01…A-05 + sidebar/table/modal components; doc 08 (admin-only PII surfaces, DA6); glossary `disputed`, `mustChangePassword` |

---

## 1. Scope & goals

**Goal:** the admin panel complete against the spec — admin onboards/edits/deactivates doctors (with photo upload and DA5 password reset), manages the medicine catalogue UI, monitors a five-source alert feed with email re-trigger, searches the unified records & audit page (incl. dispute flagging), and tunes platform settings — all audit-logged, all behind `requireRole('admin')`.

**In scope**

1. **F10 backend (extends `server/src/modules/doctor/`):** `POST /api/doctors` (User+Doctor in one tx, admin-set initial password, `mustChangePassword=true`, Pending-State Rule), `PATCH /api/doctors/:id` (PMC/email immutable → 409 `IMMUTABLE_FIELD` #8), `POST …/deactivate` (no cascade, #9) / `…/reactivate`, `POST …/reset-password` (DA5), `POST …/photo` (multipart upload). Plus two admin reads/writes the doc 05 table omits but F10.01/.02 require: `GET /api/doctors?includeInactive=true` (admin-only param — all statuses + per-row `upcomingConfirmedCount` for the deactivation warning) and `PUT /api/doctors/:id/availability` (admin write of the weekly template, reusing `replaceWeeklyBlocks`; symmetric with the existing admin-readable GET).
2. **Photo upload infra:** multer (memory, 2MB cap), magic-byte JPEG/PNG/WebP validation (SVG rejected), `uploads/doctors/<doctorId>.<ext>` on local disk behind a named Docker volume (`dermestha_uploads:/app/uploads`), served via `express.static` before the SPA catch-all; `UPLOADS_DIR` env var.
3. **F13 backend (new `server/src/modules/admin/` read projections):** `GET /api/admin/records` (appointment-centric, F13.01 filter superset, paginated), `GET /api/admin/audit` (filtered audit query, paginated); `POST /api/appointments/:id/dispute` (flag toggle, in the appointment module).
4. **F12 backend:** `GET /api/admin/alerts` — live query, no new table: audit rows (`payment.reconciliation_mismatch`, `payment.refund_exhausted`, `email.send_failed_final`, `system.unhandled_exception`) + derived awaiting-prescription rows (`completed`, no prescription, slot end >12 h — same predicate as the D-02 badge, computed server-side). `POST /api/admin/emails/:jobId/resend` (failed jobs only → reset to `pending`; Email-Only Re-Trigger Rule). **Exception bridge:** `errorHandler` writes a `system.unhandled_exception` audit row (route + code in `meta`, no stack/PII) for non-`AppError` 500s, best-effort.
5. **F14 backend:** `GET`/`PUT /api/admin/settings` over the existing single row (id=1); Zod bounds (`minBookingLeadMinutes` ≥30, `fallbackFeePctBps` 0–10000, `fallbackFeeFixed` ≥0); audit `settings.updated` with old→new `meta`. Booking/refund code already reads the row live — no further wiring.
6. **F11.01 admin read:** `GET /api/medicines?includeInactive=true` (admin-only param) so A-02 can list and reactivate deactivated medicines; doctor calls unchanged.
7. **Client (`client/src/modules/admin/`):** five views under `SidebarLayout` (gains a `links` prop, doctor default unchanged) — A-01 doctors, A-02 medicines, A-03 alerts, A-04 records & audit (+ detail with transition history, prescriptions, dispute, resend), A-05 settings. Routes `/admin/*` behind `RoleRoute role="admin"`; `/admin` redirects to `/admin/doctors`; the `Placeholder` in `App.jsx` is replaced. One new shared component: `Pagination`.

**Out of scope (later slices)**

- Real PayFast/Daily.co adapters, analytics events, landing page, legal pages, final email template copy (Slice H).
- Sentry/DSN error-tracking wiring (the audit-row bridge covers the alert feed's need; the seam comment stays).
- Multi-admin, admin self-signup (v1 has exactly one bootstrapped admin, F15.04).
- Object storage for photos (volume is the v1 decision; revisit on multi-instance scale-out).

**Success criteria**

1. Existing server + client suites stay green; every new behavior lands test-first.
2. Onboard→first-login loop closes end-to-end in an integration test: admin creates doctor → doctor logs in → forced password change (DA3) → doctor panel reachable.
3. PMC/email edits are rejected at both schema and service layers (409 `IMMUTABLE_FIELD`).
4. Deactivation hides the doctor from the public listing and blocks new bookings while an existing `confirmed` appointment survives untouched (integration proof of #9).
5. A settings `PUT` visibly changes slot lead-time filtering on the very next slots request (no restart).
6. A forced-failed notification job is resent from A-03/A-04 and dispatched by the existing worker.
7. Photos survive `docker compose up --build` (volume proof, documented in doc 10).

---

## 2. Architecture & components

```
F10 doctor management (modules/doctor — same module, admin write surface added)
  POST /api/doctors                    ── tx: user.create(role=doctor, argon2id, mustChangePassword=true)
                                              + doctor.create(status=pending, isActive=false)   → audit doctor.created
  PATCH /api/doctors/:id               ── editable: fullName/phone/bio/specialization/fee
                                          pmcNumber|email present → 409 IMMUTABLE_FIELD (#8)    → audit doctor.updated
  POST /api/doctors/:id/deactivate     ── isActive=false only (count shown pre-confirm from list) → audit doctor.deactivated
  POST /api/doctors/:id/reactivate     ── isActive=true; pending→active on first activation     → audit doctor.reactivated
  POST /api/doctors/:id/reset-password ── DA5: hash admin-set password, mustChangePassword=true → audit doctor.password_reset
  POST /api/doctors/:id/photo          ── multer 2MB → magic-byte check → uploads/doctors/<id>.<ext>
                                          → photoUrl update                                     → audit doctor.photo_updated
  GET  /api/doctors?includeInactive=true ── admin-only param: all statuses + upcomingConfirmedCount
  PUT  /api/doctors/:id/availability   ── admin weekly-template write (reuses replaceWeeklyBlocks,
                                          BLOCK_HAS_BOOKINGS guard applies)                     → audit doctor.availability_updated

F12/F13/F14 admin surface (new modules/admin + one appointment route)
  GET  /api/admin/alerts    ── UNION: audit rows (4 alert eventTypes) + derived awaiting-prescription query
  POST /api/admin/emails/:jobId/resend ── failed → pending (attempts=0); worker re-dispatches   → audit admin.email_resend
  GET  /api/admin/records   ── appointment join (patient/doctor/payment), filter superset, paginated
  GET  /api/admin/audit     ── AuditLog filtered query, paginated
  POST /api/appointments/:id/dispute   ── disputed flag set/clear (not a transition)            → audit appointment.disputed / .dispute_cleared
  GET/PUT /api/admin/settings          ── single row id=1, bounded Zod                          → audit settings.updated

client/src/modules/admin/  (admin.routes.jsx → all under <RoleRoute role="admin">, SidebarLayout links prop)
  AdminDoctors (A-01) · AdminMedicines (A-02) · AdminAlerts (A-03) · AdminRecords (A-04) · AdminSettings (A-05)
  useAdmin.js — TanStack Query hooks + mutations; shared Pagination component (new)
```

Principles carried over: every admin mutation through `requireRole('admin')` + `validate()`; `audit.record()` on every write; `appointmentState.transition` untouched (dispute is a flag, not a state); 404-no-leak on unknown ids; alert feed and records are **read-only projections over existing tables**.

---

## 3. Data model & storage

**No schema changes and no migration** — `Doctor.photoUrl`, `Doctor.status` (pending/active), `User.mustChangePassword`, `Appointment.disputed`, `Settings` (id=1, seeded), `NotificationJob.status/attempts/lastError`, and `AuditLog` all already exist.

**New storage concern — uploads volume:**

```yaml
# docker-compose.yml (app service)
volumes: ['dermestha_uploads:/app/uploads']
```

`UPLOADS_DIR` (default `./uploads`) added to env config; backups must include the volume (doc 10 note). Filenames are server-generated (`<doctorId>.<ext>`) — no user-controlled path segments.

**New audit eventTypes:** `doctor.created`, `doctor.updated`, `doctor.deactivated`, `doctor.reactivated`, `doctor.password_reset`, `doctor.photo_updated`, `doctor.availability_updated`, `admin.email_resend`, `appointment.disputed`, `appointment.dispute_cleared`, `settings.updated`, `system.unhandled_exception`.

---

## 4. API contract notes (deltas vs doc 05)

| Item | Note |
| --- | --- |
| `GET /api/medicines?includeInactive=true` | New admin-only query param (A-02 needs deactivated rows to reactivate); doctors always get active-only. Doc 05 §F11 addition. |
| `GET /api/doctors?includeInactive=true` | Same pattern for A-01: admin-only param returns all statuses (`pending`/active/deactivated) + per-row `upcomingConfirmedCount` (future `confirmed` appointments) for the Deactivation-Warning Rule. Public callers unchanged. Doc 05 §F02/F10 addition. |
| `PUT /api/doctors/:id/availability` | Admin write of the weekly availability template (F10.01 optional input at onboarding, F10.02 editable field, F10.03 reactivate-uses-saved-template). Reuses `replaceWeeklyBlocks` incl. the `BLOCK_HAS_BOOKINGS` guard. Doc 05 §F09/F10 addition. |
| `POST /api/admin/emails/:eventId/resend` | Implemented as `:jobId` (the `notification_jobs` id — that is the failed artifact being retried). Doc 05 naming corrected in the sweep. |
| `POST /api/appointments/:id/dispute` | Body `{ disputed: boolean }` (set and clear through one route); doc 05 row gains the body shape. |
| New error codes | `IMMUTABLE_FIELD` (409), `PMC_TAKEN` (409), `INVALID_FILE` (400); `EMAIL_TAKEN` reused from auth. Resend on a non-failed job → 409 `INVALID_STATE`. |
| Deactivate response | Includes `upcomingConfirmedCount` for the A-01 warning modal (Deactivation-Warning Rule). |

---

## 5. Client design

- **A-01 Doctors:** all-doctors table (via `includeInactive=true`) with `pending`/`active`/`deactivated` badges; add form (all F10.01 fields incl. photo file input, initial password, and the optional weekly availability template — reusing the D-03 grid pattern wired to the admin availability route); edit form omits PMC/email entirely and shows the fee-snapshot note (F10.02); deactivate confirm modal shows the row's `upcomingConfirmedCount`; reset-password behind its own confirm. Photo upload is a follow-up multipart request after create/edit, with preview.
- **A-02 Medicines:** searchable table over `GET /api/medicines?includeInactive=true`; add/edit forms over the Slice F admin API; deactivate/reactivate via the `isActive` toggle.
- **A-03 Alerts:** newest-first feed cards, per-type badge, "View record" link to A-04 detail via `targetRef`; resend button only on `email.send_failed_final` alerts.
- **A-04 Records & audit:** filter bar (`.filters`) + `.table` + `Pagination`; row click opens detail — appointment summary, full transition history (audit scoped to the appointment), linked prescriptions, dispute toggle and email re-trigger each behind a confirm modal. Audit-log tab uses the same filter-bar pattern over `GET /api/admin/audit`.
- **A-05 Settings:** single `SectionCard` form, pre-filled, save behind a confirm modal (values steer money math and booking windows).
- **Chrome/routing:** `SidebarLayout` gains an optional `links` prop (default = current doctor links); admin link set has the five screens. `RoleRoute role="admin"` wraps all routes; client gating is convenience only — the server enforces DA6.

Reused as-is: `Button`, `Field`, `Card`/`SectionCard`, `Alert`, `Checkbox`, `.table`, `.filters`, `.badge--*`, `.modal-*` CSS. New: `Pagination` (shared), file input styling on `Field`.

---

## 6. Error handling & security

- All new routes speak the existing `AppError` → `errorHandler` envelope; multer errors (oversize/parts) are translated to 400 `INVALID_FILE`, never raw 500s.
- The `system.unhandled_exception` audit write is try/caught — an audit failure never masks the original error response.
- Photo pipeline: 2MB cap, magic-byte sniffing (extension and client MIME untrusted), SVG rejected (script-injection vector), server-generated filename (no traversal), static serving with no directory listing.
- Initial/reset passwords validated against the existing policy, hashed with the existing argon2id util, never logged, never in audit `meta`.
- Mutating admin routes get a modest rate limit via the existing `makeRateLimiter` factory.
- Records/audit/alerts are admin-only PII surfaces (doc 08); no new public exposure.

---

## 7. Testing

- **Unit (module-local `test.js`, mocked Prisma):** doctor-create tx shape + `mustChangePassword`; immutability rejection (schema + service); deactivate non-cascade + count; reset-password flag; photo magic-byte/size validation; alerts query composition (4 eventTypes + derived predicate); resend state-guard; settings bounds; medicines `includeInactive` gating by role.
- **Integration (`server/src/test/admin.integration.test.js`, real DB):** admin login → onboard doctor → new doctor login hits DA3 forced-change → change → panel reachable; PATCH with `pmcNumber` → 409; deactivate → public listing hides doctor, existing `confirmed` appointment intact, booking blocked; settings `PUT` → next slots request reflects new lead time; records/audit/alerts queries return seeded events; forced-failed job → resend → worker dispatch.
- **Client (colocated `*.test.jsx`, mocked api + session):** edit form omits PMC/email; deactivate modal shows count; resend gated to failed alerts; settings bounds errors render; role gating redirects non-admins.
- Test-case IDs map to doc 12 F10–F14 sections (new TC rows added in the sweep).

---

## 8. Spec-suite impact (proposed; edited only with explicit user approval, doc 00 protocol)

| Doc | Change |
| --- | --- |
| 02  | F11.01: admin list may include inactive rows (`includeInactive`) |
| 05  | `includeInactive` params (medicines + doctors); `PUT /api/doctors/:id/availability` (admin); dispute body shape; `:eventId`→`:jobId`; new error codes |
| 08  | Photo-upload controls (magic-byte, 2MB, SVG rejection); uploads static serving |
| 10  | `dermestha_uploads` volume + backup note; uploads dir in deploy steps |
| 11  | New ADR: photo storage on local volume; audit-row exception bridge (in lieu of error-tracking tool for F12.01 source #5) |
| 12  | New TC rows for F10/F12/F13/F14 |
| 13  | Status sweep after merge (M3 → done via A-02; M4 progress) |
| 15  | `UPLOADS_DIR` env var |

---

## 9. Key decisions

| # | Decision | Choice (user-approved 2026-06-12) |
| - | --- | --- |
| 1 | Slice sizing | One big Slice G (full admin panel), not split |
| 2 | Photo storage | Local disk + named Docker volume; multer memory → magic-byte check → disk; static serve. Object storage deferred to scale-out |
| 3 | F12.01 exceptions source | Audit-row bridge (`system.unhandled_exception` from `errorHandler`); Sentry wiring stays a separate later item |
| 4 | Build order | Vertical, scaffold-first: A-02 medicines (UI-only) → F10+A-01 doctors → F13+A-04 records → F12+A-03 alerts → F14+A-05 settings |
| 5 | Alert feed storage | Live query over audit rows + derived awaiting-prescription; no dedicated alerts table (resolves the question Slice E deferred) |
| 6 | Email re-trigger semantics | Reset the failed job to `pending` (attempts 0); existing worker dispatches — no parallel send path |

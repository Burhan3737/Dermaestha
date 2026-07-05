# Superadmin Role — Design (Plumbing Cycle)

| Field        | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Date         | 2026-07-05                                                            |
| Status       | Draft — awaiting user review                                          |
| Topic        | Introduce a `superadmin` role as a functional clone of `admin`        |
| Cycle scope  | Plumbing only. No new superadmin-only surfaces. Restricting `admin` is deferred to a later cycle. |
| Skill        | superpowers:brainstorming (opted in)                                  |

---

## 1. Goal & principle

Introduce a `superadmin` role that this cycle behaves **exactly like `admin`** — same tabs, same routes, same capabilities. The point of the work is to lay the plumbing (the role value, the authorization sites, an account to log in with) so that a **later cycle** can restrict `admin` by moving individual routes/tabs to superadmin-only.

**Authorization principle — explicit per-route role lists, no central hierarchy.**
The server's `requireRole(...)` is already variadic (`allowed.includes(user.role)`). We add `superadmin` **explicitly** to every server site that admits `admin`, rather than teaching the middleware that "superadmin implicitly outranks admin." Rationale (user decision): a central hierarchy makes one future case impossible to express — a route that should be admin-only and *not* superadmin. Explicit per-route lists can express every future split (`admin`-only, `superadmin`-only, or both) as a one-line change per route, and each route self-documents its allowed set.

**Accepted tradeoff:** we touch ~27 server sites now instead of one middleware, and a missed site silently drops superadmin's access there. Mitigation: the change set below is the *verified, exhaustive* inventory (two independent read-only agents), and tests assert both the allow and deny paths.

---

## 2. Data model (prerequisite — schema change → migration)

- `prisma/schema.prisma` `enum Role { patient, doctor, admin }` → add `superadmin`.
  Without this, no user row can hold `role='superadmin'` and every change below is inert.
- `enum AuditActorType { patient, doctor, admin, system }` — **unchanged** (see §5).
- Migration mechanism (new additive migration vs. regenerate the consolidated baseline via the
  `dermestha-migration-reset` skill) is a decision for the implementation plan; it depends on the
  deployment state. Not decided here.

---

## 3. Server authorization changes (the core of this cycle)

### 3a. `requireRole(...)` call sites — append `'superadmin'` (23 calls, 6 files)

The middleware itself (`server/src/middleware/requireRole/requireRole.js`) needs **no logic change** — only its JSDoc `@param` union gains `'superadmin'` (cosmetic). Every call below that includes `'admin'` gains `'superadmin'` as the last argument:

| File | Lines | Current → New |
| --- | --- | --- |
| `server/src/modules/admin/index.js` | 28, 30, 32, 34, 36, 38, 39, 41, 42 | `requireRole('admin')` → `requireRole('admin', 'superadmin')` |
| `server/src/modules/doctor/index.js` | 64, 65, 66, 67, 68, 69, 70 | `requireRole('admin')` → `requireRole('admin', 'superadmin')` |
| `server/src/modules/doctor/index.js` | 61 | `requireRole('doctor', 'admin')` → `requireRole('doctor', 'admin', 'superadmin')` |
| `server/src/modules/medicine/index.js` | 31, 33 | `requireRole('admin')` → `requireRole('admin', 'superadmin')` |
| `server/src/modules/medicine/index.js` | 24 | `requireRole('doctor', 'admin')` → `requireRole('doctor', 'admin', 'superadmin')` |
| `server/src/modules/appointment/index.js` | 21 | `requireRole('patient', 'doctor', 'admin')` → `+ 'superadmin'` |
| `server/src/modules/prescription/index.js` | 12 | `requireRole('patient', 'doctor', 'admin')` → `+ 'superadmin'` |
| `server/src/modules/auth/index.js` | 69 | `requireRole('patient', 'doctor', 'admin')` → `+ 'superadmin'` |

`requireRole` calls that do **not** include `admin` (e.g. `appointment/index.js:24` cancel = `('patient','doctor')`, `doctor/index.js:76`, `prescription/index.js:10`) are deliberately left unchanged — superadmin must not gain patient/doctor-scoped routes.

### 3b. In-body role checks — REQUIRED (route guard alone is insufficient)

A superadmin that passes the route guard still fails these in-handler checks unless updated:

| File:line | Check | Effect if unfixed | Fix |
| --- | --- | --- | --- |
| `server/src/modules/appointment/service.js:109` | `role === 'admin'` in the `getForRole` visibility OR-chain | superadmin gets **404** on `GET /appointments/:id` | admit superadmin (e.g. `['admin','superadmin'].includes(role)`) |
| `server/src/modules/prescription/service.js:126` | `role === 'admin'` in `listByAppointment` visibility | superadmin gets **404** on prescription list | admit superadmin |
| `server/src/modules/doctor/controller.js:12` | inverted `req.session?.role !== 'admin'` gating `includeInactive` | superadmin gets **403** on the inactive-doctor listing | block only when role is neither admin nor superadmin |
| `server/src/modules/medicine/controller.js:8` | inverted `includeInactive && role !== 'admin'` | superadmin gets **403** on inactive-medicine view | block only when role is neither admin nor superadmin |

### 3c. Deliberate NON-changes

- `server/src/modules/notification/service.js:102` — `findFirst({ where: { role: 'admin' } })` selects the
  **recipient** of the "payment submitted" alert email. This is recipient selection, not authorization.
  Left as-is: alerts continue routing to the `admin` account. (Revisit only if the product later wants
  superadmins to also receive these alerts.)

---

## 4. Validation schema

- `shared/schemas/auth/auth.js:16` — `loginSchema.role: z.enum(['patient','doctor','admin']).optional()`.
  Add `'superadmin'`. The field is an optional, non-authoritative hint, but if a superadmin login form
  submits `role='superadmin'` the request would be **400-rejected** before auth runs.
- `shared/schemas/admin/admin.js:29` — `auditQuerySchema.actorType: z.enum([...,'system'])`. **No change**
  (consistent with §5: no `superadmin` actor-type value is ever written, so there is nothing to filter by).

---

## 5. Audit `actorType` — coerce superadmin → admin (blocker fix + consistency)

`AuditLog.actorType` is the DB enum `AuditActorType` (`patient/doctor/admin/system`). The write in
`audit.service.js` is **awaited with no catch**, so persisting an out-of-enum value **throws** (it does
not silently store). Three audit writes derive the actor type from the live session role and are
reachable by a superadmin:

| File:line | Path | Reachable by superadmin? |
| --- | --- | --- |
| `server/src/modules/auth/service.js:52` | **login** | **Yes — hard blocker.** Every successful login writes `actorType: user.role`. A superadmin's first login would write `'superadmin'` → Prisma throws → **login 500s**. Superadmin could never authenticate. |
| `server/src/modules/auth/service.js:99` | resetPassword | Yes (public reset flow) |
| `server/src/modules/auth/service.js:118` | changePassword | Yes (shared route, dual-listed in §3a) |

`appointment/controller.js:63` (`actorType: req.session.role`, self-service cancel) is **not** reachable —
its route is `('patient','doctor')` and is not dual-listed.

**Decision:** coerce the role to an actor type at these three sites, e.g.
`actorType: user.role === 'superadmin' ? 'admin' : user.role`.

**Why coerce rather than add `superadmin` to `AuditActorType`:** the admin-action flows already
hard-code `actorType: 'admin'` (doctor/medicine/appointment/admin services). Coercion makes the whole
audit trail *uniformly* attribute a superadmin-acting-as-admin to `'admin'` — no split identity, no enum
migration, no audit-filter schema change. Adding the enum value would be more "truthful" but splits
superadmin actions across two actor types (`'admin'` for hard-coded flows, `'superadmin'` for auth flows),
which is inconsistent and larger surface. Recorded as a known deviation: superadmin actions are audited as
`actor_type='admin'` with the superadmin's `actor_id`.

`actorType: 'admin'` hard-coded writes (doctor/admin.service.js, admin/service.js, medicine/service.js,
appointment/service.js) are **unchanged** — a superadmin running those flows already logs as `'admin'`.

---

## 6. Client (unchanged from prior agreement — recap)

- `RoleRoute.jsx` — widen the `role` prop to accept a string **or** an array (non-breaking for existing
  `role="doctor"`/`"patient"` guards); the admin routes centralize through one `guard` helper in
  `admin.routes.jsx`, so set that single guard to `['admin','superadmin']`.
- `Login.jsx` (and `SignUp.jsx` for parity) — add `superadmin: '/admin'` to the `DASHBOARD` map so a
  superadmin lands on the admin dashboard instead of falling through to `/`.
- The client is a convenience guard only; the server (§3) is the sole authorization boundary.

---

## 7. Account creation & seed

- `prisma/scripts/bootstrap-admin.js` — extend so a single run creates **both** an admin and a superadmin,
  each independently idempotent (skip if a user of that role already exists):
  - admin ← `ADMIN_EMAIL` / `ADMIN_PASSWORD` (unchanged)
  - superadmin ← `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (new)
  Keeps the DA4 pattern (no self-signup, no admin-creates-admin UI). Filename kept to limit doc churn.
- `prisma/scripts/seed-baseline.js` — add `baseline.superadmin@dermestha.test` (password `Test123!`) to the
  local dev baseline and its printed accounts list, so the hierarchy can be exercised in dev/e2e.

---

## 8. Tests (TDD)

- `requireRole` unit — superadmin passes an `admin`-listed route; superadmin **rejected** from a
  `doctor`/`patient`-only route; admin/doctor/patient behavior unchanged.
- `RoleRoute` unit — superadmin renders an admin-guarded element; non-admin roles still redirect.
- In-body visibility — superadmin can `GET /appointments/:id` and the prescription list without a 404;
  superadmin can use `includeInactive` on doctors and medicines without a 403.
- Auth actorType — a superadmin **login succeeds** and writes an audit row with `actor_type='admin'`.
- Bootstrap — running the script creates both accounts; re-running is a no-op for each.

**Success criteria:** superadmin logs in → lands on `/admin` → sees all 6 admin tabs → reaches every
`/api/admin/*` route and every admin-shared route → is blocked from doctor/patient-only routes → their
audited actions record `actor_type='admin'`; all existing admin/doctor/patient tests still pass.

---

## 9. Spec-suite doc-impact (docs/specification/ — tracked, applied only at END after approval)

Per CLAUDE.md, these are recorded now and applied only after code is committed and the user approves,
following the change-impact matrix in doc 00. Server-side scope:

- **04 DATABASE** — `Role` enum now has 4 values (`superadmin`). (Schema change → 04 first.)
- **05 API** — role requirements: superadmin admitted on all admin routes + admin-shared routes (explicit
  dual-listing).
- **08 SECURITY** — access-control role table gains `superadmin`; note the explicit-dual-listing model
  (no hierarchy), the in-body admin checks that also admit superadmin, and the audit `actorType`
  coercion (superadmin actions logged as `admin`).
- **11 ADR** — new ADR: "Superadmin as an explicit-dual-listed admin clone (no central role hierarchy);
  audit actor coercion superadmin→admin."
- **12 TEST CASES** — new cases for superadmin allow/deny + login-audit.
- **13 STATUS** — build-progress entry.
- **15 CONFIG** — new env vars `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (bootstrap).

---

## 10. Open decisions for the implementation plan

1. Migration mechanism (new additive migration vs. baseline regenerate via `dermestha-migration-reset`).
2. Confirm the audit `actorType` coercion (§5) is the desired trail semantics (recommended) vs. adding the
   enum value.

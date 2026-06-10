# Folder-Structure Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, with checkpoints) to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax.
> **Spec:** `docs/superpowers/specs/2026-06-10-folder-restructure-design.md` (the authoritative target structure + decisions D1–D16). Read it first.

**Goal:** Reorganize `client/`, `server/`, and `shared/schemas/` into the feature-first structure in the spec — pure relocation, no behavior/API/schema/dependency change.

**Architecture:** Client = `context/` + feature `modules/<f>/{views,components,use<F>.js,*.routes.jsx}` + `shared/` + `layouts/` + `lib/`. Server = `modules/<domain>/{index,controller,service,test}.js` + `services/audit/` + flat infra (`config http lib middleware integrations workers`) + `health/ dev/ test/` + central `routes.js`. Shared Zod schemas per-domain under `shared/schemas/`.

**Tech Stack:** Node/Express (ES modules, `// @ts-check`+JSDoc), Prisma, React 18 + Vite + react-router + TanStack Query, Zod, Vitest.

---

## Verification model (the gate)

**Two vitest suites — BOTH must be green at every gate:**
- Server + shared: `npm test` (run from repo root)
- Client: `npm --workspace client run test`
- Final only: `npm run build:client` (Vite build resolves every client import path)

This is a **relocation**, so the rule is: **green → move + rewrite imports → green.** No new tests; the one sanctioned test-internals edit is the R1 `vi.spyOn` rewrite (Phase 2 / Task 1d).

**Commits are GATED** (CLAUDE.md: no branch/push/commit without explicit human approval). Do NOT commit per task. Leave all changes in the working tree; the final step asks the human about committing.

**Spec edits (doc 03 + ADR-26) are GATED** — Phase 6 is NOT executed; it's presented for approval.

---

## Phase 0: Baseline

- [ ] **Step 1: Confirm both suites green before touching anything.**
  - Run: `npm test` → Expected: all server+shared tests PASS. Record the count.
  - Run: `npm --workspace client run test` → Expected: all client tests PASS. Record the count.
  - If the server integration tests in `server/src/test/` need a DB and it's unreachable, record which subset is the gate and apply it consistently every phase.

---

## Phase 1: Server — four simple modules + infra + routes.js

> Order inside the phase: 1a audit → 1b infra grouping → 1c–1f modules → 1g routes.js. Rationale: land the widest import rewrites (audit, infra) before module moves add another `../`.

### Task 1a: audit → services/audit/
**Files:** move `server/src/services/audit.service.js` → `server/src/services/audit/audit.service.js`; `server/src/services/audit.service.test.js` → `server/src/services/audit/audit.service.test.js`.

- [ ] Move both files (self-import inside the test stays `./audit.service.js`).
- [ ] Rewrite every importer of `audit.service.js` to the new path. Importers (verify with `Grep "audit.service" server/src`): `routes/auth.js`, `controllers/webhook.controller.js`, `services/auth.service.js`, `services/booking.service.js`, `services/appointmentState.service.js`, `services/refundSideEffects.js`, `services/evaluation.service.js`, and the `vi.mock('./audit.service.js')` paths in `auth.service.test.js`, `booking.service.test.js`, `appointmentState.service.test.js`, `evaluation.service.test.js`, `cancellation.service.test.js`. For files still in `services/`, the new path is `./audit/audit.service.js`.
- [ ] **Verify:** `npm test` → green.

### Task 1b: Infra folder-grouping (lib, middleware, config/env, http/errorHandler)
**Files (move js + co-located test into a same-named folder):**
- `lib/`: `logger.js`→`lib/logger/logger.js`; `prisma.js`→`lib/prisma/prisma.js`; `errorTracking.js`→`lib/errorTracking/errorTracking.js`; `password.js`+`password.test.js`→`lib/password/`; `resetToken.js`(+test)→`lib/resetToken/`; `tz.js`(+test)→`lib/tz/`.
- `middleware/`: each of `mustChangePassword`(+test), `rateLimit`, `requireRole`(+test), `session`, `validate`(+test) → `middleware/<name>/<name>.js`(+test).
- `config/`: `env.js`+`env.test.js`→`config/env/`. **Keep `config/constants.js` flat.**
- `http/`: `errorHandler.js`+`errorHandler.test.js`→`http/errorHandler/`. **Keep `http/AppError.js` flat.**

- [ ] Move all the above.
- [ ] Rewrite importers. Surface (≈56 files; verify with `Grep "lib/prisma|lib/logger|lib/password|lib/resetToken|lib/tz|lib/errorTracking|middleware/|config/env|http/errorHandler" server/src`): every `'../lib/prisma.js'`→`'../lib/prisma/prisma.js'`, `'../middleware/validate.js'`→`'../middleware/validate/validate.js'`, `'../config/env.js'`→`'../config/env/env.js'`, `'../http/errorHandler.js'`→`'../http/errorHandler/errorHandler.js'`, etc. `index.js` imports several of these directly.
- [ ] **Verify:** `npm test` → green.

### Task 1c: auth module
**Files:** `controllers/auth.controller.js`→`modules/auth/controller.js`; `services/auth.service.js`→`modules/auth/service.js`; `services/auth.service.test.js`→`modules/auth/test.js`; `routes/auth.js`→`modules/auth/index.js`.

- [ ] Move the four files.
- [ ] Fix internal imports for new depth: `index.js` imports `./controller.js`; `controller.js` imports `./service.js`; infra now `../../lib/...`, `../../http/...`, `../../config/...`, `../../middleware/...`, audit `../../services/audit/audit.service.js`, schemas `../../../shared/schemas/index.js`.
- [ ] **Verify:** `npm test` → green.

### Task 1d: doctor module (absorbs availability, D10)
**Files:** `controllers/doctor.controller.js`→`modules/doctor/controller.js`; **MERGE** `services/doctor.service.js` + `services/availability.service.js`→`modules/doctor/service.js`; **MERGE tests** `services/doctor.service.test.js` + `services/availability.service.test.js` + `services/availability.expiry.test.js`→`modules/doctor/test.js`; **two routers** `routes/doctors.js` + `routes/availability.js`→`modules/doctor/index.js`.

- [ ] Concatenate `doctor.service.js`+`availability.service.js` into `modules/doctor/service.js`; dedupe shared imports; `doctor.service`'s `import { nextAvailableSlot } from './availability.service.js'` becomes an intra-file call.
- [ ] Concatenate the three test files into `modules/doctor/test.js`. **R1 here:** `doctor.service.test.js` does `vi.mock('./availability.service.js')` for `nextAvailableSlot` — now intra-file, so switch that to `vi.spyOn(<merged service module>, 'nextAvailableSlot')`. Assertions unchanged.
- [ ] `modules/doctor/index.js` exports BOTH the `/api/doctors/*` router and the `PUT /api/availability` router (controller methods unchanged, incl. `replaceAvailability`).
- [ ] Re-point cross-module importers whose dependency just moved: `services/booking.service.js` `generateSlots` import → `../doctor/service.js`; `booking.service.test.js` `vi.mock('./availability.service.js')` → `../doctor/service.js`.
- [ ] **Verify:** `npm test` → green.

### Task 1e: payment module + payfast webhook split
**Files:** `services/payment.service.js`→`modules/payment/service.js`; `payment.service.test.js`→`modules/payment/test.js`; split `controllers/webhook.controller.js` `payfast` handler→`modules/payment/controller.js`; NEW `modules/payment/index.js` owns `POST /api/webhooks/payfast`.

- [ ] Move payment service + test; move the `payfast` handler (+ its `paymentProvider`/`audit`/`AppError`/`logger`/`paymentService` imports) into `modules/payment/controller.js`.
- [ ] `payment.service.js`'s `transition` import (`./appointmentState.service.js`) → `../../services/appointmentState.service.js` for now (re-pointed in Phase 2); update `payment.service.test.js` `vi.mock` path in lockstep.
- [ ] **Verify:** `npm test` → green.

### Task 1f: video module + daily webhook split
**Files:** `services/video.service.js`→`modules/video/service.js`; `video.service.test.js`→`modules/video/test.js`; split `controllers/webhook.controller.js` `daily` handler→`modules/video/controller.js`; the `daily` part of `controllers/webhook.controller.test.js`→`modules/video/test.js`; NEW `modules/video/index.js` owns `POST /api/webhooks/daily`. Then DELETE the emptied `controllers/webhook.controller.js` + `routes/webhooks.js`.

- [ ] Move video service+test; move `daily` handler into `modules/video/controller.js`; relocate the webhook controller test's `daily` assertions into `modules/video/test.js` (imports → `./service.js`, `./controller.js`).
- [ ] Delete `controllers/webhook.controller.js` and `routes/webhooks.js` once empty.
- [ ] **Verify:** `npm test` → green.

### Task 1g: health + dev + routes.js + index.js
**Files:** `routes/health.js`→`health/index.js`; `routes/devCheckout.js`→`dev/devCheckout.js`; `routes/devVideo.js`→`dev/devVideo.js`; NEW `server/src/routes.js`; edit `server/src/index.js`.

- [ ] Move health + dev files. Update dev imports: devCheckout → `../modules/payment/service.js`; devVideo → `../modules/video/service.js` and (evaluation) `../services/evaluation.service.js` (re-pointed Phase 2).
- [ ] Create `server/src/routes.js` exporting `registerRoutes(app)` reproducing `index.js`'s current mount block byte-for-byte: `mustChangePasswordGate`, `authRouter` (`modules/auth/index.js`), `doctorsRouter`+`availabilityRouter` (`modules/doctor/index.js`), `appointmentsRouter` (still old path until Phase 2), payfast+daily webhook routes (payment/video module index), `healthRouter`, the `/api` 404, and the conditional `dev` mounts (`PAYMENT_PROVIDER==='mock'`, `VIDEO_PROVIDER==='mock'`).
- [ ] Edit `index.js`: replace the inline router imports + `app.use(...)` block with `import { registerRoutes } from './routes.js'` + `registerRoutes(app)`. Keep `express.json`, `sessionMiddleware`, static SPA + catch-all, `errorHandler`, and the direct-run `startWorkers()` block.
- [ ] Re-point appointment-cluster deps that moved this phase but whose files move in Phase 2: `controllers/appointment.controller.js` `payment.service`→`../modules/payment/service.js`, `video.service`→`../modules/video/service.js`.
- [ ] **Verify:** `npm test` → green.

---

## Phase 2: Server — appointment merge (HIGH RISK, own gate)

### Task 2a: Merge 7 services → modules/appointment/service.js
**Files:** `controllers/appointment.controller.js`→`modules/appointment/controller.js`; MERGE `appointment.service.js`, `booking.service.js`, `appointmentState.service.js`, `cancellation.service.js`, `refund.service.js`, `refundSideEffects.js`, `evaluation.service.js`→`modules/appointment/service.js`; then delete the 7 source files.

- [ ] Concatenate the 7 service bodies into `modules/appointment/service.js`. Collapse intra-cluster imports to local calls (`quoteRefund`, `transition`, `safeRefund`). Dedupe duplicate imports (`prisma`, `AppError`, `audit`, `logger`, zod). **R2:** verify no private helper/const name collisions before deleting sources.
- [ ] Surviving cross-module imports in the merged file: `generateSlots` from `../doctor/service.js`; `record` from `../../services/audit/audit.service.js`; infra `../../lib/...`, `../../http/AppError.js`.
- [ ] `modules/appointment/controller.js`: re-point service imports to `./service.js` (`bookingService.lockSlot`, `appointmentService.list/get`, `cancellationService.cancel`); `paymentService`→`../payment/service.js`, `videoService`→`../video/service.js`.
- [ ] NEW `modules/appointment/index.js`: the `/api/appointments/*` routes (was `routes/appointments.js` — move its router here, incl. the `payLimiter`).

### Task 2b: Merge 6 tests → modules/appointment/test.js + R1 spyOn rewrite
**Files:** MERGE `appointment.service.test.js`, `booking.service.test.js`, `appointmentState.service.test.js`, `cancellation.service.test.js`, `refund.service.test.js`, `evaluation.service.test.js`→`modules/appointment/test.js`.

- [ ] Concatenate the 6 test files.
- [ ] **R1 (approved):** rewrite the now-intra-file mocks from `vi.mock('<sibling module>')` to `vi.spyOn(<merged service>, fn)` — same assertions: `appointment.service.test`'s mock of `refund.quoteRefund`; `cancellation.service.test`'s mocks of `appointmentState.transition` + `refund`; `evaluation.service.test`'s mocks of `appointmentState.transition` + `refundSideEffects.safeRefund`.

### Task 2c: Re-point external importers + delete sources
- [ ] `workers/index.js`: `../services/evaluation.service.js`→`../modules/appointment/service.js`.
- [ ] `dev/devVideo.js`: evaluation import→`../modules/appointment/service.js`.
- [ ] `modules/payment/service.js`: `transition`→`../appointment/service.js` (and `payment/test.js` `vi.mock` path likewise — this seam stays cross-module, survives).
- [ ] `server/src/test/video.integration.test.js`: `import('../services/evaluation.service.js')`→`../modules/appointment/service.js`.
- [ ] Delete the 7 emptied `services/*.service.js` + `refundSideEffects.js`.
- [ ] **Verify:** `npm test` → green (incl. `server/src/test/*.integration.test.js` + `doubleBooking.test.js`).

---

## Phase 3: shared/schemas reorg (Option A)

### Task 3a: Per-domain schema folders + barrel
**Files:** `shared/schemas/auth.js`→`auth/auth.js`; `availability.js`→`doctor/doctor.js` (holds `doctorListQuerySchema`, `slotsQuerySchema`, `availabilityBlockSchema`, `availabilityReplaceSchema`); `booking.js`→`appointment/appointment.js`; `booking.test.js`→`appointment/appointment.test.js` (its `import './booking.js'`→`./appointment.js`); rewrite `shared/schemas/index.js` barrel.

- [ ] Move/rename the schema files into domain folders.
- [ ] `shared/schemas/index.js`: `export * from './auth/auth.js'; export * from './doctor/doctor.js'; export * from './appointment/appointment.js';`.
- [ ] Server importers use the **barrel** (`.../shared/schemas/index.js`) — confirm `modules/auth/index.js`, `modules/doctor/index.js`, `modules/appointment/index.js` still resolve the barrel path at their new depth. No per-file schema path churn (R9).
- [ ] **Verify:** `npm test` → green (`shared/**/*.test.js` covers `appointment.test.js`).

---

## Phase 4: Client — context, modules, lib, routing, hooks

### Task 4a: lib grouping
**Files:** `lib/apiClient.js`+`apiClient.test.jsx`→`lib/apiClient/`; `format.js`+`format.test.jsx`→`lib/format/`; `queryClient.js`→`lib/queryClient/`; `RoleRoute.jsx`+`RoleRoute.test.jsx`→`lib/RoleRoute/`.
- [ ] Move; rewrite importers (`Grep "lib/apiClient|lib/format|lib/queryClient|lib/RoleRoute" client/src`): 16 files import `apiClient`; format importers (Booking, DoctorCard, SlotButton, DoctorToday, DoctorProfile, Upcoming, CancelModal); `main.jsx`/`App.jsx` for queryClient/RoleRoute.
- [ ] **Verify:** `npm --workspace client run test` → green.

### Task 4b: context/session (STATE only) + AppProviders (D15/D16)
**Files:** `lib/session.jsx`→`context/session/session.jsx` (strip to state); `lib/session.test.jsx`→`context/session/session.test.jsx`; NEW `context/AppProviders.jsx`; edit `main.jsx`.
- [ ] In `context/session/session.jsx` keep `SessionContext`, `SessionProvider` (`session`/`loading`/`refresh`/`setSession`), `useSession`. **Remove** `login`/`signup`/`logout` from the context value (they move to `useAuth`, Task 4c).
- [ ] `context/session/session.test.jsx` tests state only (renders `/auth/me`) — stays valid; just fix its `import './session.jsx'`. No net-new tests.
- [ ] NEW `context/AppProviders.jsx`: composes `QueryClientProvider client={queryClient}` (from `../lib/queryClient/queryClient.js`) → `BrowserRouter` → `SessionProvider`.
- [ ] `main.jsx`: `<AppProviders><AppRoutes/></AppProviders>` (drop the 4 inline providers; keep StrictMode + the two `styles/*.css` imports).
- [ ] Rewrite `useSession`/`SessionProvider` importers (≈14 files; `Grep "lib/session" client/src` + the per-test `vi.mock('../lib/session.jsx')`): `App.jsx`, `layouts/PatientLayout.jsx`, views `VideoRoom`/`SignUp`/`Login`/`ChangePassword`/`AvailabilityGrid`, and test mocks in `VideoRoom`/`Upcoming`/`PaymentReturn`/`Booking`/`DoctorToday`/`AvailabilityGrid`/`DoctorProfile`/`DoctorListing`/`Login`/`SignUp`. (These paths will be recomputed again as views move in 4c–4e — easiest to do the session-path fix as each view lands.)
- [ ] **Verify:** `npm --workspace client run test` → green.

### Task 4c: modules/auth + useAuth (D15 auth-action consolidation)
**Files:** auth views→`modules/auth/views/<View>/`; NEW `modules/auth/useAuth.js`; NEW `modules/auth/auth.routes.jsx`.
- [ ] Move `Login`,`SignUp` (with `.test.jsx`), `ForgotPassword`,`ResetPassword`,`ChangePassword` into `modules/auth/views/<View>/<View>.jsx`.
- [ ] NEW `modules/auth/useAuth.js`: `login`/`signup`/`logout` (moved verbatim from old session.jsx, calling `api` + `useSession().setSession`) + `requestPasswordReset`/`resetPassword`/`changePassword` (extracted verbatim from the inline `api.post('/auth/...')` in `ForgotPassword.jsx`, `ResetPassword.jsx`, `ChangePassword.jsx`). Behavior identical.
- [ ] Rewire callers to `useAuth()`: `Login` (`login`), `SignUp` (`signup`), `App.jsx` Placeholder (`logout`), Forgot/Reset/ChangePassword (their actions). `Login.test.jsx`/`SignUp.test.jsx` stay the coverage for login/signup (no net-new test); fix their import/mock paths.
- [ ] NEW `modules/auth/auth.routes.jsx`: `/signup`,`/login`,`/forgot-password`,`/reset-password`,`/doctor/change-password`.
- [ ] **Verify:** `npm --workspace client run test` → green.

### Task 4d: modules/doctor (views + DoctorCard + useDoctor + routes)
**Files:** `DoctorListing`,`DoctorProfile`,`DoctorToday`,`AvailabilityGrid` (each `.jsx`+`.test.jsx`)→`modules/doctor/views/<View>/`; `components/DoctorCard.jsx`→`modules/doctor/components/DoctorCard/DoctorCard.jsx`; NEW `modules/doctor/useDoctor.js`; NEW `modules/doctor/doctor.routes.jsx`.
- [ ] Move views + DoctorCard.
- [ ] NEW `useDoctor.js`: extract the data/mutation logic verbatim from the 4 views (`useQuery`/`useMutation` calls), **each query `enabled`-gated** so a view triggers only its own. Views keep `date`/`tab`/grid `cells` UI state and call `useDoctor()`.
- [ ] NEW `doctor.routes.jsx`: incl. the `RoleRoute`-wrapped `/doctor`, `/doctor/availability`, and public `/doctors/:id`, `/` (DoctorListing) entries currently hardcoded in `App.jsx`/`routes.jsx`.
- [ ] Fix imports: `DoctorListing` → DoctorCard new path; format/apiClient/shared paths.
- [ ] **Verify:** `npm --workspace client run test` → green.

### Task 4e: modules/booking, appointment, video
**Files:** booking: `Booking`,`PaymentReturn`→`modules/booking/views/`; NEW `useBooking.js`, `booking.routes.jsx`. appointment: `Upcoming`→`modules/appointment/views/Upcoming/`; `CancelModal`(+test),`DoctorCancelModal`→`modules/appointment/components/<Comp>/`; NEW `useAppointment.js`, `appointment.routes.jsx`. video: `VideoRoom`→`modules/video/views/VideoRoom/`; NEW `useVideo.js`, `video.routes.jsx`.
- [ ] Move views + the two appointment components.
- [ ] Extract `useBooking` (lock→pay→redirect + doctor query + appt status), `useAppointment` (list+detail+cancel), `useVideo` (token+detail+join-sim) verbatim from their views; views keep `forSelf`/`subject`, `cancelId` UI state.
- [ ] NEW `*.routes.jsx` for each (incl. the `RoleRoute`-wrapped `/appointments`, `/book/:id`, `/pay/return`, `/video/:id`).
- [ ] Fix cross-module import: `DoctorToday` (doctor module) imports `DoctorCancelModal`→`../../appointment/components/DoctorCancelModal/DoctorCancelModal.jsx`; `Upcoming`→CancelModal new path.
- [ ] **Verify:** `npm --workspace client run test` → green.

### Task 4f: shared primitives + layouts
**Files:** `components/{Button,Field,Card,Alert,Checkbox,SlotButton}.jsx`→`shared/<Name>/<Name>.jsx`; `layouts/{AuthSplitLayout,PatientLayout,SidebarLayout}.jsx`→`layouts/<Name>/<Name>.jsx`.
- [ ] Move; fix `SlotButton`'s `format` import; rewrite all `'../components/<Primitive>.jsx'` importers (AvailabilityGrid, ChangePassword, Login, SignUp, ResetPassword, ForgotPassword for Field/Button/Alert; DoctorProfile for SlotButton).
- [ ] **Verify:** `npm --workspace client run test` → green.

### Task 4g: routing consolidation (D3)
**Files:** NEW `routes.jsx`; edit `App.jsx`.
- [ ] `routes.jsx`: import each module's `*.routes.jsx`; `export const routes = [...authRoutes, ...doctorRoutes, ...bookingRoutes, ...appointmentRoutes, ...videoRoutes]`.
- [ ] `App.jsx`: reduce to `<Routes>{routes.map(r => <Route key={r.path} path={r.path} element={r.element}/>)}</Routes>` + the `loading` gate + the `/admin`+`*` `Placeholder` (logout now via `useAuth`). Remove all hardcoded `RoleRoute` blocks (now in module routes).
- [ ] **Verify:** `npm --workspace client run test` → green.

---

## Phase 5: Client — component-test split (D13)

### Task 5a: Split bundled component tests
- [ ] Split `components/components.test.jsx` (tests Button + Field) → `shared/Button/Button.test.jsx` + `shared/Field/Field.test.jsx` (imports → `./Button.jsx`/`./Field.jsx`). Card/Alert/Checkbox/SlotButton have NO existing test — fabricate none.
- [ ] Split `components/discovery-components.test.jsx` (tests DoctorCard) → `modules/doctor/components/DoctorCard/DoctorCard.test.jsx` (import → `./DoctorCard.jsx`).
- [ ] Delete the emptied bundle files.
- [ ] **Verify:** `npm --workspace client run test` → green.

---

## Phase 6: Spec edits — GATED (NOT executed without approval)

Present (do not apply) to the human: (1) Doc 11 `ADR-26` recording the restructure decision; (2) Doc 03 new "Code organization & folder conventions" subsection; (3) docs 00–15 path-reference audit. Apply only after explicit approval, after the code lands.

---

## Final verification

- [ ] `npm test` → green; `npm --workspace client run test` → green.
- [ ] `npm run build:client` → builds clean (resolves every client import path).
- [ ] Optional smoke: `node server/src/index.js` against a dev DB → confirms `registerRoutes` wires all mounts.
- [ ] Report to human: working tree changed, both suites + build green; ask about committing (needs branch approval) and about applying the gated Phase 6 spec edits.

---

## Risks (carry into execution)

- **R1** (Task 1d, 2b): merged-module mocks — switch `vi.mock(sibling)`→`vi.spyOn(service, fn)`. Approved.
- **R2** (2a): intra-file name collisions in the 7-file merge — dedupe imports, check private helpers before deleting sources.
- **R3**: lockstep moves — files referencing a dep that moves a phase earlier must be re-pointed early AND when they move (appointment cluster→audit/availability; payment/devVideo/workers/video.integration→evaluation/appointmentState).
- **R4** (1e/1f/1g): webhook split must land atomically with `routes.js`/`index.js` rewiring; keep `/api/webhooks/payfast|daily` byte-identical.
- **R5** (1b): infra grouping is wide (~56 files); mechanical sweep; `config/constants.js` + `http/AppError.js` stay flat.
- **R6** (4b–4e): client `vi.mock('../lib/session.jsx')` paths recompute per view's new depth; verify by running the suite, not by eye.
- **R7**: `useAuth`→`useSession` one-way only (no context↔module cycle); confirm server `payment↔appointment` calls are request-time (no top-level execution cycle).
- **R8** (1d): `modules/doctor/index.js` exports two routers (`/api/doctors` + `/api/availability`); don't collapse onto one path.
- **R9** (3a): keep the schema barrel so per-domain moves don't ripple into module imports.

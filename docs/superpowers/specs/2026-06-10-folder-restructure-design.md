# Design — Client & Server Folder-Structure Restructure

| Field | Value |
| --- | --- |
| Date | 2026-06-10 |
| Status | Draft — awaiting user review |
| Scope | Pure code/folder restructuring for maintainability. **No business-requirement, behavior, or API changes.** |
| Sources | `devNotes/06_07_2026_0000_client_folder_structure_refactoring.md`, `devNotes/06_07_2026_0001_server_folder_structure_refactoring.md` |
| Governance | Spec edits (doc 03 + ADR-26) are GATED on explicit human approval per `docs/specification/00-INDEX_AND_GOVERNANCE.md` §4–5. |

---

## 1. Goal & non-goals

**Goal.** Reorganize the `client/` and `server/` source trees (and `shared/schemas/`) into a consistent, feature-first structure so future developers and agents can navigate the code, and so view/render concerns are separated from business logic.

**Non-goals (hard constraints).**
- No behavior change. Every move is verbatim relocation of code; logic is untouched.
- No API contract change, no DB/schema change, no new dependencies.
- No new features, no speculative abstraction (CLAUDE.md §2).
- The full test suite must be green before and after every step — it is the verification gate.

*One approved exception to "verbatim only":* the `appointment` and `doctor`+`availability` merges require re-stubbing internal collaborators in ~3 tests (`vi.mock('<sibling module>')` → `vi.spyOn(service, fn)`); assertions and coverage are unchanged (R1, §5.1).

**In scope but worth naming:** relocating *mis-placed* code (a shared component in a feature folder, an auth mutation living in a view) is explicitly part of the work — both dev notes ask for it.

---

## 2. Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | **Client = feature-first** `modules/<feature>/`, with `shared/` primitives, `layouts/`, `lib/`. | Mirrors the server's modular intent; co-locates everything one feature needs. |
| D2 | **One `use<Feature>()` hook per module** owns that module's data/mutations; views keep only render + pure UI state; behavior identical. The client has **hooks, not services** — "service" is server vocabulary. | A stateful client "service" must be a hook; one-per-module keeps it cohesive. |
| D3 | **Client routing = per-module `*.routes.jsx` + central `routes.jsx` aggregator**; `App.jsx` only renders `<Routes>`. | Kills the App.jsx/routes.jsx split; symmetric with the server. |
| D4 | **Server = five domain modules** (`auth`, `doctor`, `appointment`, `payment`, `video`); availability folds into `doctor`. Each = `index.js` + `controller.js` + `service.js` + `test.js`. | Uniform, domain-aligned, one obvious home per concept. |
| D5 | **One `service.js` and one `test.js` per module.** `appointment` merges 7 service files + their 6 tests; `doctor` absorbs `availability`. Service bodies move verbatim; ~3 cluster tests switch internal stubbing `vi.mock`→`vi.spyOn` (R1, approved). | User chose uniformity; the lifecycle services already import each other, so co-locating is cohesive; the bounded test rewrite preserves all assertions. |
| D6 | **`audit.service` → `services/audit/`** — a new top-level `services/` folder for **shared services used across modules with no single owning domain** (today: audit only). Not a module (no routes), not `lib/` (it does DB writes, not a pure utility). | Used by 11 callers across modules and owned by none. "Called by another module" ≠ shared; "no owning domain" is the test — so `payment`/`video` services stay in their modules. |
| D7 | **Cross-cutting folders stay top-level**: `config/`, `http/`, `lib/`, `middleware/`, `integrations/`, `workers/`, plus the new `services/` (shared services). `lib/` + `middleware/` + `services/` get per-unit folder-grouping (js + test together). | Matches both dev notes; keeps doc 03's `server/src/integrations/...` path references valid; flat layout, no deep nesting. |
| D8 | **`shared/schemas` = Option A**: Zod stays a client↔server contract in top-level `shared/`, reorganized into per-domain folders (mirroring the modules) with co-located tests. | Prevents client/server validation drift (the core maintainability risk); already domain-split. |
| D9 | **Prisma schema stays centralized** in `prisma/schema.prisma`; NOT modularized. | Idiomatic Prisma (single generated client); multi-file schema is experimental. See §3. |
| D10 | **Availability folds into `doctor`** (module + schema). | It is the doctor's schedule; `doctor.controller` already calls `availability.service`. |
| D11 | **Webhooks**: each module declares its own webhook route in its `index.js`; `routes.js` mounts both under `/api/webhooks`. | `payfast`→payment, `daily`→video; each owns its own. |
| D12 | **`health/` standalone route; `dev/` folder** (devCheckout, devVideo) mounted conditionally as today. | Ops/dev-only; not domain modules. |
| D13 | **Component tests split per component** — bundled `components.test.jsx` / `discovery-components.test.jsx` break into each component's folder. | Full per-folder co-location consistency (user choice); gated as a higher-touch split. |
| D14 | **Views live in `modules/<feature>/views/<View>/`** (`.jsx` + `.test.jsx`); feature-specific components in `modules/<feature>/components/<Comp>/`; the module's single hook + `*.routes.jsx` sit at the module root. | Separates the view layer from logic within each module; gives module-local components a home distinct from global `shared/`. |
| D15 | **Split state from actions.** `context/session/` holds cross-cutting **state** only (`SessionContext` + `SessionProvider` + `useSession` → `session`/`loading`/`refresh`/`setSession`). The **one-shot auth actions** (`login`/`signup`/`logout`/`requestPasswordReset`/`resetPassword`/`changePassword`) live in `modules/auth/useAuth.js`, which calls the API and updates state via `useSession().setSession`. No `services/`, no client `*.service.js`. | Actions are fired once from a view, not app-wide state; keeps the context lean and gives auth a per-module hook like every other module. |
| D16 | **New `context/` folder** for app-authored React contexts (today: `session/`; future tenants: theme, notifications). `context/AppProviders.jsx` composes `QueryClientProvider` + `BrowserRouter` + `SessionProvider` so `main.jsx` becomes `<AppProviders><AppRoutes/></AppProviders>`. `queryClient` config stays in `lib/`. | Centralizes cross-cutting providers; `main.jsx` stays thin. |

---

## 3. Data layer — Prisma vs Zod (orientation for future devs)

There is no Mongoose/TypeORM-style `User` model file to import. This project uses **Prisma**, which splits jobs Mongoose conflates:

- **`prisma/schema.prisma`** is the single declarative model definition (`User`, `Doctor`, …). `prisma generate` code-generates a typed client; models are accessed as `prisma.user.*`, `prisma.doctor.*` via the singleton in `server/src/lib/prisma.js`. No hand-written/exported model class. Model-shape safety is **type/edit-time** (JSDoc + `// @ts-check`, per doc 03) plus DB constraints that throw at write time — not runtime model validation.
- **`shared/schemas/*` (Zod)** validate **incoming HTTP requests** at the API boundary (`validate(schema)` middleware), with messages and refinements. This is the runtime validation Mongoose folds into the model.

They overlap in fields but are intentionally different (Zod `password` → Prisma `passwordHash`; Zod `tosAccepted: true` → Prisma `tosAcceptedAt: <timestamp>`). The overlap can drift; generating Zod from Prisma is a possible future improvement, **out of scope** here.

---

## 4. Client target structure

```
client/src/
  App.jsx                      # renders <Routes> over the aggregated table only
  main.jsx                     # <AppProviders><AppRoutes/></AppProviders>
  routes.jsx                   # imports each module's *.routes.jsx, concatenates
  context/                     # app-authored React contexts (cross-cutting STATE only)
    AppProviders.jsx           # composes QueryClient + BrowserRouter + Session providers
    session/
      session.jsx              # SessionContext + SessionProvider + useSession → {session, loading, refresh, setSession}
      session.test.jsx
    # future: theme/, notification/ …
  modules/
    auth/
      auth.routes.jsx
      useAuth.js               # one-shot actions: login/signup/logout/forgot/reset/change (call api + setSession)
                               #   (covered by the auth view tests + session.test.jsx — no net-new test, per the no-new-code rule)
      views/
        Login/          Login.jsx          Login.test.jsx
        SignUp/         SignUp.jsx         SignUp.test.jsx
        ForgotPassword/ ForgotPassword.jsx
        ResetPassword/  ResetPassword.jsx
        ChangePassword/ ChangePassword.jsx
    doctor/
      doctor.routes.jsx
      useDoctor.js             # one hook; each query `enabled`-gated so a view fetches only what it shows
      components/
        DoctorCard/ DoctorCard.jsx  DoctorCard.test.jsx          # moved out of generic components/
      views/
        DoctorListing/    DoctorListing.jsx    DoctorListing.test.jsx
        DoctorProfile/    DoctorProfile.jsx    DoctorProfile.test.jsx
        DoctorToday/      DoctorToday.jsx      DoctorToday.test.jsx
        AvailabilityGrid/ AvailabilityGrid.jsx AvailabilityGrid.test.jsx
    booking/
      booking.routes.jsx
      useBooking.js
      views/
        Booking/        Booking.jsx        Booking.test.jsx
        PaymentReturn/  PaymentReturn.jsx  PaymentReturn.test.jsx
    appointment/
      appointment.routes.jsx
      useAppointment.js
      components/
        CancelModal/       CancelModal.jsx       CancelModal.test.jsx  # moved out of generic components/
        DoctorCancelModal/ DoctorCancelModal.jsx                       # moved out of generic components/
      views/
        Upcoming/ Upcoming.jsx Upcoming.test.jsx
    video/
      video.routes.jsx
      useVideo.js
      views/
        VideoRoom/ VideoRoom.jsx VideoRoom.test.jsx
  shared/                       # true cross-feature primitives, each with its own test (D13)
    Button/   Field/   Card/   Alert/   Checkbox/   SlotButton/
  layouts/
    AuthSplitLayout/  PatientLayout/  SidebarLayout/
  lib/
    apiClient/   apiClient.js   apiClient.test.jsx
    format/      format.js      format.test.jsx
    queryClient/ queryClient.js
    RoleRoute/   RoleRoute.jsx  RoleRoute.test.jsx
  styles/   assets/             # unchanged
```

### 4.1 View → hook split (D2 — one hook per module)

Each module has **one `use<Feature>` hook** owning all its data/mutations; its views keep render + pure UI state only. **Behavior unchanged; existing view tests are the guard.**

| Hook | Location | Serves | Owns |
| --- | --- | --- | --- |
| `useSession` | `context/session/` | consumed app-wide (route gate, RoleRoute, layouts, any view) | session **state**: `session`, `loading`, `refresh`, `setSession` |
| `useAuth` | `modules/auth/` | Login, SignUp, Forgot, Reset, ChangePassword (+ `logout` from the app shell) | **actions**: `login`/`signup`/`logout`/`requestPasswordReset`/`resetPassword`/`changePassword` (call api + `setSession`) |
| `useDoctor` | `modules/doctor/` | DoctorListing, DoctorProfile, DoctorToday, AvailabilityGrid | listing/profile/slots/today/availability queries + save mutation; **each query `enabled`-gated** so a view fetches only what it shows |
| `useBooking` | `modules/booking/` | Booking, PaymentReturn | `useQuery(doctor)`, `confirmAndPay` (lock→pay→redirect), appt-status query |
| `useAppointment` | `modules/appointment/` | Upcoming | list + detail queries + cancel mutation |
| `useVideo` | `modules/video/` | VideoRoom | token + detail queries + join-sim post |

`useSession` (context) is **state**; the five `use<Feature>` hooks are **actions/data**. Pure UI state stays in the view: `forSelf`/`subject` (Booking), selected `date` (DoctorProfile), active `tab` (DoctorToday), grid `cells` (AvailabilityGrid), `cancelId` (Upcoming).

**Auth consistency finding (in-scope).** `Login`/`SignUp` already delegate to the session hook. `ForgotPassword`, `ResetPassword`, `ChangePassword` currently call `api.post('/auth/...')` inline; they will route through `useAuth` so all auth actions live in one hook.

### 4.2 Routing (D3)

```js
// routes.jsx
import { authRoutes } from './modules/auth/auth.routes.jsx';
import { doctorRoutes } from './modules/doctor/doctor.routes.jsx';
// ... booking, appointment, video
export const routes = [...authRoutes, ...doctorRoutes, ...bookingRoutes, ...appointmentRoutes, ...videoRoutes];
```
Each `*.routes.jsx` owns its module's path objects, including the `RoleRoute` wrapping currently hardcoded in `App.jsx`. `App.jsx` keeps only `<Routes>{routes.map(...)}</Routes>`, the loading gate, and the `*` catch-all.

---

## 5. Server target structure

```
server/src/
  index.js                     # createApp() calls registerRoutes(app) from routes.js
  routes.js                    # NEW: mounts each module's index.js (+ health + conditional dev)
  modules/
    auth/        index.js  controller.js  service.js  test.js
    doctor/      index.js  controller.js  service.js  test.js   # includes availability (D10)
    appointment/ index.js  controller.js  service.js  test.js   # MERGE of 7 services + tests (D5)
    payment/     index.js  controller.js  service.js  test.js   # index owns /api/webhooks/payfast (D11)
    video/       index.js  controller.js  service.js  test.js   # index owns /api/webhooks/daily (D11)
  config/        constants.js   env/ (env.js, env.test.js)
  http/          AppError.js    errorHandler/ (errorHandler.js, errorHandler.test.js)
  lib/                             # pure utilities only (no DB, no domain logic)
    logger/  prisma/  errorTracking/
    password/    password.js  password.test.js
    resetToken/  resetToken.js  resetToken.test.js
    tz/          tz.js  tz.test.js
  services/                        # shared services: cross-module, no single owning domain (D6)
    audit/       audit.service.js  audit.service.test.js        # narrowed from the old layer-first services/
  middleware/
    mustChangePassword/  rateLimit/  requireRole/  session/  validate/   # each js + test
  integrations/  email/  payment/  video/        # unchanged (doc 03 references these paths)
  workers/       index.js                         # imports evaluateDueAppointments from appointment/service.js
  health/        index.js                         # thin /api/health route (D12)
  dev/           devCheckout.js  devVideo.js      # external-provider simulators, mounted only when *_PROVIDER=mock (D12)
  test/          *.integration.test.js  doubleBooking.test.js   # cross-module integration tests (stay top-level)
```

### 5.1 The `appointment` merge (D5 — highest-risk step)

`appointment/service.js` absorbs verbatim: `appointment.service` (`listForRole`, `getForRole`), `booking.service` (`lockSlot`), `appointmentState.service` (`transition`), `cancellation.service` (`cancel`), `refund.service` (`quoteRefund`, `initiateRefund`), `refundSideEffects` (`safeRefund`), `evaluation.service` (`evaluateDueAppointments`). `appointment/test.js` absorbs the **six** corresponding test files (`refundSideEffects.js` has no test). `appointment/controller.js` = today's `appointment.controller.js`; `pay`/`videoToken` still call the `payment`/`video` modules (cross-module, unchanged). De-risk: suite green → mechanical merge → suite green.

**⚠ Known risk R1 — the merge is NOT 100% mechanical for the tests.** Several appointment-cluster tests isolate a collaborator by mocking its *module*: `appointment.service.test` mocks `./refund.service.js` (`quoteRefund`); `cancellation.service.test` mocks `./appointmentState.service.js` (`transition`) + `./refund.service.js`; `evaluation.service.test` mocks `./appointmentState.service.js` + `./refundSideEffects.js`. Once caller and callee live in the **same** `service.js`, a module-mock of the now-internal sibling no longer intercepts the intra-file call — so those ~3 tests **will fail** if merged verbatim. Resolving them means switching their stubbing from `vi.mock('<sibling module>')` to `vi.spyOn(service, fn)` on the merged module: **behavior-preserving (identical assertions) but a real edit to test internals**, not a pure move. (Seams that stay cross-module survive untouched: `payment.test`'s mock of `appointmentState` → `../appointment/service.js`; `booking`'s mock of `availability` → `../doctor/service.js`.) The same applies to the smaller `doctor`+`availability` merge (`doctor.service.test` mocks `availability`'s `nextAvailableSlot`). **Resolved (approved):** keep D5 and apply the `vi.spyOn(service, fn)` rewrite to those ~3 tests — assertions unchanged; this is the sole sanctioned test-internals edit in the restructure.

### 5.2 Splits & cross-module references (unchanged behavior)

**Splits this restructure performs** (all verbatim moves):
- `doctor/service.js` **absorbs** `availability.service` (+ tests `availability.service.test.js` and `availability.expiry.test.js` → `doctor/test.js`); `doctor/index.js` owns `/api/doctors/*` **and** `PUT /api/availability` (D10).
- `webhook.controller.js` **splits**: `payfast`→`payment/controller.js`, `daily`→`video/controller.js` (with `webhook.controller.test.js` following each); each module's `index.js` owns its `/api/webhooks/*` route (D11).
- `server/src/test/` integration tests **stay** as a top-level `test/` folder — they span modules, so they belong to none.

**Cross-module calls** (normal, unchanged):
- `appointment.controller` imports `payment` service (`pay`) and `video` service (`videoToken`).
- `workers/index.js` imports `evaluateDueAppointments` from `appointment/service.js`.
- The `dev/` routes import `payment`/`video`/`appointment` services as today.

---

## 6. `shared/schemas` restructure (D8 — Option A)

```
shared/schemas/
  index.js                     # barrel: export * from each domain
  auth/         auth.js                              # signup, login, forgot, reset, changePassword
  doctor/       doctor.js                            # doctorListQuery, slotsQuery, availabilityBlock, availabilityReplace
  appointment/  appointment.js  appointment.test.js  # lock, cancel  (was booking.js / booking.test.js)
```
Schema folders mirror the modules (the three domains that have request-body schemas). `availability` schemas fold into `doctor/` (D10). All moves; no schema logic changes. Server module imports may target the barrel or a specific domain file. Wiring the **client** to consume these schemas (replacing the hand-rolled `Number(subject.age)` validation in `Booking`) is a behavior change — **out of scope**, noted as a follow-up.

---

## 7. Mis-placed code findings (relocated as part of this work)

| Item | Now | Target |
| --- | --- | --- |
| `DoctorCard` | `client/src/components/` (generic) | `modules/doctor/components/DoctorCard/` |
| `CancelModal`, `DoctorCancelModal` | `client/src/components/` (generic) | `modules/appointment/components/` |
| `session.jsx` **state** (session/loading/refresh/setSession) | `client/src/lib/` | `context/session/session.jsx` |
| `session.jsx` **actions** (login/signup/logout) | `client/src/lib/` | `modules/auth/useAuth.js` |
| `doctorListQuery`, `slotsQuery` | `shared/schemas/availability.js` | `shared/schemas/doctor/doctor.js` |
| `audit.service` | `server/src/services/` (old layer bucket) | `server/src/services/audit/` (`services/` narrowed to shared-only) |
| Forgot/Reset/ChangePassword mutations | inline in views | `modules/auth/useAuth.js` |

---

## 8. Spec changes — GATED on approval (per governance §4–5)

Per the change-impact matrix ("New architectural decision → 11, then the affected doc"):

1. **Doc 11 — add `ADR-26`** (next free ID; highest existing is ADR-25): "Adopt feature-first client modules + domain-based server modules + shared Zod contract for maintainability; behavior unchanged." Context / decision / consequences.
2. **Doc 03 — add subsection** "Code organization & folder conventions" capturing: client `modules/`+`shared/`+`lib/`; the view/hook rule; per-module routing on both tiers; server domain modules (`index/controller/service/test`); shared infra; `shared/schemas` as the wire contract; the Prisma-vs-Zod data-layer note.
3. **Path-reference audit across docs 00–15** for any `client/src/...` / `server/src/...` paths the moves invalidate; fold the edits into the same approval set.

Drafted and approved **before** application; applied **after** the code moves land so documented paths are real.

### 8.1 Doc-hygiene finding (separate approval)
`prisma/schema.prisma` headers (lines 2, 18) reference `docs/engineering/ARCHITECTURE.md §5` and `docs/engineering/CONFIG.md`, both **deprecated-by-policy** (doc 00 §7). Canonical replacements: doc 04 (data model), doc 15 (config). Propose updating in a later pass.

---

## 9. Phasing & verification

| Phase | Work | Gate |
| --- | --- | --- |
| 0 | Baseline: run full suite. | All green (recorded). |
| 1 | Server: create `modules/`; move simple domains (auth, doctor+availability, payment, video); shared infra (`lib/`/`middleware/` grouping, `audit`→`services/audit/`); build `routes.js`; `health/` + `dev/`. | Suite green. |
| 2 | Server: **appointment merge** (7 services → `service.js`, 7 tests → `test.js`). | Suite green (high-risk gate). |
| 3 | `shared/schemas` reorg (Option A folders). | Suite green. |
| 4 | Client: `context/` (session **state/action split** + `AppProviders`), `modules/`, `shared/`, `lib/` grouping, routing consolidation, view→hook extraction. The `session.jsx` → `context/session` + `modules/auth/useAuth` split is the higher-touch step here (`session.test.jsx` tests state only → moves to `context/session/`; login/signup stay covered by the view tests). | Both suites green. |
| 5 | Client: **component-test split** (D13) — `components.test.jsx` (Button+Field) → `shared/Button|Field/*.test.jsx`; `discovery-components.test.jsx` (DoctorCard) → `modules/doctor/components/DoctorCard/`. (Card/Alert/Checkbox/SlotButton have no existing test — none fabricated.) | Both suites green. |
| 6 | Spec edits (ADR-26 + doc 03 + path audit), after approval. | Docs consistent; paths real. |

**Test runner = two `vitest` suites**, both green at every gate: `npm test` (root config → `server/**` + `shared/**`, node) and `npm --workspace client run test` (client config → `client/src/**`, jsdom). Final check also runs `npm run build:client` (the Vite build resolves every client import path, catching anything the test globs miss). Each move is behavior-preserving; both suites re-run at every gate.

---

## 10. Answers to the dev-note questions

**Client note:**
- *Routes split between App.jsx and routes.jsx?* — Resolved by D3.
- *Layouts vs views vs components?* — New, unambiguous vocabulary: **`layouts/`** = page shells (chrome); **`modules/<feature>/views/`** = pages (a view is a routable page); **`modules/<feature>/components/`** = that feature's own components; **`shared/`** = cross-feature primitives; **`modules/<feature>/use<Feature>.js`** = the feature's logic; **`context/`** = app-wide React contexts (session today; theme/notifications later). The old catch-all "views" bucket (which mixed pages, components, and logic) is dissolved.
- *Shared components in one place?* — `shared/`; domain components move into their module (§7).
- *Tests beside jsx?* — Folder-per-unit; test co-located in each unit's folder (incl. split bundled component tests, D13).
- *Logic vs view separation?* — D2 hooks (§4.1).
- *lib grouping + purpose of each file?* — Each grouped into its own folder. Purpose audit:

| `lib/` file | Purpose | Disposition |
| --- | --- | --- |
| `apiClient.js` | `fetch` wrapper + `ApiError`; single HTTP entry point | stays `lib/apiClient/` |
| `format.js` | pure PKR/Karachi formatters | stays `lib/format/` |
| `queryClient.js` | react-query singleton config | stays `lib/queryClient/` |
| `RoleRoute.jsx` | client-side route guard (server is the real boundary) | stays `lib/RoleRoute/` |
| `session.jsx` | auth state + actions — **not generic infra** | state → `context/session/session.jsx`; actions → `modules/auth/useAuth.js` |

**Server note:**
- *module = index/controller/service/test?* — D4/D5.
- *Controller resolves service, no DB calls?* — Preserved: controllers already delegate to services; DB calls live in `service.js`. No controller currently makes direct DB calls.
- *Separate routes file managing each module's index?* — `server/src/routes.js` (D3 server-side).
- *lib/middleware grouping?* — D7.

---

## 11. Status / next steps

1. **User reviews this doc.**
2. On approval → invoke `writing-plans` to produce the step-by-step move plan with the §9 gates.
3. Spec edits (§8) presented for explicit approval before application.

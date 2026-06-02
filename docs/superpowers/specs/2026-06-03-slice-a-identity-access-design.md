# Slice A — Identity & Access — Design

| Field        | Value                                                             |
| ------------ | ---------------------------------------------------------------- |
| Date         | 2026-06-03                                                       |
| Status       | Approved (design); implementation pending                        |
| Author       | Brainstorming session (superpowers:brainstorming)               |
| Scope        | M1+M2 Slice A of 4 (A Identity & Access)                         |
| Canon refs   | docs/specification 02, 03, 04, 05, 06, 08, 14, 15               |
| Changelog    | agentChangeLogs/2026-06-03-0006-slice-a-identity-access.md       |

---

## 0. Decomposition context (M1 + M2)

The user's goal is the **full patient journey end-to-end** (discovery → book → pay → confirmed → video consultation), doctor side included. That is effectively the entire v1 core platform, far too large for one spec/plan. It is decomposed into **4 vertical slices**, each its own spec → plan → build cycle:

| Slice | Delivers | Depends on |
| ----- | -------- | ---------- |
| **A — Identity & Access** | Auth service+routes, `mustChangePassword` gate, session context, typed API client, minimal shared components, AuthSplit layout, screens P-04/P-05/D-01 | — |
| **B — Discovery & Availability** | Doctor listing/profile, availability→slot generation, P-01/02/03 + D-03, patient/doctor nav layouts | A |
| **C — Booking + Payment** | Slot-lock, payment, appointment state machine, refund, cancellation, reconciliation+notification workers, P-06/07/08 | A, B |
| **D — Video consultation** | Daily room/token, participant ingestion, appointment-evaluation worker, analytics, P-11/12 + D-04 | C |

Doctor onboarding (admin A1) stays in M4; doctors are created via the seed script for slices A–D.

This document specifies **Slice A only**.

---

## 1. Scope

### In scope
- **Backend:** `auth.service`, `auth.controller`, `auth` routes, the DA3 `mustChangePassword` gate, a Zod-validation middleware, shared auth DTOs, audit-logging of auth events, and the doc-08 rate-limit/lockout wiring.
- **Schema:** two reset-token columns on `users` + migration.
- **Frontend:** typed `apiClient`, `SessionProvider`/`useSession` (React Context), `QueryClientProvider` (TanStack Query) root wiring, the **minimal** shared components these screens need, the **AuthSplit** layout, and screens **P-04 (Sign up)**, **P-05 (Login + password recovery)**, **D-01 (Forced first-login change)**, wired with `RoleRoute`.

### Explicitly deferred (owned by later slices, per YAGNI)
- `TopNavLayout` / `BottomTabsLayout` / `SidebarLayout` → Slice B (first needs logged-in/public chrome).
- Doctor admin-mediated reset (DA5) → doctor-management work (later slice). Slice A builds only the *gate* DA3/DA5 rely on.
- All post-login destination screens → their slices. Post-auth routing targets `/`, `/doctor`, `/admin` and lands on a tiny placeholder until later slices fill them.

---

## 2. Decisions (locked with the user)

1. **Reset-token storage:** two columns on `users` — `reset_token_hash` (SHA-256 of the raw token; raw token only ever in the email link) and `reset_token_expires_at` (timestamptz). Single active token per user; cleared on use (single-use) and on expiry. *Schema change — doc-04 cascade.*
2. **Test strategy:** hybrid — service logic unit-tested with Prisma mocked; a small set of supertest route tests against a real test DB for wiring/happy paths.
3. **Frontend state:** **React Context** for session/auth; **TanStack Query** (`@tanstack/react-query`) for server-cache state; `useState`/`useReducer` for local UI. *New client dependency + ADR in doc 11.*
4. **Canonical screen IDs:** doc 06 is authoritative — Slice A = **P-04, P-05, D-01**. Doc 13's informal IDs to be corrected.
5. **Login `role` field:** accepted in the body per doc 05, but the **stored** `users.role` is authoritative (enumeration-safety); the response returns the real role.

---

## 3. Backend design

### 3.1 Files (strict `model → controller → service`; thin controllers)
- `shared/schemas/auth.js` — `signupSchema`, `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema`; re-exported from `shared/schemas/index.js`.
- `server/src/middleware/validate.js` — `validate(schema)` parses `req.body`; `ZodError` flows to the existing `errorHandler` (`400 VALIDATION_FAILED`).
- `server/src/middleware/mustChangePassword.js` — DA3 gate. If `req.session.mustChangePassword` is true, block all routes except `POST /api/auth/logout`, `POST /api/auth/change-password`, `GET /api/auth/me` with **`403 MUST_CHANGE_PASSWORD`** (new code).
- `server/src/services/auth.service.js` — all logic (see §3.3).
- `server/src/controllers/auth.controller.js` — thin handlers (introduces `controllers/`).
- `server/src/routes/auth.js` — router; wires rate limiters + `validate` + controller; mounted at `/api/auth` in `index.js` before the `/api` 404 catch-all.

### 3.2 Endpoints (doc 05 §1)

| Endpoint | Role | Behaviour |
| -------- | ---- | --------- |
| `POST /api/auth/signup` | public | patient only; `tosAcceptedAt=now`; argon2 hash; establishes session; returns `{id, role, fullName, mustChangePassword:false}`; `201`. Rate-limit: 5/IP/hour. |
| `POST /api/auth/login` | public | enumeration-safe; verify; set session (`userId, role, mustChangePassword`); audit `login` success; returns `{id, role, fullName, mustChangePassword}`; `200`. Per-IP 20/15m → `429 RATE_LIMITED`; per-account 5 **failures**/15m → `429 ACCOUNT_LOCKED` + `login_lockout` audit. |
| `POST /api/auth/logout` | any | destroy session; `204`. |
| `GET /api/auth/me` | any | `{id, role, fullName, mustChangePassword}` from session/DB, or `401 UNAUTHENTICATED`. |
| `POST /api/auth/forgot-password` | public | **always identical `200`**; if the email exists, generate raw token (32 random bytes), store SHA-256 hash + `now + RESET_TOKEN_TTL_MIN`, send reset link via `emailProvider` (stub logs in dev). Rate-limit 5/account/hour (silent). |
| `POST /api/auth/reset-password` | public | verify token hash + not expired; set new password; **clear both reset columns (single-use)**; `200`. Invalid/expired → `400`/`409`. |
| `POST /api/auth/change-password` | patient/doctor | verify current; set new; clear `mustChangePassword` (session + DB); audit `password_change`; `200`. |

### 3.3 Service responsibilities (`auth.service.js`)
- `signup({fullName,email,phone,password})` → create `User(role=patient, tosAcceptedAt=now, passwordHash)`; unique-email violation → `409` (display-safe). Returns the safe user shape.
- `login({email,password})` → fetch by email; `verifyPassword`; on success return safe shape; on any failure throw a single generic `401 UNAUTHENTICATED` (identical for unknown email vs wrong password). Lockout is enforced at the route limiter; the service stays pure.
- `requestPasswordReset(email)` → look up; if found, set token hash+expiry, return the raw token to the controller for the email send. Always resolves (no throw) so the response is uniform.
- `resetPassword({token,newPassword})` → hash token, find user with matching unexpired hash; set password; clear columns.
- `changePassword(userId,{currentPassword,newPassword})` → verify current; set new; clear `mustChangePassword`.
- Audit writes via existing `audit.service.record(...)`: `login` (success), `password_change`, `login_lockout` (from the limiter handler). Actor type `patient`/`doctor` per session; `system` for the lockout counter where no session exists (actor identity = the targeted email in `meta`).

### 3.4 Token + crypto details
- Raw reset token: `crypto.randomBytes(32).toString('hex')`; stored as `crypto.createHash('sha256')`. Constant-time compare via hash equality on a `findFirst` by hash.
- Passwords: existing `hashPassword`/`verifyPassword` (argon2id).
- TTL/limits from `server/src/config/constants.js` (already present): `RESET_TOKEN_TTL_MIN`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MIN`, `SIGNUP_MAX_PER_IP_HOUR`, `FORGOT_MAX_PER_ACCOUNT_HOUR`.

### 3.5 Rate-limit / lockout wiring
- Per-account login lockout: `express-rate-limit` keyed by `req.body.email`, `skipSuccessfulRequests: true` (counts only failed logins), `max = LOGIN_MAX_ATTEMPTS`, window `LOGIN_LOCKOUT_MIN`, handler → `429 ACCOUNT_LOCKED` + `login_lockout` audit.
- Per-IP login: separate limiter, `max 20 / 15m` → `429 RATE_LIMITED`.
- Signup: `max 5 / IP / hour` → `429 RATE_LIMITED`.
- Forgot-password: `max 5 / account / hour`, but **must still return the uniform 200** — implement as a counter that, on breach, short-circuits to the same 200 (no work done) rather than a 429, to preserve enumeration-safety.

---

## 4. Frontend design

### 4.1 Infrastructure
- `client/src/lib/apiClient.js` — same-origin `fetch` wrapper (cookies sent by default same-origin); JSON; parses `{error:{code,message,details}}` into a thrown `ApiError {code,message,details,status}`.
- `client/src/lib/session.jsx` — `SessionProvider` + `useSession()`. Hydrates via `GET /api/auth/me` on mount (loading state). Exposes `session`, `loading`, and `login`/`signup`/`logout`/`refresh` helpers; after mutations, `queryClient.invalidateQueries()` for session-dependent data.
- Root wiring (`main.jsx`): `QueryClientProvider` → `BrowserRouter` → `SessionProvider` → routes.

### 4.2 Shared components (build ONLY what P-04/P-05/D-01 use)
Thin wrappers over existing `components.css` BEM classes; **token roles only, no raw hex** (PROJECT_RULES frontend):
- `Button` (`.btn` + variant/size props → modifier classes; `isLoading` → disabled + spinner).
- `Field` (`.field` label + `.input` + `.help` + `.error-text`; `error` prop toggles `.input--error`).
- `Card` / `SectionCard` (`.card` / `.section-card`).
- `Alert` (`.alert` + variant).
- `Checkbox` (`.choice`, 18×18, `accent-color` token) — for the P-04 ToS consent.

### 4.3 Layout
- `AuthSplitLayout` (`.auth-split`): spruce brand panel + form pane; collapses below 860px per doc 06. Used by P-04, P-05, D-01.

### 4.4 Views
- **P-04 Sign up** — fields fullName/email/phone/password + **mandatory ToS/Privacy checkbox** linking `/legal/terms` + `/legal/privacy`; submit blocked until checked (doc 06 §3). `useMutation` → signup → on success route to patient placeholder.
- **P-05 Login + password recovery** — login form (role-routes on success by stored role); inline "forgot password" → enumeration-safe confirmation; reset-password view consumes `?token=` (single screen family). `useMutation` for each.
- **D-01 Forced first-login change** — reached when `mustChangePassword`; current + new password; on success clears the flag and routes to the doctor placeholder.

### 4.5 Routing
- `routes.jsx` wired with `RoleRoute`; public `/login`, `/signup`, `/reset-password`; post-login redirect by role to `/` (patient), `/doctor`, `/admin` placeholders. The `mustChangePassword` client guard forces `/doctor/change-password` (D-01) before the panel.

---

## 5. Testing (hybrid)

- **Unit (mocked Prisma):** enumeration-safety (identical login response known/unknown), failed-login lockout counting, reset-token hash+expiry+single-use, `changePassword` clears the flag, the `mustChangePassword` gate allow/deny set.
- **Integration (real test DB, supertest, mirrors `app.integration.test.js`):** signup issues HttpOnly+SameSite=Lax cookie; login happy path; `/me`; logout; full forgot→reset round-trip.
- **Frontend (React Testing Library):** P-05 role-routing on success; P-04 consent-gating blocks submit.
- Run via `npm test` (vitest). All green is the gate.

---

## 6. Spec-doc update impact (governance — approve before editing)

Per the doc-00 change-impact matrix:

| Doc | Change | Severity |
| --- | ------ | -------- |
| **04 DATABASE** | Add `reset_token_hash` + `reset_token_expires_at` to `users`; version bump + revision row | Required |
| **11 ADR** | New `ADR-NN`: frontend state = Context (session) + TanStack Query (server cache) | Required |
| **03 ARCHITECTURE** | Note `@tanstack/react-query` in the frontend stack row | Minor |
| **05 API** | Add `MUST_CHANGE_PASSWORD` to §3.2 status map; note reset consumes hashed columns | Minor |
| **08 SECURITY** | Note reset token stored hashed + single-use on `users` | Minor |
| **12 TEST CASES** | Add `TC-F01-*` / `TC-F15-*` (continue existing numbering) | Required |
| **13 STATUS** | Correct informal screen IDs to doc 06; mark Auth module progress on completion | Required |

Each concrete edit is shown to the user for sign-off before any spec or code change.

---

## 7. Success criteria

Sign up → session issued; log in → role-routed; forgot→reset round-trip works and the token is single-use & 1-hour; a `mustChangePassword` doctor is forced through D-01 before any other route; `requireRole`/session shape unchanged for downstream slices; all unit + integration + frontend tests green via `npm test`.

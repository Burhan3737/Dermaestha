# Design — Server (+ Shared) Test Centralization

| Field | Value |
| --- | --- |
| Date | 2026-06-15 |
| Status | Draft — awaiting user review |
| Scope | Relocate all server + shared test files into a single per-workspace `test/` tree. **No test logic, assertion, or coverage change.** |
| Sources | This brainstorming session (user goal: "client and server both have their test suites in a single test folder, grouped and organized maintainably"). |
| Governance | Spec edits (new ADR-39 + docs 03 / 09 / 13) are GATED on explicit human approval per `docs/specification/00-INDEX_AND_GOVERNANCE.md` §4–5, applied only after code is committed. |

---

## 1. Goal & non-goals

**Goal.** Move every co-located server test (and the two `shared/` schema tests) out of the source tree into a single, navigable `test/` folder per workspace, organized so that finding a test is mechanical and adding one has an obvious home.

**Non-goals (hard constraints).**
- No test behavior change. Every move is a verbatim relocation; assertions, `describe` blocks, and logic are untouched. The **only** in-file edits are import / `vi.mock` specifier strings (relative → alias) and filename changes.
- No source-code change. Production source keeps its existing relative imports; only the moved *test* files adopt aliases.
- No new features, no speculative abstraction (CLAUDE.md §2).
- The full test suite must be green before and after, with the **same passing count** — that comparison is the verification gate.
- **Client is out of scope.** `client/` (its `vitest.config.js` + 2 tests) is a separate later cycle, per the user's plan. This effort covers `server/` and `shared/` only.

---

## 2. Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | **Centralize, reversing ADR-26's co-location.** All tests move to a per-workspace `test/` tree. | User goal: one navigable home for the suite. This is a deliberate reversal of the test-location half of ADR-26 (→ new ADR-39). |
| D2 | **Top level = layer, then domain.** `test/unit/<src-area>/…` and `test/integration/<flow>.test.js`. | Preserves the existing unit-vs-integration distinction the codebase already lives by; clear destination per test type. |
| D3 | **Unit tree mirrors `src/`.** `test/unit/<src-area>/<unit>/<role>.test.js`. To find a test: same source path, under `unit/`. | Navigable shadow of the source tree. |
| D4 | **Sub-folder per source unit.** Each source unit gets a folder; files named by role inside it (`payment/service.test.js`, `payment/controller.test.js`). | Cleanly handles units with multiple tests (payment, doctor, integrations) without flat-name collisions. |
| D5 | **Module's primary test → `service.test.js`** (today's bare `modules/<x>/test.js`). | Kills the ambiguous bare `test.js`; it becomes role-named, beside `controller.test.js`. Resolves the original "`test.js` vs `*.test.js`" inconsistency. |
| D6 | **Integration files drop the `.integration` infix** (`booking.integration.test.js` → `integration/booking.test.js`). | The `integration/` folder already conveys the layer; the infix is redundant. |
| D7 | **`integrations/integrations.test.js` → `unit/integrations/index.test.js`.** | It is the provider-selection aggregate for that group; `index` names the group root. |
| D8 | **Path aliases, single root per workspace** — `#src/*` → `server/src/*`, `#shared/*` → `shared/*` — defined via `resolve.alias` in the root `vitest.config.js`. | Decouples tests from physical location so future source moves never re-break imports (the "maintainable" lever). One alias keeps config minimal; the segment after it reads like the source path. |
| D9 | **`test/` lives outside `src/`** — `server/test/`, `shared/test/`. | Full separation of tests from source; symmetric with the future `client/test/`. Aliases make the location free. |
| D10 | **Shared included now.** `shared/schemas/*.test.js` → `shared/test/unit/schemas/<name>/<name>.test.js`. | The shared tests are run by the same root `vitest.config.js`; centralizing them in the same pass keeps that config consistent. |
| D11 | **`resolve.alias`, not `package.json "imports"`.** | One central place (the root config already governs server + shared); test-only, so runtime source resolution is untouched; Vite resolves aliases before `vi.mock` matching — safest for mock interception. |

---

## 3. Target structure

### 3.1 Server — `server/test/`

```
server/test/
  unit/
    modules/
      auth/          service.test.js            ← modules/auth/test.js
      doctor/        service.test.js            ← modules/doctor/test.js
                     admin.test.js              ← modules/doctor/admin.test.js
      appointment/   service.test.js            ← modules/appointment/test.js
      payment/       service.test.js            ← modules/payment/test.js
                     controller.test.js         ← modules/payment/controller.test.js
      video/         service.test.js            ← modules/video/test.js
      analytics/     service.test.js            ← modules/analytics/test.js
      admin/         service.test.js            ← modules/admin/test.js
      medicine/      service.test.js            ← modules/medicine/test.js
      prescription/  service.test.js            ← modules/prescription/test.js
      notification/  service.test.js            ← modules/notification/test.js
    lib/
      password/      password.test.js
      tz/            tz.test.js
      resetToken/    resetToken.test.js
      settings/      ensureSettings.test.js
      errorTracking/ errorTracking.test.js
    middleware/
      validate/      validate.test.js
      requireRole/   requireRole.test.js
      mustChangePassword/ mustChangePassword.test.js
    integrations/
      email/         templates.test.js  resend.test.js  console.dev.test.js
      video/         daily.test.js  daily.mock.test.js
      payment/       payfast.test.js  payfast.mock.test.js
      index.test.js                              ← integrations/integrations.test.js
    services/
      audit/         audit.service.test.js
    config/
      env/           env.test.js
    http/
      errorHandler/  errorHandler.test.js
  integration/
    app.test.js  auth.test.js  admin.test.js  booking.test.js
    discovery.test.js  notification.test.js  paymentFailed.test.js
    prescription.test.js  reclaimSafety.test.js  reconcileRefund.test.js
    video.test.js  doubleBooking.test.js
```

Count: 31 unit + 12 integration = **43 server files**.

### 3.2 Shared — `shared/test/`

```
shared/test/
  unit/
    schemas/
      analytics/     analytics.test.js          ← schemas/analytics/analytics.test.js
      appointment/   appointment.test.js        ← schemas/appointment/appointment.test.js
```

Count: **2 shared files**. Total in scope: **45 files**.

### 3.3 Naming rules

1. **`test/unit/<src-area>/<unit>/<role>.test.js`** — unit tests are named after the **source file** they exercise.
2. **`test/integration/<flow>.test.js`** — integration tests are named after the **flow/journey** they exercise (flat, no `.integration` infix).
3. The module's primary (service-level) test is `service.test.js`.

> The folder (`unit/` vs `integration/`) tells you which naming semantics the filename uses: source-file name vs flow name.

---

## 4. Aliases & config

### 4.1 Root `vitest.config.js`

```js
import { fileURLToPath } from 'node:url';
// ...
resolve: {
  alias: {
    '#src':    fileURLToPath(new URL('./server/src', import.meta.url)),
    '#shared': fileURLToPath(new URL('./shared',     import.meta.url)),
  },
},
test: {
  // ...
  include: ['server/test/**/*.test.js', 'shared/test/**/*.test.js'],
},
```

The previous globs (`server/src/**/*.test.js`, `server/src/**/test.js`, `shared/**/*.test.js`) are removed.

### 4.2 Import rewrites (the only in-file change)

```js
// unit — import the subject + mock dependencies via #src
import { hashPassword } from '#src/lib/password/password.js';
vi.mock('#src/lib/prisma/prisma.js', ...)
vi.mock('#src/modules/appointment/service.js', ...)

// integration — dynamic app import via #src
const { createApp } = await import('#src/index.js');

// shared — via #shared
import { ... } from '#shared/schemas/analytics/analytics.js';
```

Source files are **not** modified; the mild asymmetry (source = relative, tests = aliased) is intentional and safe because both specifiers resolve to the same absolute file.

---

## 5. Migration & verification

1. **Baseline.** Run the full suite; record it is green and capture the passing test count (the "before").
2. **Migrate.** Add aliases + new globs; `git mv` every file to its target (preserves history); rewrite each file's import / `vi.mock` specifiers to `#src/*` / `#shared/*`; rename module `test.js` → `service.test.js`; drop `.integration` infixes.
3. **Verify.** Run the full suite; fix anything red until the result matches the before (same passing count). Remove the now-empty `server/src/test/`; run `eslint .` + `prettier`.

The before/after full-suite comparison is the verification gate: a mock-resolution failure (the one real risk — `vi.mock('#src/...')` not intercepting a relatively-imported source module) would surface as a red test and be fixed; a non-collected test would surface as a count mismatch. No separate spike step is required.

---

## 6. Canonical doc-impact (gated, applied at end)

| Doc | Change | Why |
| --- | --- | --- |
| 11 — ADR | **New ADR-39**: centralized `test/` structure + `#src`/`#shared` aliases, **superseding the test-location decision in ADR-26**; add a supersession pointer on ADR-26. | Reversing a recorded decision = new ADR, not a silent edit (doc 00 protocol). |
| 09 — Dev/QA Testing | §1 unit-vs-integration paragraph (co-located → `server/test/unit` + `server/test/integration`), the Vitest glob description, and `server/src/test/` integration-location references. | Describes the layout being changed. |
| 03 — Architecture | §3a.1 "Code organization & folder conventions" — the `modules/<x>/test.js` co-location note. | Folder-convention section states the old rule. |
| 13 — Product Status Tracker | File-inventory paths pointing at test files (e.g. `services/audit/audit.service.test.js`, `server/src/test/admin.integration.test.js`). | Inventory references must match new paths. |

A full `grep` of the spec suite for stale test-path references is part of the end-of-task doc-impact pass (may surface additional docs).

---

## 7. Risk / rollback

- **Primary risk:** `vi.mock` through an alias failing to intercept a relatively-imported source module. Mitigation: caught by the after-run; fallback is `package.json "imports"` if `resolve.alias` proves insufficient.
- **Blast radius:** test files + `vitest.config.js` only; zero production source changes.
- **Rollback:** the work is one mechanical commit (or a small series); `git revert` restores co-location. History is preserved via `git mv`.

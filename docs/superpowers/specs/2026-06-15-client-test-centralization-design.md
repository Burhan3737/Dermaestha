# Design — Client Test Centralization

| Field | Value |
| --- | --- |
| Date | 2026-06-15 |
| Status | Draft — awaiting user review |
| Scope | Relocate all client test files into a single `client/test/` tree. **No test logic, assertion, or coverage change.** |
| Sources | This brainstorming session. Companion to the server design (`2026-06-15-server-test-centralization-design.md`); same goal applied to the client workspace. |
| Governance | Spec edits (ADR-40 extension + docs 03 / 09) are GATED on explicit human approval per `docs/specification/00-INDEX_AND_GOVERNANCE.md` §4–5, applied only after code is committed. |

---

## 1. Goal & non-goals

**Goal.** Move every co-located client test out of `client/src/` into a single `client/test/` tree, mirroring the source layout, so the client suite has one navigable home — symmetric with the server effort.

**Non-goals (hard constraints).**
- No test behavior change. Verbatim relocation; the only in-file edits are import / `vi.mock` specifier strings (relative → alias).
- No source-code change. Production source keeps its relative imports; only moved test files adopt the alias.
- No new features, no speculative abstraction (CLAUDE.md §2).
- The full client suite must be green before and after, with the same passing count — the verification gate.
- **Separate effort from the server move.** Different config (`client/vitest.config.js`), different files; zero overlap, so it can be planned/executed independently.

---

## 2. Completeness review (auxiliary test assets)

A sweep confirmed the client has **no** co-located test assets beyond the test files themselves:
- No `__snapshots__/` directories.
- No `__mocks__/`, `fixtures/`, `test-utils/`, or `helpers/` directories.
- No `setup` / `setupTests` / `vitest.setup` files; `client/vitest.config.js` declares no `setupFiles`.
- Inventory is exactly **40 files** (`.test.jsx` + 2 `.test.js`); no `.spec.*`, no TS, no stragglers.

Therefore the migration scope is precisely: the 40 test files + `client/vitest.config.js`. Nothing must travel alongside a test.

---

## 3. Decisions

`▸` = inherited from the server design by symmetry · `◆` = client-specific.

| # | Decision | Rationale |
| --- | --- | --- |
| ▸ D1 | **Centralize** all client tests into `client/test/`, outside `client/src/`. | One navigable home; symmetric with `server/test/`. |
| ▸ D2 | **`test/unit/` wrapper**, then mirror `src/`: `client/test/unit/<src-area>/<unit>/<Name>.test.{jsx,js}`. | Cross-workspace symmetry; gives a future client integration layer an obvious home. |
| ◆ D3 | **Client has only the unit layer** (component/view/hook/util tests). Client end-to-end coverage lives separately in the root `e2e/` Playwright harness — not under `client/test/`. | The client genuinely has one test kind; no `integration/` sibling is created now. |
| ▸ D4 | **Sub-folder per source unit** — views/components/layouts/shared each keep their own folder (they already do in `src/`). | Same disambiguation rule as the server. |
| ◆ D5 | **Module-root tests** (`doctor.routes.test.jsx`, `useDailyCall.test.jsx`, `legal.test.jsx`) sit at the module folder root in the test tree, mirroring their source location. | Faithful mirror of `src/`. |
| ◆ D6 | **Alias `#src` → `client/src`, defined in `client/vitest.config.js` only.** No `#shared` (no client test imports the shared workspace — verified). | Per-workspace `#src` = "this workspace's source"; one mental rule across server + client. |
| ◆ D7 | **Config delta lives in `client/vitest.config.js`** (not the root): keep `environment: 'jsdom'` + `globals: true`; add `resolve.alias` `#src`; change `include` `['src/**/*.test.{js,jsx}']` → `['test/**/*.test.{js,jsx}']`. | The client runs under its own jsdom config, independent of the server/root config. |

---

## 4. Target structure & examples

```
client/test/
  unit/
    context/
      session/      session.test.jsx
    layouts/
      PatientLayout/ PatientLayout.test.jsx
      SidebarLayout/ SidebarLayout.test.jsx
    lib/
      analytics/    track.test.js
      apiClient/    apiClient.test.jsx
      format/       format.test.jsx
      pdf/          renderPrescriptionPdf.test.js
      RoleRoute/    RoleRoute.test.jsx
    shared/
      Button/ Field/ Pagination/ NotFound/   (each <Name>.test.jsx)
    modules/
      admin/        components/DoctorForm/DoctorForm.test.jsx
                    views/{AdminAlerts,AdminDoctors,AdminMedicines,AdminRecords,AdminRecordDetail,AdminSettings}/<Name>.test.jsx
      appointment/  components/CancelModal/CancelModal.test.jsx
                    views/{Past,Upcoming}/<Name>.test.jsx
      auth/         views/{Login,SignUp}/<Name>.test.jsx
      booking/      views/{Booking,PaymentReturn}/<Name>.test.jsx
      doctor/       doctor.routes.test.jsx
                    components/DoctorCard/DoctorCard.test.jsx
                    views/{AvailabilityGrid,DoctorListing,DoctorProfile,DoctorToday}/<Name>.test.jsx
      legal/        legal.test.jsx
      marketing/    views/Landing/Landing.test.jsx
      prescription/ views/{PrescriptionBuilder,PrescriptionView}/<Name>.test.jsx
      profile/      views/Profile/Profile.test.jsx
      video/        useDailyCall.test.jsx
                    views/{VideoRoom,WaitingRoom}/<Name>.test.jsx
```

Import rewrite (the only in-file change), e.g.:
```js
// client/test/unit/modules/booking/views/Booking/Booking.test.jsx
import { Booking } from '#src/modules/booking/views/Booking/Booking.jsx';
vi.mock('#src/lib/apiClient/apiClient.js', ...)
vi.mock('#src/context/session/session.jsx', ...)
vi.mock('#src/lib/analytics/track.js', ...)
```

### 4.1 `client/vitest.config.js`

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '#src': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', globals: true, include: ['test/**/*.test.{js,jsx}'] },
});
```

---

## 5. Migration & verification

1. **Baseline.** Run the client suite (`npm --workspace client run test` / the configured client test script); record it is green + the passing count.
2. **Migrate.** Add the `#src` alias + new `include` to `client/vitest.config.js`; `git mv` all 40 files to their targets; rewrite each file's relative import / `vi.mock` specifiers to `#src/*`.
3. **Verify.** Re-run the client suite; fix anything red only by correcting import/mock paths until the count matches the baseline. Remove now-empty `client/src/**` test-only folders if any remain; run `eslint` + `prettier`.

Same risk and fallback as the server design: if `vi.mock('#src/...')` fails to intercept a relatively-imported source module, fall back to `package.json "imports"`. Caught by the before/after comparison.

---

## 6. Canonical doc-impact (gated, applied at end)

| Doc | Change | Why |
| --- | --- | --- |
| 11 — ADR | **Extend ADR-40** (the server-test-centralization ADR) to cover the client move, or record it under the same ADR. | Single decision record for the test-centralization reversal of ADR-26 across workspaces. |
| 09 — Dev/QA Testing | §1 client-side Vitest paragraph (currently documents `client/src/modules/<feature>/views/<View>/<View>.test.jsx` co-location + the `src/**/*.test.{js,jsx}` glob). | Describes the client layout being changed. |
| 03 — Architecture | §3a.1 if it cites client test co-location. | Folder-convention section. |

A full `grep` of the spec suite for stale client test-path references is part of the end-of-task doc-impact pass.

---

## 7. Risk / rollback

- **Primary risk:** `vi.mock` through an alias failing to intercept a relatively-imported source module. Mitigation: caught by the after-run; fallback `package.json "imports"`.
- **Blast radius:** client test files + `client/vitest.config.js` only; zero production source changes; independent of the server move.
- **Rollback:** one mechanical commit; `git revert` restores co-location. History preserved via `git mv`.

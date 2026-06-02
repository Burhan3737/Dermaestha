# 2026-06-03-0006 — slice-a-identity-access

**Status:** Partial (Slice A of 4 complete; M1+M2 journey ongoing)
**Goal:** Drive M1+M2 ("full patient journey") development as 4 vertical slices; brainstorm + spec + plan + build Slice A (Identity & Access) first.
**Skill(s) used:** superpowers:brainstorming (user-invoked); will hand off to superpowers:writing-plans
**Ticket / issue:** None
**Branch:** main (code work will move to a feature branch before any commit)
**Commits / PR:** 18 commits on `feat/slice-a-identity-access` (`8d828d2`…`9195772`); not yet merged
**Last updated:** 2026-06-03-0340
**Tags:** #feature #auth #frontend #migration

## Summary
Session to continue Dermestha development through M2. Established that M1+M2 full-stack is the whole core platform and decomposed it into 4 vertical slices (A Identity & Access → B Discovery & Availability → C Booking+Payment → D Video). Brainstormed and got approval on the Slice A design. Implementation pending.

## Context / why
Repo is at M0 (foundation only); M1 and M2 are 0%. User wants the full patient journey (discovery → book → pay → consult) end-to-end, doctor side included. The booking↔payment interlock (F03 spans M1→M2) is why the two milestones are done together.

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-03-0006-slice-a-identity-access.md` | Created | This session changelog. |
| `agentChangeLogs/index.md` | Modified | Added this session's index line. |
| `docs/superpowers/specs/2026-06-03-slice-a-identity-access-design.md` | Created | Slice A design doc (brainstorming output). |
| `docs/superpowers/plans/2026-06-03-slice-a-identity-access.md` | Created | Slice A implementation plan (writing-plans output). |
| `docs/specification/04-DATABASE_DOCUMENT.md` | Modified | Added `reset_token_hash` + `reset_token_expires_at` to `users`; v1.1. |
| `docs/specification/11-ARCHITECTURE_DECISION_RECORD.md` | Modified | Added ADR-20 (frontend state: Context + TanStack Query); v1.1. |
| `docs/specification/14-INTEGRATION_CONTRACTS_DOCUMENT.md` | Modified | Added `password_reset` email template (7th); v1.1. |
| `docs/specification/03-ARCHITECTURE_DOCUMENT.md` | Modified | Noted frontend state stack in §2; v1.1. |
| `docs/specification/05-API_SPECIFICATION_DOCUMENT.md` | Modified | Added `MUST_CHANGE_PASSWORD` code (§1, §3.2); v1.1. |
| `docs/specification/08-SECURITY_COMPLIANCE_DOCUMENT.md` | Modified | Noted reset token hashed + single-use (A07); v1.1. |
| `docs/specification/13-PRODUCT_STATUS_TRACKER.md` | Modified | Corrected M1 patient/doctor view screen IDs to doc 06 canon; v1.1. |

## Dependencies / config / schema
Planned (not yet applied, pending approval):
- Client dependency: add `@tanstack/react-query` (frontend server-cache state). New ADR in doc 11.
- Schema: add `reset_token_hash` + `reset_token_expires_at` columns to `users` (password reset). Prisma migration. Doc-04 cascade.

## Decisions
- **Decomposition:** A→B→C→D vertical slices, each its own spec→plan→build cycle. (User approved.)
- **Doctor side:** built fully (login, availability UI, doctor video room); admin doctor-onboarding stays M4, doctors seeded.
- **Reset-token storage:** two hashed columns on `users` (not a separate model, not stateless). (User chose.)
- **Test strategy:** hybrid — mocked-Prisma unit tests + a few real-DB supertest integration tests. (User chose.)
- **Frontend state:** React Context for session/auth; TanStack Query for server cache; local useState for UI. (User chose.) → ADR in doc 11.
- **Canonical screen IDs:** doc 06 is authoritative (P-04 sign-up, P-05 login+recovery, D-01 forced change); doc 13's informal IDs to be corrected.

## Notable findings
- Screen-ID mismatch between doc 13 (informal M1 backlog) and doc 06 (authoritative inventory).
- `POST /api/auth/login` body includes `role` (doc 05) but stored role must drive the decision for enumeration-safety.
- No password-reset token storage existed in the schema — gap closed by the columns decision above.

## Verification
Slice A implemented inline (subagent spawning hit a session limit, so the controller executed the plan directly with per-task TDD red→green + spec check).
- **Server suite:** 44/44 passing (13 files) via `npm test` — M0 baseline (20) + new auth suites (validate 2, resetToken 2, auth.service 10, mustChangePassword 5, auth.integration 5).
- **Client suite:** 13/13 passing (6 files) via `npm --workspace client test` — baseline RoleRoute (2) + apiClient 3, session 2, components 2, SignUp 2, Login 2.
- **Build:** `npm --workspace client run build` succeeds (98 modules; no unresolved imports).
- **Migration:** `20260602221542_add_reset_token_columns` applied to the live dev DB (additive, no partial-index edit needed).
- **Prettier:** all slice files normalized (`prettier --write`).
- **Root lint:** `npm run lint` fails — PRE-EXISTING: repo has `.eslintrc.json` but ESLint 9 needs flat `eslint.config.js`; present on `main` too, not a Slice A regression.

## Risk / rollback
Schema migration (additive columns) and a new client dependency are the only non-reversible-ish items, both pending approval. Revert = drop the two columns + remove the dependency + delete created files. Design/changelog docs are non-breaking.

## Open items / next session
- **Slice A complete.** Decide branch disposition (PR / merge to main / keep) — controller did not merge or push (awaiting user).
- **Slices B → C → D remain** for the full M1+M2 journey; each needs its own brainstorm → spec → plan → build cycle.
- Subagent spawning was blocked by a session limit (resets ~3:10am Asia/Karachi); future slices can use subagent-driven execution once available.
- doc 13 status tracker: build-status rows still show Slice A items as "Not started" (only the screen-IDs were corrected). A focused status sweep (M1 milestone, module 1 Auth, F01, F15, frontend rows) is recommended as the immediate next doc action.
- M2 video screen-IDs in doc 13 still need alignment to doc 06 (deferred to Slice C/D, per the doc-13 revision note).
- Pre-existing infra gap: root ESLint flat-config (`eslint.config.js`) missing — `npm run lint` is broken at root (not Slice A scope).

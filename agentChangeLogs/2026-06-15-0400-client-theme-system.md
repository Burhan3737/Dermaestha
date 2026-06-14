# 2026-06-15-0400 — client-theme-system

**Status:** Partial
**Goal:** Introduce a centralized, runtime-switchable theming system for the client (style/theme only — no business logic, no flow changes), ship 2–3 distinctive themes for the boutique-teledermatology market, and expose a scoped admin "Appearance" tab to switch themes — with the least possible change to view code.
**Skill(s) used:** superpowers:brainstorming (opted in, run autonomously per user delegation); frontend-design (opted in); deep-research / web (planned for palette exploration)
**Ticket / issue:** None
**Branch:** feature/client-theme-system
**Commits / PR:** (in progress — committing on branch; NOT pushing per CLAUDE.md)
**Last updated:** 2026-06-15-0400
**Tags:** #refactor #frontend #design #theming

## Summary
Redesign of the app's visual theme as a pure client-side, style-only change. The existing styling already uses CSS custom properties (`client/src/styles/tokens.css`) consumed by semantic classes (`client/src/styles/components.css`) — an ideal base. Work introduces a layered token architecture (invariant scale vs. swappable palettes), a small client-only theme runtime (`data-theme` attribute + `localStorage`, no API/DB), 2–3 distinctive themes, and an admin Appearance tab. No business logic, routes-as-flows, or server code is touched; the only new route is the admin Appearance tab the user explicitly requested.

## Context / why
User requested a full design/theme refactor, client-side only, with themes living in a single consolidated place, switchable without per-screen edits via a scoped admin tab, offering 2–3 distinct directions appropriate to the boutique teledermatology market (distinct from generalist competitors Marham/OlaDoc/Sehat Kahani). Authorized autonomous decision-making and a dedicated branch; explicitly forbade business-logic/flow changes.

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-15-0400-client-theme-system.md` | Created | This session log |
| `agentChangeLogs/index.md` | Modified | Index entry for this session |

## Dependencies / config / schema
None yet. (Plan: no new runtime dependencies; theme persistence is client-side `localStorage` only — no schema/env/API change.)

## Decisions
- **Client-only persistence:** Theme is applied via a `data-theme` attribute on `<html>` and persisted in `localStorage`. A server-backed *global* admin setting would require API + DB + config changes (backend / business logic) and is therefore OUT OF SCOPE; recorded as the natural follow-up.
- **Default stays byte-identical:** The current "spruce" palette remains the default (unset / `data-theme="spruce"`), so the app is visually unchanged unless an admin selects another theme. Safety + reversibility.
- **Layered tokens:** Invariant scale (spacing/radius/type/layout/motion) stays in `tokens.css`; swappable palettes live in one consolidated themes layer. Single place to manage.
- **Tokenize residual literals:** A few raw values in `components.css` (`#fff` on-color, disabled/tab grays, focus-ring/backdrop `rgba`) become tokens so every theme controls them — this also restores doc-06's "no raw hex in components.css" rule.

## Notable findings
- View layer is ~98% token-pure. Only real color leaks: `Landing.jsx:174` (`#fff`) and `LegalPage.jsx:24-26` (references to non-existent `--color-warn`/`--color-warn-bg`, silently falling back to orange — a latent bug as well as a theming leak).
- Stack: React 19 + Vite 5, plain CSS (no Tailwind/CSS-in-JS). `main.jsx` imports `tokens.css` then `components.css`.
- `index.html` has no inline theme bootstrap — will add a tiny pre-paint script to avoid a flash of the default theme.

## Verification
Not verified yet. (Plan: client `npm --workspace client run test`, `npm run build:client`, lint, and before/after visual capture across themes.)

## Risk / rollback
Low. Additive + default-unchanged. Rollback = delete branch. No server/data changes.

## Open items / next session
- Finalize 2–3 theme palettes (research-backed).
- Implement token split + themes layer + runtime + admin Appearance tab + fix 2 view leaks.
- Before/after visual report across themes.
- Doc-impact check vs. specs (esp. doc 06 design system) — track, present verdict at end.

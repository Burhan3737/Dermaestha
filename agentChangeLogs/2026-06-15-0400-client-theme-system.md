# 2026-06-15-0400 — client-theme-system

**Status:** Partial
**Goal:** Introduce a centralized, runtime-switchable theming system for the client (style/theme only — no business logic, no flow changes), ship 2–3 distinctive themes for the boutique-teledermatology market, and expose a scoped admin "Appearance" tab to switch themes — with the least possible change to view code.
**Skill(s) used:** superpowers:brainstorming (opted in, run autonomously per user delegation); frontend-design (opted in); deep-research / web (planned for palette exploration)
**Ticket / issue:** None
**Branch:** feature/client-theme-system
**Commits / PR:** (in progress — committing on branch; NOT pushing per CLAUDE.md)
**Last updated:** 2026-06-15-0430
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
| `client/src/styles/tokens.css` | Modified | Added 8 themeable "extended role" tokens (on-accent/on-danger/on-dark-strong/text-disabled/tab-inactive/focus-ring/focus-ring-soft/backdrop) with spruce-default values |
| `client/src/styles/components.css` | Modified | Tokenized 14 residual literals (white-on-color, disabled/tab grays, focus-ring/backdrop rgba) → tokens; restores doc-06 "no raw hex" rule and makes them themeable |
| `client/src/styles/themes.css` | Created | New swappable theme-palette layer (`:root[data-theme="<id>"]` blocks); header now, palettes appended after design exploration |
| `client/src/lib/theme/theme.js` | Created | Client-only theme runtime: STORAGE_KEY, DEFAULT_THEME, THEMES registry, init/apply/set/getActive (data-theme + localStorage; no API/DB) |
| `client/src/main.jsx` | Modified | Import `themes.css` + call `initTheme()` before render |
| `client/index.html` | Modified | Pre-paint inline theme bootstrap (no flash-of-wrong-theme) |
| `client/src/modules/marketing/views/Landing/Landing.jsx` | Modified | Removed hardcoded `color:'#fff'` on a feature-band heading → inherits themeable `.feature .display` color |
| `client/src/modules/legal/components/LegalPage/LegalPage.jsx` | Modified | Fixed DRAFT banner's broken `--color-warn`/`--color-warn-bg` refs (silent orange fallback) → real `--color-warning`/`--color-warning-bg` (latent bug + theming leak) |
| `client/__theme_preview__/gallery.html` | Created (subagent) | Reusable theme-gallery harness built from the real production CSS (`?screen=&theme=` URLs) |
| `theme-redesign/METHOD.md`, `theme-redesign/before/**` | Created (subagent) | Before-state baseline: 24 desktop + 6 mobile + component inventory + 6 live public screens |

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
- Foundation pass (spruce-identical): `npm --workspace client run build` → clean (356 modules, CSS 19.2 kB). `npm --workspace client run test` → **135/135 passed (40 files)**. components.css grep confirms no raw theme-coupled hex remains (only `var(--color-on-dark-strong, #fff)` defensive fallbacks).
- Pending: per-theme AA contrast verification + before/after visual capture across themes.

## Risk / rollback
Low. Additive + default-unchanged. Rollback = delete branch. No server/data changes.

## Open items / next session
- Finalize 2–3 theme palettes (research-backed).
- Implement token split + themes layer + runtime + admin Appearance tab + fix 2 view leaks.
- Before/after visual report across themes.
- Doc-impact check vs. specs (esp. doc 06 design system) — track, present verdict at end.

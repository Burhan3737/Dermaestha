# 2026-06-15-0400 — client-theme-system

**Status:** Completed
**Goal:** Introduce a centralized, runtime-switchable theming system for the client (style/theme only — no business logic, no flow changes), ship 2–3 distinctive themes for the boutique-teledermatology market, and expose a scoped admin "Appearance" tab to switch themes — with the least possible change to view code.
**Skill(s) used:** superpowers:brainstorming (opted in, run autonomously per user delegation); frontend-design (opted in); deep-research / web (planned for palette exploration)
**Ticket / issue:** None
**Branch:** feature/client-theme-system
**Commits / PR:** 11 commits on `feature/client-theme-system` (dae1acc…HEAD); NOT pushed/merged per CLAUDE.md — awaiting user
**Last updated:** 2026-06-15-0555
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
| `client/src/styles/themes.css` | Created | Swappable theme-palette layer with 3 AA-tuned palettes — Ivory & Ink (default), Derma Noir (dark), Sage & Blush (spa); each = full colour set + extended role tokens + radius scale + display serif. (spruce = base `:root`, no block) |
| `theme-redesign/verify-contrast.mjs` | Created | Independent WCAG-AA verifier: parses the real token files, computes ratios for every critical pair, all 4 themes. Result: new themes 0 hard failures; spruce 4 pre-existing |
| `client/src/lib/theme/theme.js` | Created | Client-only theme runtime: STORAGE_KEY, DEFAULT_THEME (=ivory-ink), THEMES registry (4 themes + swatches), lazy per-theme display-font loader, init/apply/set/getActive (data-theme + localStorage; no API/DB) |
| `client/src/styles/tokens.css` (2nd) | Modified | Added `--font-display` token (default = `--font-head`/Archivo) for the serif heading split |
| `client/src/styles/components.css` (2nd) | Modified | Routed 8 true-heading rules (`.display/.h1/.h2/.h3/.doc-card__name/.brand__word/.auth-panel__word/.auth-panel__headline`) through `--font-display`; small labels stay `--font-head` |
| `client/index.html` (2nd) | Modified | Bootstrap default → `ivory-ink`; statically load Fraunces (default theme's serif) |
| `client/src/main.jsx` | Modified | Import `themes.css` + call `initTheme()` before render |
| `client/index.html` | Modified | Pre-paint inline theme bootstrap (no flash-of-wrong-theme) |
| `client/src/modules/marketing/views/Landing/Landing.jsx` | Modified | Removed hardcoded `color:'#fff'` on a feature-band heading → inherits themeable `.feature .display` color |
| `client/src/modules/legal/components/LegalPage/LegalPage.jsx` | Modified | Fixed DRAFT banner's broken `--color-warn`/`--color-warn-bg` refs (silent orange fallback) → real `--color-warning`/`--color-warning-bg` (latent bug + theming leak) |
| `client/__theme_preview__/gallery.html` | Created (subagent) | Reusable theme-gallery harness built from the real production CSS (`?screen=&theme=` URLs) |
| `theme-redesign/METHOD.md`, `theme-redesign/before/**` | Created (subagent) | Before-state baseline: 24 desktop + 6 mobile + component inventory + 6 live public screens |
| `client/src/modules/admin/views/AdminAppearance/AdminAppearance.jsx` | Created | A-06 Appearance view: theme cards (swatches + tagline) + live component preview; pure client (setTheme) |
| `client/src/modules/admin/admin.routes.jsx` | Modified | Register AdminAppearance: import + `ADMIN_LINKS` "Appearance" entry + `/admin/appearance` route |
| `client/src/styles/components.css` (3rd) | Modified | Added `.tabs`/`.tab`/`.tab--active` themeable tab-nav (was unstyled → illegible on dark) with a control reset so `<button class=tab>` matches `<a class=tab>`; global `a {}` themes bare content links (admin "View", auth recovery) to a brand colour (default browser blue is unreadable on dark). CSS-only — no view edits |
| `client/test/unit/lib/theme/theme.test.js` | Created | 6 unit tests for the theme runtime (apply/persist/init/fallback/registry) — client 135→141 |
| `docs/specification/02,06,11,12,13` | Modified | Spec sweep (applied at END, surgical, version-bumped + revision footers): F17 (02 v1.5); §8 Theming + A-06 registry + `.tabs` (06 v1.7); ADR-41 (11 v1.18); TC-F17-001/002 (12 v1.8); F17/A-06 Built status (13 v1.22) |
| `docs/theme-redesign/THEME-DESIGN.md` | Created | Authoritative theming-system + redesign rationale (architecture, themes, AA, perf, how-to-extend, follow-ups) |
| `theme-redesign/report.md`, `theme-redesign/after/**` | Created (subagents + controller) | Before/after visual report + 3-theme after captures (24 desktop + responsive mobile + component inventory per theme) |
| `client/__theme_preview__/gallery.html` (2nd) | Modified (subagents + controller) | Load the 3 display serifs; cache-bust params for after-pass re-captures |

## Dependencies / config / schema
None yet. (Plan: no new runtime dependencies; theme persistence is client-side `localStorage` only — no schema/env/API change.)

## Decisions
- **Client-only persistence:** Theme is applied via a `data-theme` attribute on `<html>` and persisted in `localStorage`. A server-backed *global* admin setting would require API + DB + config changes (backend / business logic) and is therefore OUT OF SCOPE; recorded as the natural follow-up.
- **Default stays byte-identical:** The current "spruce" palette remains the default (unset / `data-theme="spruce"`), so the app is visually unchanged unless an admin selects another theme. Safety + reversibility.
- **Layered tokens:** Invariant scale (spacing/radius/type/layout/motion) stays in `tokens.css`; swappable palettes live in one consolidated themes layer. Single place to manage.
- **Tokenize residual literals:** A few raw values in `components.css` (`#fff` on-color, disabled/tab grays, focus-ring/backdrop `rgba`) become tokens so every theme controls them — this also restores doc-06's "no raw hex in components.css" rule.
- **Three finalist themes (research + adversarial workflow):** Ivory & Ink (warm bone/ink + burnt amber; **recommended live default**), Derma Noir (dark aubergine + jade/rose-gold), Sage & Blush (greige + sage/clay-rose). Chosen for a *real range* (light-editorial / dark-immersive / warm-spa) and deliberate distinctness from the Pakistani incumbents' "medical-blue + hot-accent + Bootstrap-sans" monoculture.
- **Live default flipped to `ivory-ink`:** the app "wakes up redesigned." It is the most cohesive + broadly-credible + fully-AA option per both the director and my independent check. Spruce stays one click away (Appearance tab) and one `localStorage` clear away — fully reversible, no broken intermediate state.
- **Serif via `--font-display` split + lazy font loading:** body stays Hanken (never blocks paint); only the active theme's display serif loads (Fraunces preloaded for the default; DM Serif Display / Newsreader lazy). Protects the 3G budget. Self-hosting + subsetting noted as a follow-up.

## Notable findings
- View layer is ~98% token-pure. Only real color leaks: `Landing.jsx:174` (`#fff`) and `LegalPage.jsx:24-26` (references to non-existent `--color-warn`/`--color-warn-bg`, silently falling back to orange — a latent bug as well as a theming leak).
- Stack: React 19 + Vite 5, plain CSS (no Tailwind/CSS-in-JS). `main.jsx` imports `tokens.css` then `components.css`.
- `index.html` has no inline theme bootstrap — added a tiny pre-paint script to avoid a flash of the default theme.
- **Integration gap caught during implementation (not in the design brief):** Derma Noir's `--color-danger` is a *light* coral (correct as danger text on dark), but the app fills `.btn--danger`/video-leave with it under white text → AA fail. Fixed by adding a themed `--color-on-danger` (dark for Derma Noir, white elsewhere). The token contract sent to the design workflow lacked an `on-danger` slot — recorded so future contracts include it.
- **`--font-head` is overloaded** (headings AND 11px labels/badges/table-headers). Swapping it wholesale to a serif would ruin small-label legibility, so a dedicated `--font-display` token was introduced for true headings only.
- Independent contrast check found the design director's "0 failures" was optimistic about the decorative `primary-border` hairline; confirmed it's non-critical (slots are identified by label + selected state).
- **Visual QA (after-capture) caught two real defects the dark theme exposed**, both pre-existing unstyled markup made visible by Derma Noir: (1) `<button class="tab">` (D-02/A-04) showed native UA button chrome — my first `.tab` rule only set `border-bottom`; fixed with a control reset (`appearance/background/border/font`) so `<button>` and `<a>` tabs match. (2) Bare content links (admin "View", auth recovery) rendered default browser-blue — illegible on the dark surface; fixed with a global themeable `a { color: var(--color-primary) }` (class-styled links unaffected by specificity). Both CSS-only, no view edits, required for the dark theme to be correct.

## Verification
- Foundation pass (spruce-identical): build clean; **135/135 client tests passed**; components.css free of theme-coupled raw hex.
- Full theme system: `npm --workspace client run build` clean (CSS 23.4 kB, +1.1 kB gzip for 3 palettes); **135/135 tests still pass**.
- **Independent WCAG-AA contrast verification** (`theme-redesign/verify-contrast.mjs`, parses the real CSS): **Ivory & Ink / Derma Noir / Sage & Blush = 0 hard failures** across all text + functional control-boundary pairs. Spruce (unmodified original) shows 4 pre-existing sub-threshold pairs (brass-on-accent, warning-on-tint, tab-inactive, border-strong) — documented in doc-06 §4, out of scope. The only sub-3:1 value in the new themes is the *decorative* `primary-border` slot hairline (by design; the functional `border-strong` passes 3:1 in all three).
- **Final state (all green):** `npm --workspace client run build` clean; **141/141 client tests pass**; `node theme-redesign/verify-contrast.mjs` → **new themes 0 AA hard failures** (spruce's 4 are pre-existing/original).
- **Visual confirmation (controller, via Playwright + the harness):** Derma Noir D-02 and Ivory & Ink A-04 reviewed directly; computed-style checks confirmed the `.tab` control-reset (both `<a>`/`<button>` flat, jade/ink underline) and that bare "View" links now resolve to the theme primary (jade on dark), not browser-blue. After-captures refreshed for the 5 affected screens × 3 themes.

## Risk / rollback
Low. Additive + default-unchanged. Rollback = delete branch. No server/data changes.

## Open items / next session
**This session is complete.** All code committed on `feature/client-theme-system` (11 commits); NOT pushed/merged (awaiting user per CLAUDE.md). The themeable token system, the 3 new themes + spruce fallback, the admin Appearance tab, the `.tab`/bare-link completions, the before/after report, the design rationale doc, and the spec sweep are all done and verified.

**Doc-impact verdict — APPLIED.** Tracked updates were applied at the END (after all code was committed), surgically per the doc-00 change protocol (version bumps + revision footers), under the user's explicit autonomous-decision delegation:
- **Doc 02** → F17 (admin appearance/theme switcher, post-PRD) + ID map. v1.4→**1.5**.
- **Doc 06** → §8 Theming system + A-06 in the screen registry (24→25) + Appearance sidebar link + new `.tabs` component. v1.6→**1.7**.
- **Doc 11** → ADR-41 (client-side runtime theming; builds on ADR-06) + index. v1.17→**1.18**.
- **Doc 12** → TC-F17-001/002. v1.7→**1.8**.
- **Doc 13** → F17/A-06 Built status row + admin-views checklist. v1.21→**1.22**.
- **Doc 15** → **NOT changed** (theme constants are client UI, documented in doc 06 — not a server tunable/env var; defensible scope call).
Mid-build decisions/edge-cases that fed the spec (per CLAUDE.md, the common drift source): the `--color-on-danger` dark-theme fix, the `--font-display` heading-serif split, and the `.tab`/bare-link completions — all reflected in ADR-41 + doc 06 §8.

**Follow-ups (out of scope here — for the user to weigh):**
- **Server-backed GLOBAL theme** (all users, not per-browser) — needs API + DB column + config (backend; intentionally excluded from this client-only, style-only change). The runtime is structured to read a server value later.
- **Self-host + subset** the 3 display serifs to `latin` + pin variable axes — biggest 3G payload win; removes the Google Fonts dependency.
- **Style the remaining pre-existing unstyled** `.appt-row`/`.status-card`/`.empty-state` (legible but plain in all themes incl. original spruce) — a design-polish task beyond theming.
- **Default theme choice** — keep Ivory & Ink live, or revert to Spruce (one line each in `theme.js` `DEFAULT_THEME` + the `index.html` bootstrap).
- **Push/merge** the branch (held per CLAUDE.md).

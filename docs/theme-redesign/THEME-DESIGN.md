# Dermestha — Theming System & Visual Redesign

> **Status:** Implemented on branch `feature/client-theme-system` (not merged/pushed).
> **Scope:** Style / theme only. **No business logic, no data flow, no API/DB, no end-to-end flow changes.** Client-side only.
> This document explains the theming architecture, the three new themes, the accessibility posture, the performance plan, and how to operate/extend the system. It is a working design note — it is **not** part of the canonical `docs/specification/` suite (those edits are tracked separately).

---

## 1. What changed, in one paragraph

Dermestha already styled itself with CSS custom properties (`client/src/styles/tokens.css`) consumed by semantic classes (`client/src/styles/components.css`); views reference classes, not colours. We turned that into a **runtime-switchable, multi-theme system** without touching screen logic: the swappable colours/shape/type now live in one place (`client/src/styles/themes.css`), a tiny client-only runtime (`client/src/lib/theme/theme.js`) applies a theme via a `data-theme` attribute on `<html>` and remembers it in `localStorage`, and an admin **Appearance** tab (`/admin/appearance`) lets an administrator switch themes. Because every screen already reads `var(--color-…)`, **swapping a theme changes zero view code.** We ship four selectable themes — **Ivory & Ink** (new live default), **Derma Noir**, **Sage & Blush**, and the original **Spruce** (one click away as a safe fallback).

---

## 2. Architecture

### 2.1 Layered tokens — "scale" vs "palette"

| Layer | File | What lives here | Theme-varying? |
|---|---|---|---|
| **Invariant scale** | `client/src/styles/tokens.css` (`:root`) | spacing (`--sp-*`), type scale (`--fs-*`), layout (`--maxw`, `--sidebar-w`), motion (`--ease`), the **default (spruce) palette**, and the **default values** of every themeable token | No |
| **Swappable palettes** | `client/src/styles/themes.css` | one `:root[data-theme="<id>"]` block per non-default theme: the full colour set + extended role tokens + radius scale + display serif | Yes |
| **Consumers** | `client/src/styles/components.css` + views | semantic classes that reference `var(--…)` only | n/a |

**Why a base `:root` is enough for spruce.** A `:root[data-theme="x"]` selector has higher specificity (0,2,0) than a bare `:root` (0,1,0), so a theme block always wins regardless of stylesheet order. That means "spruce" needs **no** block — it's simply the base `:root`, and selecting it clears any override. Adding a theme = adding one block; removing one = deleting one block. Single source, no scatter.

### 2.2 The themeable token contract

Every theme provides values for: the brand set (`--color-primary*`, `--color-on-primary`), the accent set (`--color-accent*`, `--color-on-accent`), neutrals/surface/ink (`--color-bg`, `--color-surface`, `--color-surface-sunken`, `--color-border`, `--color-border-strong`, `--color-text-strong|body|muted|disabled`, `--color-tab-inactive`), the feature dark-band (`--color-feature-bg`, `--color-on-dark*`), immersive video chrome (`--color-dark-*`), semantic status (`--color-success|info|warning|danger|neutral` + `-bg`, `--color-danger-deep`), effects (`--focus-ring`, `--focus-ring-soft`, `--backdrop`, `--shadow-overlay`), the radius scale (`--r-sm|md|lg`), and the heading font (`--font-display`).

**New tokens introduced this change** (defaults preserve spruce exactly): `--color-on-accent`, `--color-on-danger`, `--color-on-dark-strong`, `--color-text-disabled`, `--color-tab-inactive`, `--focus-ring`, `--focus-ring-soft`, `--backdrop`, and `--font-display`. Introducing these also let us tokenize the last raw literals in `components.css`, restoring doc-06's "no raw hex in components.css" rule (it is now literally true; the only remaining `#fff` are defensive `var(--…, #fff)` fallbacks).

### 2.3 The `--font-display` split

`--font-head` (Archivo) powers both headings **and** 11px uppercase labels/badges/table-headers. A display serif at 11px would be illegible, so themes change a dedicated `--font-display` token used by true headings only (`.display/.h1/.h2/.h3/.doc-card__name/.brand__word/.auth-panel__word/.auth-panel__headline`). Small UI labels stay on the grotesque `--font-head`. Default `--font-display` = `--font-head`, so spruce is unchanged.

### 2.4 Runtime (client-only, no business logic)

`client/src/lib/theme/theme.js`:
- `STORAGE_KEY = 'dermestha.theme'`, `DEFAULT_THEME = 'ivory-ink'`.
- `THEMES` — the registry (id, label, tagline, preview swatches) the Appearance tab renders.
- `applyTheme(id)` sets `data-theme` + lazy-loads that theme's display webfont; `setTheme(id)` also persists to `localStorage`; `initTheme()` runs once at startup; `getActiveTheme()` reads the current id.
- **No network, no API, no server state.** A globally-enforced (all-users) theme would require a backend setting — see §6 follow-ups.

`client/index.html` runs a tiny **pre-paint** inline script that sets `data-theme` from `localStorage` (or the default) before first paint, so there is no flash of the wrong theme. (Keep its default id in sync with `DEFAULT_THEME`.)

### 2.5 Admin Appearance tab (A-06)

`/admin/appearance` (`AdminAppearance.jsx`) renders a card per theme (swatch strip + tagline + Apply) plus a live component preview. Selecting a theme calls `setTheme()` — it re-colours every screen instantly and persists in that browser. It is a cosmetic switch (no confirm gate, unlike the money-affecting A-05 settings).

---

## 3. Market positioning — the lane we are leaving

The Pakistani incumbents (oladoc, Marham, Shifa4U, Healthwire, Sehat Kahani) share one visual monoculture: a saturated **medical blue / teal** primary, a **hot red/orange action accent**, default Bootstrap-grade sans, pure-white grounds, and marketplace density (specialty grids, pill-search heroes, trust-badge rows). Dermestha's thesis is to read as a **private dermatology clinic / luxury skincare house**, not a doctor-search engine. Every new theme commits to: a **warm, desaturated neutral ground** carrying ~80% of each screen, **no medical-blue primary**, **one disciplined accent**, an **editorial serif** for headlines, and calm single-focus layouts. (Full avoided-tropes list and the rejected candidates — Glacier Ink's crowded ink-navy, Saffron Atelier's flag-coded saffron+jade, Porcelain & Brass's overlap with Ivory & Ink — are in the design-exploration record.)

---

## 4. The themes

| Theme | Pole | Ground | Brand | Accent | Geometry | Display serif |
|---|---|---|---|---|---|---|
| **Ivory & Ink** *(default)* | light editorial / neutral-luxe | warm bone `#EFE8DA` | warm near-black ink `#211C17` | burnt amber `#A8531A` | sharp 1/2/4px | Fraunces |
| **Derma Noir** | dark / immersive | aubergine-charcoal `#100C16` | fresh jade `#6FD8B0` | rose-gold `#D9A893` | soft 6/10/14px | DM Serif Display |
| **Sage & Blush** | warm spa / soft | greige `#ECE7DE` | grayed sage `#41624E` | clay-rose `#9E5048` | gentle 8/12/16px | Newsreader |
| **Spruce** *(original)* | clinical apothecary | cool porcelain `#E8ECE9` | deep spruce `#0F3A2A` | brass `#B5852F` | square 3/4/6px | Archivo |

They are deliberately **three different worlds**, not three tints of one idea — an ink-button app vs a jade-on-black app vs a sage-button app — so an admin gets a real range across temperature, value, hue, geometry and type.

- **Ivory & Ink (live default).** A bone-and-ink magazine system where *ink is the brand* (buttons/links/headings are warm near-black on porcelain) and a single burnt-amber accent is the only saturated colour. The most gender-neutral and clinically credible of the three — reads clinical-grade to acne/eczema/male patients, not beauty-only — which is why it ships as the front door.
- **Derma Noir.** A *designed* dark mood-mode (not an algorithmic invert) for evening teleconsults and the video stage; cards lift a genuine elevation step, jade pops, rose-gold glows. Note the intentional inversion: on dark, the text-safe `--color-accent-deep` is *lighter* than the fill accent, and `--color-danger-deep` is a lighter error ink.
- **Sage & Blush.** A soft clinical-spa palette — sage brand, dusty clay-rose accent, warm greige — the most "treatment-room" of the set, with generous rounding.

---

## 5. Accessibility

All three new themes were generated and then **adversarially repaired for WCAG 2.1 AA**, and independently re-verified by `theme-redesign/verify-contrast.mjs` (which parses the real CSS — no hand-copied values — and computes ratios for every critical pair).

**Result: Ivory & Ink, Derma Noir, Sage & Blush each have 0 hard failures** across body/heading/muted text on both canvas and card grounds, on-primary/on-accent/on-danger button text, all semantic status text on its tint, the feature band, the immersive video chrome, inactive tab labels (treated as real navigation, ≥4.5:1), and the functional input/control boundary `--color-border-strong` (≥3:1).

Two notes of honesty:
- The faint `--color-primary-border` *slot hairline* sits below 3:1 in every theme (including the original spruce). It is **decorative** — an available slot is identified by its label and its high-contrast selected state, not this outline — so it is not a WCAG 1.4.11 control boundary. Kept subtle by design.
- **Spruce (the unmodified original)** retains 4 pre-existing sub-threshold pairs (brass-on-accent, warning-on-tint, inactive-tab, border-strong), documented in doc-06 §4. We did not "improve" the original (surgical rule); these are out of scope.

**Discipline rules the palettes assume (already true in the codebase):** (1) `--color-accent` is fill / large-bold / non-text only — small accent text uses `--color-accent-deep`; (2) status is never colour-only — every state pairs colour with an icon + label (this also protects the warm themes where danger/warning/accent share a red-amber band under deuteranopia).

---

## 6. Performance & fonts (Pakistani 3G)

- **Body stays Hanken Grotesk** (with a system fallback) for every theme, so first paint never blocks on a webfont.
- **One display serif per active theme**, never all at once. The default theme's serif (Fraunces) and spruce's (Archivo) are loaded statically in `index.html`; Derma Noir's (DM Serif Display) and Sage & Blush's (Newsreader) are **lazy-injected** by `theme.js` only when that theme is selected.
- Serifs render at headline sizes only (≥24px, or ≥18.66px bold) via the `--font-display` split — never body — so high-contrast hairlines never degrade legibility on low-DPI Android.
- **Follow-up (recommended):** self-host + subset each display face to `latin` and pin the variable axes to the weights actually used. This is the single biggest payload win and removes the third-party Google Fonts dependency. Not done in this pass to keep the change surgical.

---

## 7. Operating the system

- **Switch theme:** Admin → **Appearance** → *Apply* on a theme card. Applies instantly app-wide; remembered in that browser.
- **Change the live default for new visitors:** set `DEFAULT_THEME` in `client/src/lib/theme/theme.js` **and** the matching id in the `index.html` pre-paint script.
- **Revert to the original look:** pick **Spruce** in Appearance, or clear the `dermestha.theme` localStorage key.
- **Add a new theme:** (1) add a `:root[data-theme="my-theme"] { … }` block to `themes.css` (copy an existing block, retune values, keep AA — run `node theme-redesign/verify-contrast.mjs`); (2) add a `THEMES` entry in `theme.js` (id/label/tagline/swatches); (3) if it uses a new display serif, add it to `THEME_FONT_HREFS`. No screen code changes.

---

## 8. Known follow-ups (out of scope for this client-only change)

- **Server-backed global theme** — persist the active theme as an admin/platform setting (API + DB column + config) so it applies to *all* users, not per-browser. This crosses into the backend/business-logic layer, hence excluded from this style-only change. The client runtime is already structured to read a server value if one is later provided.
- **Self-host + subset the display fonts** (see §6).
- **Optional:** wire the Appearance choice into the existing A-05 settings surface once server persistence exists.

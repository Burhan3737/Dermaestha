# Theme Redesign — BEFORE baseline capture method

This document records exactly how the `theme-redesign/before/` screenshots were produced so
the **after** pass can reproduce them identically (same harness, same widths, same screen IDs).

## TL;DR

- **Harness:** `client/__theme_preview__/gallery.html` — a single self-contained HTML page that
  links the **real production CSS** and renders every screen surface with realistic placeholder
  content. No build step, no React, no backend.
- **Serve it:** a static file server rooted at `client/` (so the harness's `../src/...` relative
  links resolve to the real stylesheets).
- **Capture:** Playwright (via the MCP browser tools) — set viewport width, navigate to
  `gallery.html?screen=<ID>`, take a `fullPage` PNG.
- **Theme switch:** `document.documentElement.dataset.theme` (settable via `?theme=<name>` on the
  URL, or the toolbar `<select>`). Default (no attribute) = current "spruce" green theme.

## 1. The harness — `client/__theme_preview__/gallery.html`

It links, in this order (matching `client/src/main.jsx`, plus a future themes slot):

```html
<link rel="stylesheet" href="../src/styles/tokens.css" />
<link rel="stylesheet" href="../src/styles/themes.css" onerror="this.remove()" />  <!-- 404 today; handled -->
<link rel="stylesheet" href="../src/styles/components.css" />
<link rel="stylesheet" href="../src/modules/marketing/views/Landing/Landing.css" />
```

plus the same Google Fonts as `client/index.html` (Archivo 700/800 + Hanken Grotesk 400/500/600/700).

`src/styles/themes.css` does **not exist yet** — that is expected. The `onerror="this.remove()"`
keeps the page from breaking on its 404. The after-pass will likely create that file; if it does,
it loads automatically (no harness change needed).

### Single-screen capture mode + theme switch (the important bit for reproduction)

A small inline script reads the URL query string:

- `?screen=<ID>` — hides all harness chrome (toolbar, index, section labels) and shows **only** the
  one targeted surface, full-bleed, so a `fullPage` screenshot equals exactly that screen.
  `<ID>` is any registry ID (`P-01`…`A-05`) or `inventory`.
- `?theme=<name>` — sets `document.documentElement.dataset.theme = "<name>"` before paint.
  Omit it (or use `?theme=` empty) for the default spruce look.

Examples:
- `gallery.html?screen=P-03` → P-03 only, spruce theme.
- `gallery.html?screen=P-03&theme=after` → P-03 only, with `data-theme="after"` applied.
- `gallery.html` (no query) → the full scrollable gallery with labels + a theme `<select>`, for
  human browsing.

### Fidelity notes (what the markup is built from)

Markup and CSS class usage were reproduced by reading the real views under
`client/src/modules/**/views/**` and the shared components (`shared/Button`, `shared/Field`,
`shared/Alert`, `shared/SlotButton`, `shared/Pagination`, layouts `PatientLayout` /
`AuthSplitLayout` / `SidebarLayout`, `DoctorCard`, `CancelModal`, `DoctorCancelModal`,
`MedicineSearch`, `DoctorForm`). Currency/date strings follow `lib/format/format.js`
(`formatPkr` → `Rs 2,500`; the Landing's static cards keep their hard-coded `PKR 2,000`).

Deliberate, documented deviations (kept faithful to the **design system** + the screen registry):

1. **Doctor photos** render as `DoctorCard`'s real initials-fallback block (`.avatar.avatar--lg`
   filling `.doc-card__img`). This is a genuine app code path, is deterministic/offline-safe, and
   uses theme tokens — so it actually reflects a theme change and is identical across before/after.
   (The live site uses remote `randomuser.me` photos; see the live captures.)
2. **P-06 Booking** shows the `.stepper` component (registry defines P-06 as a slot/who-for/pay
   stepper). The current `Booking.jsx` doesn't mount a stepper; it's added here to represent the
   intended flow and exercise the shipped `.stepper` component.
3. **P-13 Prescription** is rendered with the shipped `.rx-item / .rx-total / .tag-unpriced`
   "rx-paper" components (registry: "the rx-paper document"). The current `PrescriptionView.jsx`
   renders a simpler `ul/li` scaffold.
4. **Video chrome (P-12 / D-04):** `.video-page/.video-timer/.video-warning/.video-controls` have
   no CSS in the app; a centered max-width container + padding was added only for legible capture.
   The styled `.video-stage/.video-self/.video-ctrl` are the real components.
5. Several appointment/list classes (`.tabs/.tab/.appt-row/.status-card/.empty-state`) have **no CSS
   in the codebase today** — they render as plain text blocks in the app and here too (the honest
   "before"). Only `tokens.css` + `components.css` + `Landing.css` carry styling.

## 2. Serving the harness

Root the static server at `client/` so `../src/...` resolves. Either of these works:

```bash
# Option A — Python (used for this capture)
cd client
python -m http.server 8099 --bind 127.0.0.1

# Option B — Node
cd client
npx --yes serve -l 8099 .
```

Harness URL: `http://127.0.0.1:8099/__theme_preview__/gallery.html`

Verified the real CSS loads (HTTP 200 on `tokens.css`, `components.css`, `Landing.css`;
`themes.css` → 404 by design and is removed by the `onerror` handler). The only console noise is
that themes.css 404 and a `favicon.ico` 404 — both harmless.

## 3. Capturing with Playwright (MCP browser tools)

Per screen:
1. `browser_resize` to the target width (height is not critical — `fullPage` captures full content).
   - Desktop: **1440 × 1024**
   - Mobile: **390 × 844**
2. `browser_navigate` to `…/gallery.html?screen=<ID>` (add `&theme=after` for the after-pass).
3. `browser_take_screenshot` with `fullPage: true`, `type: "png"`, and
   `filename: "theme-redesign/before/<ID>-<width>.png"`.
   (The MCP screenshot output base is the repo root, so a path-prefixed filename lands the PNG
   directly in `theme-redesign/before/`.)

**Important for fidelity:** load `?screen=P-01` once first so the Google Fonts get cached; otherwise
the very first capture can paint in a fallback font. After that, every navigate→screenshot pair
renders Archivo/Hanken immediately.

For the **after** pass, repeat the exact same IDs/widths but write to a sibling `after/` folder
(e.g. `theme-redesign/after/<ID>-<width>.png`) and add `&theme=<after-theme-name>` to each URL.

## 4. What was captured

### Static gallery — `theme-redesign/before/` (31 PNGs)

Desktop @ 1440px — all 24 registry surfaces:
`P-01 P-02 P-03 P-04 P-05 P-06 P-07 P-08 P-09 P-10 P-11 P-12 P-13`
`D-01 D-02 D-03 D-04 D-05 D-06`
`A-01 A-02 A-03 A-04 A-05`
→ files `…-desktop.png`.

Mobile @ 390px — the responsive patient screens: `P-01 P-02 P-03 P-06 P-08 P-13`
→ files `…-mobile.png`.

Component inventory @ 1440px → `component-inventory.png`
(buttons incl. hover/focus/disabled/block, inputs incl. focus/error/disabled, checkbox/radio,
badges, alerts, banners, slots incl. selected/disabled/locked, stepper, avatars, doctor cards,
modal, table, rx-paper items, empty state, video chrome).

### Live public screens — `theme-redesign/before/live/` (6 PNGs, bonus)

Captured from the real Vite app (`npm --workspace client run dev`, `http://localhost:5173`) at
1440px. Public routes render without a backend — `SessionProvider` catches the failed `/auth/me`
and proceeds as logged-out.

- `live-landing.png` ( `/` ) — note: real remote doctor photos
- `live-login.png` ( `/login` )
- `live-signup.png` ( `/signup` )
- `live-legal-terms.png` ( `/legal/terms` )
- `live-legal-privacy.png` ( `/legal/privacy` )
- `live-404.png` ( bogus route )

Authenticated screens (dashboards, booking, video, doctor, admin) were **not** captured live —
they require Postgres + a seed and were intentionally not stood up. The static gallery is the
authoritative baseline for those.

## 5. Theme-switch mechanism (for the after-pass)

The app keys everything off CSS custom properties in `tokens.css`. To introduce an "after" theme:

1. Create `client/src/styles/themes.css` with overrides scoped under an attribute selector, e.g.
   `:root[data-theme="after"] { --color-primary: …; --color-accent: …; … }`.
   The harness already links this file (it just 404s today).
2. Drive it in the harness with `?theme=after` (or the toolbar `<select>`), which sets
   `document.documentElement.dataset.theme`. Default / no attribute = current spruce theme.
3. Re-run the capture loop (§3) writing into `theme-redesign/after/`.

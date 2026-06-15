# Dermestha theme redesign — before / after gallery

This report places the original **spruce** theme (BEFORE) next to the three new
themes (AFTER) for all 24 registry surfaces, captured from the static theme-preview
harness (`client/__theme_preview__/gallery.html`) at **1440x1024** desktop. Six
responsive patient screens are also captured at **390x844** mobile, and the full
component inventory is shown per theme. All paths are relative to this
`theme-redesign/` folder, so the images resolve when this file is opened from here.

## What changed

- **Theming only.** No layout, copy, routing, or flow changes. Every screen is the
  same markup and structure as before; only the design tokens (colour palette, the
  display/heading font, and the corner-radius scale) change per theme. Body text stays
  Hanken Grotesk in every theme for fast first paint. Plus two CSS-only completions (no
  view/markup or business-logic changes): the previously-unstyled `.tab` navigation
  component (P-08/P-09/D-02/A-04) was given themeable styling, and bare content links
  (e.g. admin "View", auth recovery links) now use a themeable brand colour so they stay
  legible on every theme — including the dark one, where default browser blue was unreadable.
- **Four selectable themes** (chosen in the app under **Admin -> Appearance**; the
  choice is remembered per browser in `localStorage`):
  - **Ivory & Ink** — warm bone-and-ink editorial luxe, one burnt-amber accent, sharp
    1/2/4px geometry. Display serif: **Fraunces**.
  - **Derma Noir** — dark, immersive aubergine-charcoal with jade + soft rose-gold,
    soft 6/10/14px geometry. A designed dark mood mode (not an inverted light theme).
    Display serif: **DM Serif Display**.
  - **Sage & Blush** — calming clinical-spa greige with grayed sage brand and clay-rose
    accent, gentle 8/12/16px geometry. Display serif: **Newsreader**.
  - **Spruce** — the original deep-green apothecary identity (the BEFORE baseline).
    Display font: Archivo (sans).
- **The live default is now `ivory-ink`.** Spruce is one click away in
  **Admin -> Appearance** for anyone who prefers the original look.

The six screens also captured at mobile width (P-01, P-02, P-03, P-06, P-08, P-13)
carry an extra row of mobile links beneath the desktop row.


---

## Patient screens

### P-01 — Landing (marketing)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-01-desktop.png) | ![](after/ivory-ink/P-01-desktop.png) | ![](after/derma-noir/P-01-desktop.png) | ![](after/sage-blush/P-01-desktop.png) |

Mobile (390px): [before](before/P-01-mobile.png) | [ivory-ink](after/ivory-ink/P-01-mobile.png) | [derma-noir](after/derma-noir/P-01-mobile.png) | [sage-blush](after/sage-blush/P-01-mobile.png)

### P-02 — Doctor listing / Browse

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-02-desktop.png) | ![](after/ivory-ink/P-02-desktop.png) | ![](after/derma-noir/P-02-desktop.png) | ![](after/sage-blush/P-02-desktop.png) |

Mobile (390px): [before](before/P-02-mobile.png) | [ivory-ink](after/ivory-ink/P-02-mobile.png) | [derma-noir](after/derma-noir/P-02-mobile.png) | [sage-blush](after/sage-blush/P-02-mobile.png)

### P-03 — Doctor profile (day-tabbed slot grid)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-03-desktop.png) | ![](after/ivory-ink/P-03-desktop.png) | ![](after/derma-noir/P-03-desktop.png) | ![](after/sage-blush/P-03-desktop.png) |

Mobile (390px): [before](before/P-03-mobile.png) | [ivory-ink](after/ivory-ink/P-03-mobile.png) | [derma-noir](after/derma-noir/P-03-mobile.png) | [sage-blush](after/sage-blush/P-03-mobile.png)

### P-04 — Sign up (auth-split)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-04-desktop.png) | ![](after/ivory-ink/P-04-desktop.png) | ![](after/derma-noir/P-04-desktop.png) | ![](after/sage-blush/P-04-desktop.png) |

### P-05 — Login (+ password recovery)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-05-desktop.png) | ![](after/ivory-ink/P-05-desktop.png) | ![](after/derma-noir/P-05-desktop.png) | ![](after/sage-blush/P-05-desktop.png) |

### P-06 — Booking (stepper: slot / who-for / pay)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-06-desktop.png) | ![](after/ivory-ink/P-06-desktop.png) | ![](after/derma-noir/P-06-desktop.png) | ![](after/sage-blush/P-06-desktop.png) |

Mobile (390px): [before](before/P-06-mobile.png) | [ivory-ink](after/ivory-ink/P-06-mobile.png) | [derma-noir](after/derma-noir/P-06-mobile.png) | [sage-blush](after/sage-blush/P-06-mobile.png)

### P-07 — Payment return (success + not-completed)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-07-desktop.png) | ![](after/ivory-ink/P-07-desktop.png) | ![](after/derma-noir/P-07-desktop.png) | ![](after/sage-blush/P-07-desktop.png) |

### P-08 — Dashboard: Upcoming appointments

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-08-desktop.png) | ![](after/ivory-ink/P-08-desktop.png) | ![](after/derma-noir/P-08-desktop.png) | ![](after/sage-blush/P-08-desktop.png) |

Mobile (390px): [before](before/P-08-mobile.png) | [ivory-ink](after/ivory-ink/P-08-mobile.png) | [derma-noir](after/derma-noir/P-08-mobile.png) | [sage-blush](after/sage-blush/P-08-mobile.png)

### P-09 — Past appointments

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-09-desktop.png) | ![](after/ivory-ink/P-09-desktop.png) | ![](after/derma-noir/P-09-desktop.png) | ![](after/sage-blush/P-09-desktop.png) |

### P-10 — Cancellation modal (patient)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-10-desktop.png) | ![](after/ivory-ink/P-10-desktop.png) | ![](after/derma-noir/P-10-desktop.png) | ![](after/sage-blush/P-10-desktop.png) |

### P-11 — Pre-call waiting room

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-11-desktop.png) | ![](after/ivory-ink/P-11-desktop.png) | ![](after/derma-noir/P-11-desktop.png) | ![](after/sage-blush/P-11-desktop.png) |

### P-12 — Video consultation (patient)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-12-desktop.png) | ![](after/ivory-ink/P-12-desktop.png) | ![](after/derma-noir/P-12-desktop.png) | ![](after/sage-blush/P-12-desktop.png) |

### P-13 — Prescription view (rx-paper document)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/P-13-desktop.png) | ![](after/ivory-ink/P-13-desktop.png) | ![](after/derma-noir/P-13-desktop.png) | ![](after/sage-blush/P-13-desktop.png) |

Mobile (390px): [before](before/P-13-mobile.png) | [ivory-ink](after/ivory-ink/P-13-mobile.png) | [derma-noir](after/derma-noir/P-13-mobile.png) | [sage-blush](after/sage-blush/P-13-mobile.png)

---

## Doctor screens

### D-01 — Forced password change (doctor)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/D-01-desktop.png) | ![](after/ivory-ink/D-01-desktop.png) | ![](after/derma-noir/D-01-desktop.png) | ![](after/sage-blush/D-01-desktop.png) |

### D-02 — Today appointments + History (doctor)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/D-02-desktop.png) | ![](after/ivory-ink/D-02-desktop.png) | ![](after/derma-noir/D-02-desktop.png) | ![](after/sage-blush/D-02-desktop.png) |

### D-03 — Weekly availability grid (doctor)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/D-03-desktop.png) | ![](after/ivory-ink/D-03-desktop.png) | ![](after/derma-noir/D-03-desktop.png) | ![](after/sage-blush/D-03-desktop.png) |

### D-04 — Video consultation (doctor)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/D-04-desktop.png) | ![](after/ivory-ink/D-04-desktop.png) | ![](after/derma-noir/D-04-desktop.png) | ![](after/sage-blush/D-04-desktop.png) |

### D-05 — Prescription builder (doctor)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/D-05-desktop.png) | ![](after/ivory-ink/D-05-desktop.png) | ![](after/derma-noir/D-05-desktop.png) | ![](after/sage-blush/D-05-desktop.png) |

### D-06 — Cancel modal (doctor)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/D-06-desktop.png) | ![](after/ivory-ink/D-06-desktop.png) | ![](after/derma-noir/D-06-desktop.png) | ![](after/sage-blush/D-06-desktop.png) |

---

## Admin screens

### A-01 — Doctors (list + add/edit form)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/A-01-desktop.png) | ![](after/ivory-ink/A-01-desktop.png) | ![](after/derma-noir/A-01-desktop.png) | ![](after/sage-blush/A-01-desktop.png) |

### A-02 — Medicine catalogue

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/A-02-desktop.png) | ![](after/ivory-ink/A-02-desktop.png) | ![](after/derma-noir/A-02-desktop.png) | ![](after/sage-blush/A-02-desktop.png) |

### A-03 — System health / alerts

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/A-03-desktop.png) | ![](after/ivory-ink/A-03-desktop.png) | ![](after/derma-noir/A-03-desktop.png) | ![](after/sage-blush/A-03-desktop.png) |

### A-04 — Records & audit (table + pagination)

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/A-04-desktop.png) | ![](after/ivory-ink/A-04-desktop.png) | ![](after/derma-noir/A-04-desktop.png) | ![](after/sage-blush/A-04-desktop.png) |

### A-05 — Platform settings

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/A-05-desktop.png) | ![](after/ivory-ink/A-05-desktop.png) | ![](after/derma-noir/A-05-desktop.png) | ![](after/sage-blush/A-05-desktop.png) |

---

## Component inventory

The full design-system inventory (buttons, inputs, badges, alerts, banners, slots,
stepper, avatars, doctor cards, modal, table, rx-paper items, empty state, video chrome)
rendered in each theme.

| Before (spruce) | Ivory & Ink | Derma Noir | Sage & Blush |
|---|---|---|---|
| ![](before/component-inventory.png) | ![](after/ivory-ink/component-inventory.png) | ![](after/derma-noir/component-inventory.png) | ![](after/sage-blush/component-inventory.png) |

---

## Capture notes

- Desktop captures: 1440x1024, full-page, all 24 surfaces x 3 new themes (72 PNGs).
- Mobile captures: 390x844, full-page, the 6 responsive patient screens (P-01, P-02,
  P-03, P-06, P-08, P-13) x 3 themes (18 PNGs).
- Component inventory: 1440x1024 x 3 themes (3 PNGs).
- The spruce BEFORE set in `before/` was captured previously and is reused unchanged.
- `.tabs`/`.tab` are now styled (this redesign completed them) and bare content links are
  now brand-coloured. A few remaining list classes (`.appt-row` / `.status-card` /
  `.empty-state`) still have no CSS in the app and render as plain — but legible,
  themed-text — rows in every theme; this is the same honest-unstyled state as the BEFORE
  baseline, not a theming regression. Styling them is a separate design task, out of this
  theming scope. NOTE: the harness's D-02 reproduction shows the appt-row action buttons
  less faithfully than the real app, which uses proper `.btn` components (see DoctorToday.jsx).

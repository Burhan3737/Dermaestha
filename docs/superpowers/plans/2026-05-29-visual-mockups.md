# Dermestha Visual Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 24 high-fidelity, responsive static HTML mockups of the Dermestha telederm platform (patient, doctor, admin surfaces) on a single shared stylesheet, faithfully implementing `docs/DESIGN.md`.

**Architecture:** Vanilla HTML + CSS, no build step. Two shared stylesheets — `tokens.css` (design tokens as CSS custom properties) and `components.css` (component classes built only from those tokens) — are authored first and imported by every screen. Each of the 24 screens is a self-contained `.html` file composed of the shared components. A `index.html` gallery links them all. Google Fonts (Archivo + Hanken Grotesk) loaded via `<link>` with preconnect + `display=swap`.

**Tech Stack:** HTML5, CSS3 (custom properties, fl.exbox/grid, media queries), Google Fonts. No JS framework; tiny vanilla JS only where a mockup needs an interaction to be legible (tab switching, modal open) — purely presentational.

**Source of truth:** `docs/DESIGN.md`. This plan sequences the build and locks file paths, the full shared CSS, component contracts, and per-screen acceptance criteria. Per-screen content/layout detail lives in `DESIGN.md §6` (screen IDs map 1:1 to filenames). **If a mockup reveals a spec gap or needed change, update `DESIGN.md` in the same task** so spec and mockups never drift.

**Verification model:** No unit tests (static mockups). Each task's verification is visual: open the file in a browser, confirm it matches the referenced `DESIGN.md` section, and check the responsive breakpoints (§2.4: <640 mobile, 640–1023 tablet, ≥1024 desktop). A task is done only when its acceptance checklist passes in the browser.

**Review checkpoints:** Build proceeds in batches by surface — Foundation → Patient (13) → Doctor (6) → Admin (5) → Gallery. Stop for user review at the end of each batch.

---

## File Structure

```
mockups/
  index.html                       ← gallery linking all 24 screens (built last)
  assets/
    css/
      tokens.css                   ← design tokens (CSS custom properties)  [Task 1]
      components.css                ← component classes built on tokens       [Task 2]
    js/
      ui.js                         ← tiny presentational helpers (tabs, modal)[Task 2]
    img/
      doctors/                      ← placeholder portraits (doc-1..doc-5.jpg)
      logo-mark.svg                 ← spruce square + brass dot mark
  _component-reference.html         ← renders every component for visual QA   [Task 3]

  patient-01-landing.html           [Task 4]
  patient-02-browse.html            [Task 5]
  patient-03-doctor-profile.html    [Task 6]
  patient-04-signup.html            [Task 7]
  patient-05-login.html             [Task 8]
  patient-06-booking.html           [Task 9]
  patient-07-payment.html           [Task 10]
  patient-08-dashboard-upcoming.html[Task 11]
  patient-09-dashboard-past.html    [Task 12]
  patient-10-cancel-modal.html      [Task 13]
  patient-11-waiting-room.html      [Task 14]
  patient-12-video.html             [Task 15]
  patient-13-prescription.html      [Task 16]

  doctor-01-password.html           [Task 17]
  doctor-02-today.html              [Task 18]
  doctor-03-availability.html       [Task 19]
  doctor-04-video.html              [Task 20]
  doctor-05-prescription-builder.html [Task 21]
  doctor-06-cancel-modal.html       [Task 22]

  admin-01-doctors.html             [Task 23]
  admin-02-medicines.html           [Task 24]
  admin-03-alerts.html              [Task 25]
  admin-04-records-audit.html       [Task 26]
  admin-05-settings.html            [Task 27]
```

**File responsibilities:**
- `tokens.css` — single source of every color/type/spacing/radius/shadow value. No component rules. Changing a brand value here propagates everywhere.
- `components.css` — every reusable class (button, card, badge, input, nav, table, modal…). References tokens only; no hard-coded hex. This is what keeps 24 screens consistent.
- `ui.js` — ≤40 lines of vanilla JS: tab switching, modal show/hide, mobile drawer toggle. Presentational only.
- Each screen file — page `<head>` (fonts + 2 stylesheets + ui.js), then markup composed from component classes. No per-screen `<style>` except rare one-off layout tweaks via utility classes.

---

## Conventions (all screens)

- `<head>` block is identical across screens:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/css/tokens.css">
  <link rel="stylesheet" href="assets/css/components.css">
  <script defer src="assets/js/ui.js"></script>
  ```
- Times/money/counts always use the `.tnum` class (tabular figures) and `Asia/Karachi`-style labels.
- Every doctor photo carries the PMC-verified badge.
- Patient screens are responsive (mobile bottom-tabs ↔ desktop top-nav). Doctor/admin are desktop-first with a sidebar.
- Commit after each task with a clear message.

---

## Task 1: Design tokens (`tokens.css`)

**Files:**
- Create: `mockups/assets/css/tokens.css`

- [ ] **Step 1: Write the token stylesheet**

```css
/* tokens.css — Dermestha design tokens (DESIGN.md §2). Values are the single source of truth. */
:root {
  /* Brand */
  --color-primary:        #0F3A2A;
  --color-primary-hover:  #0A2C20;
  --color-primary-tint:   #E6F1EA;
  --color-primary-border: #C2D3C8;
  --color-on-primary:     #FFFFFF;
  /* Accent (brass) */
  --color-accent:       #B5852F;
  --color-accent-deep:  #9A6B1F;
  --color-accent-tint:  #FBF0E0;
  /* Canvas / surface / ink */
  --color-bg:             #E8ECE9;
  --color-surface:        #FFFFFF;
  --color-surface-sunken: #DFE5E1;
  --color-border:         #D7DED8;
  --color-border-strong:  #C2CBC4;
  --color-text-strong:    #13241D;
  --color-text-body:      #46524B;
  --color-text-muted:     #56625B;
  /* Feature dark band */
  --color-feature-bg:    #0F3A2A;
  --color-on-dark:       #DCE9E2;
  --color-on-dark-muted: #AFC6BA;
  --color-on-dark-accent:#9BE3B8;
  /* Semantic text + bg */
  --color-success: #136B45; --color-success-bg: #E6F1EA;
  --color-info:    #2F6E6E; --color-info-bg:    #E2EFEE;
  --color-warning: #9A6B1F; --color-warning-bg: #FBF0E0;
  --color-danger:  #B23A2E; --color-danger-bg:  #F7E9E6;
  --color-danger-deep: #9A2A20;
  --color-neutral: #56625B; --color-neutral-bg: #EAEEEA;

  /* Typography */
  --font-head: "Archivo", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-body: "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --fs-display: 30px; --fs-h1: 24px; --fs-h2: 20px; --fs-h3: 17px;
  --fs-body-lg: 16px; --fs-body: 14px; --fs-body-sm: 13px; --fs-caption: 12px; --fs-label: 11px;

  /* Spacing (4px base) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 20px;
  --sp-6: 24px; --sp-8: 32px; --sp-10: 40px; --sp-12: 48px; --sp-16: 64px;

  /* Radius */
  --r-sm: 3px; --r-md: 4px; --r-lg: 6px; --r-pill: 999px;

  /* Border + elevation */
  --border-1: 1px solid var(--color-border);
  --border-strong: 1px solid var(--color-border-strong);
  --shadow-overlay: 0 18px 44px rgba(15,33,24,.25);

  /* Motion */
  --ease: 180ms ease;

  /* Layout */
  --maxw: 1100px;
  --sidebar-w: 240px;
}
@media (prefers-reduced-motion: reduce) { :root { --ease: 0ms; } }
```

- [ ] **Step 2: Verify in browser**

Open `mockups/assets/css/tokens.css` is referenced by the reference page (built Task 3). For now, confirm the file parses: open it directly in the browser (should display as text with no errors) and confirm via DevTools later. Expected: valid CSS, no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add mockups/assets/css/tokens.css
git commit -m "feat(mockups): add design tokens stylesheet"
```

---

## Task 2: Component classes (`components.css`) + helpers (`ui.js`)

**Files:**
- Create: `mockups/assets/css/components.css`
- Create: `mockups/assets/js/ui.js`

- [ ] **Step 1: Write base + reset + typography**

```css
/* components.css — built only from tokens.css custom properties (DESIGN.md §3). No raw hex. */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body { font-family: var(--font-body); font-size: var(--fs-body); line-height: 1.55;
  color: var(--color-text-body); background: var(--color-bg); }
.tnum { font-variant-numeric: tabular-nums; }

/* Headings */
.display { font-family: var(--font-head); font-weight: 800; font-size: var(--fs-display); line-height: 1.1; letter-spacing: -.8px; color: var(--color-text-strong); margin: 0; }
.h1 { font-family: var(--font-head); font-weight: 800; font-size: var(--fs-h1); line-height: 1.15; letter-spacing: -.6px; color: var(--color-text-strong); margin: 0; }
.h2 { font-family: var(--font-head); font-weight: 700; font-size: var(--fs-h2); line-height: 1.2; letter-spacing: -.4px; color: var(--color-text-strong); margin: 0; }
.h3 { font-family: var(--font-head); font-weight: 700; font-size: var(--fs-h3); line-height: 1.3; letter-spacing: -.3px; color: var(--color-text-strong); margin: 0; }
.body-lg { font-size: var(--fs-body-lg); }
.body-sm { font-size: var(--fs-body-sm); }
.caption { font-size: var(--fs-caption); color: var(--color-text-muted); }
.label { font-family: var(--font-head); font-weight: 700; font-size: var(--fs-label); letter-spacing: .8px; text-transform: uppercase; color: var(--color-text-muted); }
.muted { color: var(--color-text-muted); }
.strong { color: var(--color-text-strong); }

/* Layout helpers */
.container { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--sp-4); }
.card { background: var(--color-surface); border: var(--border-1); border-radius: var(--r-md); }
.row { display: flex; gap: var(--sp-3); }
.col { display: flex; flex-direction: column; gap: var(--sp-3); }
.between { display: flex; align-items: center; justify-content: space-between; }
```

- [ ] **Step 2: Add buttons (DESIGN.md §3.1)**

```css
.btn { font-family: var(--font-body); font-weight: 700; font-size: var(--fs-body);
  border: 0; border-radius: var(--r-sm); padding: 11px 18px; cursor: pointer;
  display: inline-flex; align-items: center; gap: var(--sp-2); transition: background var(--ease); }
.btn:focus-visible { outline: 0; box-shadow: 0 0 0 3px rgba(15,58,42,.30); }
.btn--primary { background: var(--color-primary); color: var(--color-on-primary); }
.btn--primary:hover { background: var(--color-primary-hover); }
.btn--secondary { background: var(--color-surface); color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-border-strong); }
.btn--ghost { background: transparent; color: var(--color-primary); }
.btn--danger { background: var(--color-danger); color: #fff; }
.btn--brass { background: var(--color-accent); color: #fff; }
.btn--sm { padding: 8px 14px; font-size: var(--fs-body-sm); }
.btn--lg { padding: 13px 22px; }
.btn--block { width: 100%; justify-content: center; }
.btn[disabled], .btn--disabled { background: var(--color-surface-sunken); color: #9AA69E; cursor: not-allowed; box-shadow: none; }
```

- [ ] **Step 3: Add inputs, checkbox/radio (DESIGN.md §3.2, §3.4)**

```css
.field { display: block; max-width: 360px; }
.field > label { font-family: var(--font-head); font-weight: 700; font-size: var(--fs-caption); color: var(--color-text-strong); display: block; margin-bottom: var(--sp-1); }
.input { width: 100%; font-family: var(--font-body); font-size: var(--fs-body); padding: 10px 12px;
  border: var(--border-strong); border-radius: var(--r-md); background: var(--color-surface); color: var(--color-text-strong); }
.input:focus { outline: 0; border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(15,58,42,.15); }
.input--error { border-color: var(--color-danger); }
.help { font-size: var(--fs-caption); color: var(--color-text-muted); margin-top: var(--sp-1); }
.error-text { font-size: var(--fs-caption); color: var(--color-danger-deep); margin-top: var(--sp-1); }
.choice { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body); }
.choice input { width: 18px; height: 18px; accent-color: var(--color-primary); }
```

- [ ] **Step 4: Add avatar, doctor card, slot, badge (DESIGN.md §3.5–§3.8)**

```css
.avatar { border-radius: var(--r-pill); object-fit: cover; background: var(--color-primary-tint); color: var(--color-primary);
  display: inline-flex; align-items: center; justify-content: center; font-family: var(--font-head); font-weight: 700; }
.avatar--sm { width: 28px; height: 28px; font-size: 11px; }
.avatar--md { width: 34px; height: 34px; font-size: 12px; }
.avatar--lg { width: 48px; height: 48px; font-size: 16px; }

.doc-card { background: var(--color-surface); border: var(--border-1); border-radius: var(--r-md); overflow: hidden; }
.doc-card__img { position: relative; height: 140px; border-bottom: var(--border-1); }
.doc-card__img img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
.pmc-badge { position: absolute; top: 10px; right: 10px; background: var(--color-surface); color: var(--color-primary);
  border: 1px solid var(--color-primary); font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: var(--r-sm); }
.doc-card__body { padding: var(--sp-3) var(--sp-4) var(--sp-4); }
.doc-card__name { font-family: var(--font-head); font-weight: 700; font-size: var(--fs-h3); color: var(--color-primary); margin: 0; letter-spacing: -.3px; }
.doc-card__spec { font-size: var(--fs-caption); color: var(--color-text-muted); font-weight: 600; margin: 3px 0 var(--sp-3); }
.doc-card__foot { display: flex; align-items: center; justify-content: space-between; border-top: var(--border-1); padding-top: var(--sp-3); }
.doc-card__fee { font-weight: 700; color: var(--color-text-strong); }
.doc-card__slot { font-size: var(--fs-caption); font-weight: 700; color: var(--color-accent-deep); }

.slot { font-size: var(--fs-body); font-weight: 700; padding: 11px 14px; min-height: 44px; border-radius: var(--r-sm);
  background: var(--color-surface); color: var(--color-text-strong); box-shadow: inset 0 0 0 1px var(--color-primary-border); cursor: pointer; }
.slot--selected { background: var(--color-primary); color: #fff; box-shadow: none; }
.slot--disabled { background: var(--color-surface-sunken); color: #9AA69E; box-shadow: none; text-decoration: line-through; cursor: not-allowed; }
.slot--locked { background: var(--color-surface-sunken); color: var(--color-text-muted); box-shadow: none; cursor: not-allowed; }

.badge { display: inline-flex; align-items: center; font-size: var(--fs-label); font-weight: 700; padding: 4px 9px; border-radius: var(--r-sm); letter-spacing: .2px; }
.badge--success { background: var(--color-success-bg); color: var(--color-success); }
.badge--info    { background: var(--color-info-bg);    color: var(--color-info); }
.badge--warning { background: var(--color-warning-bg); color: var(--color-warning); }
.badge--danger  { background: var(--color-danger-bg);  color: var(--color-danger); }
.badge--neutral { background: var(--color-neutral-bg); color: var(--color-neutral); }
```

- [ ] **Step 5: Add modal, alert/toast, banner, empty state (DESIGN.md §3.9–§3.11, §3.18)**

```css
.modal-backdrop { position: fixed; inset: 0; background: rgba(15,33,24,.45); display: flex; align-items: center; justify-content: center; padding: var(--sp-4); }
.modal { width: 100%; max-width: 360px; background: var(--color-surface); border-radius: var(--r-lg); box-shadow: var(--shadow-overlay); overflow: hidden; }
.modal__accent { height: 4px; background: var(--color-primary); }
.modal__accent--danger { background: var(--color-danger); }
.modal__body { padding: var(--sp-5); }
.modal__actions { display: flex; justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-4); }

.alert { display: flex; gap: var(--sp-2); align-items: flex-start; border: var(--border-1); border-radius: var(--r-md); padding: var(--sp-3); font-size: var(--fs-body-sm); }
.alert--success { background: var(--color-success-bg); border-color: var(--color-success); color: var(--color-success); }
.alert--info    { background: var(--color-info-bg);    border-color: var(--color-info);    color: var(--color-info); }
.alert--warning { background: var(--color-warning-bg); border-color: var(--color-warning); color: var(--color-warning); }
.alert--danger  { background: var(--color-danger-bg);  border-color: var(--color-danger);  color: var(--color-danger-deep); }

.banner { width: 100%; padding: var(--sp-3) var(--sp-4); font-size: var(--fs-body-sm); font-weight: 600; text-align: center; }
.banner--warning { background: var(--color-warning-bg); color: var(--color-warning); }
.banner--danger  { background: var(--color-danger-bg);  color: var(--color-danger-deep); }

.empty { text-align: center; padding: var(--sp-12) var(--sp-4); color: var(--color-text-muted); }
.empty__icon { width: 40px; height: 40px; margin: 0 auto var(--sp-3); color: var(--color-border-strong); }
```

- [ ] **Step 6: Add navigation — top nav, bottom tabs, sidebar (DESIGN.md §3.12)**

```css
/* Top nav */
.topnav { background: var(--color-surface); border-bottom: var(--border-1); }
.topnav__inner { max-width: var(--maxw); margin: 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 14px var(--sp-4); }
.brand { display: inline-flex; align-items: center; gap: var(--sp-2); }
.brand__mark { width: 22px; height: 22px; border-radius: 6px; background: var(--color-primary); position: relative; }
.brand__mark::after { content: ""; position: absolute; width: 7px; height: 7px; border-radius: 50%; background: var(--color-accent); top: 4px; right: 4px; }
.brand__word { font-family: var(--font-head); font-weight: 800; font-size: var(--fs-h2); letter-spacing: -.6px; color: var(--color-primary); }
.topnav__links { display: flex; align-items: center; gap: var(--sp-5); font-size: var(--fs-body-sm); font-weight: 600; color: var(--color-text-muted); }
.topnav__links a { color: inherit; text-decoration: none; }
.topnav__links a.active { color: var(--color-primary); }

/* Bottom tabs (mobile) */
.tabbar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-around; background: var(--color-surface); border-top: var(--border-1); padding: 8px 0 10px; }
.tabbar__item { display: flex; flex-direction: column; align-items: center; gap: 3px; font-family: var(--font-head); font-size: 9px; font-weight: 700; color: #A6B0AA; text-decoration: none; }
.tabbar__item.active { color: var(--color-primary); }

/* Sidebar (doctor/admin) */
.layout { display: flex; min-height: 100vh; }
.sidebar { width: var(--sidebar-w); flex: 0 0 auto; background: var(--color-surface); border-right: var(--border-1); display: flex; flex-direction: column; padding: var(--sp-4); }
.sidebar__link { display: block; padding: 10px 12px; border-radius: var(--r-sm); color: var(--color-text-body); text-decoration: none; font-weight: 600; font-size: var(--fs-body-sm); }
.sidebar__link.active { background: var(--color-primary-tint); color: var(--color-primary); }
.content { flex: 1; padding: var(--sp-6); }

/* Responsive: show/hide nav chrome */
.only-mobile { display: none; }
@media (max-width: 767px) {
  .only-desktop { display: none; }
  .only-mobile { display: flex; }
  .content { padding: var(--sp-4); }
}
```

- [ ] **Step 7: Add table, form-section card, stepper, prescription items, video chrome (DESIGN.md §3.13–§3.17)**

```css
/* Table (admin) */
.table { width: 100%; border-collapse: collapse; background: var(--color-surface); border: var(--border-1); border-radius: var(--r-md); overflow: hidden; }
.table th { font-family: var(--font-head); font-size: var(--fs-label); text-transform: uppercase; letter-spacing: .6px; color: var(--color-text-muted); text-align: left; padding: 12px 14px; border-bottom: var(--border-1); }
.table td { padding: 12px 14px; border-bottom: var(--border-1); font-size: var(--fs-body-sm); }
.table tr:last-child td { border-bottom: 0; }
.table tr:hover td { background: var(--color-bg); }
.table .num { text-align: right; font-variant-numeric: tabular-nums; }
.filters { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-4); }

/* Form section card */
.section-card { background: var(--color-surface); border: var(--border-1); border-radius: var(--r-md); padding: var(--sp-5); margin-bottom: var(--sp-4); }
.section-card__title { margin-bottom: var(--sp-4); }

/* Stepper */
.stepper { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-5); }
.stepper__step { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); font-weight: 700; color: var(--color-text-muted); }
.stepper__num { width: 22px; height: 22px; border-radius: 50%; background: var(--color-surface-sunken); color: var(--color-text-muted); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
.stepper__step.active .stepper__num { background: var(--color-primary); color: #fff; }
.stepper__step.active { color: var(--color-primary); }

/* Prescription line items */
.rx-item { display: flex; justify-content: space-between; gap: var(--sp-4); padding: var(--sp-3) 0; border-bottom: var(--border-1); }
.rx-item__name { font-weight: 700; color: var(--color-text-strong); }
.rx-item__detail { font-size: var(--fs-body-sm); color: var(--color-text-muted); }
.rx-item__price { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--color-text-strong); }
.tag-unpriced { background: var(--color-neutral-bg); color: var(--color-neutral); font-size: var(--fs-label); font-weight: 700; padding: 2px 7px; border-radius: var(--r-sm); }
.rx-total { display: flex; justify-content: space-between; padding-top: var(--sp-3); font-family: var(--font-head); font-weight: 800; color: var(--color-primary); }

/* Video chrome */
.video-stage { background: #0D1714; border-radius: var(--r-lg); aspect-ratio: 16/9; position: relative; display: flex; align-items: center; justify-content: center; color: var(--color-on-dark); }
.video-self { position: absolute; bottom: 12px; right: 12px; width: 120px; aspect-ratio: 4/3; background: #16211C; border-radius: var(--r-md); border: 1px solid #243029; }
.video-controls { display: flex; gap: var(--sp-3); justify-content: center; margin-top: var(--sp-4); }
.video-ctrl { width: 48px; height: 48px; border-radius: 50%; background: var(--color-surface); border: var(--border-strong); display: inline-flex; align-items: center; justify-content: center; }
.video-ctrl--leave { background: var(--color-danger); color: #fff; border: 0; }
```

- [ ] **Step 8: Add feature-dark band utilities (DESIGN.md §2.1 feature band)**

```css
.feature { background: var(--color-feature-bg); color: var(--color-on-dark); }
.feature .h1, .feature .display, .feature .h2, .feature .h3 { color: #fff; }
.feature .muted { color: var(--color-on-dark-muted); }
.feature__eyebrow { font-family: var(--font-head); font-weight: 700; font-size: var(--fs-label); letter-spacing: 1.3px; text-transform: uppercase; color: var(--color-on-dark-accent); }
```

- [ ] **Step 9: Write `ui.js` (presentational only)**

```javascript
// ui.js — presentational helpers for mockups only.
document.addEventListener('click', function (e) {
  // Tabs: <button data-tab="#panelId"> toggles sibling .tab-panel visibility
  var tab = e.target.closest('[data-tab]');
  if (tab) {
    var group = tab.closest('[data-tabs]');
    group.querySelectorAll('[data-tab]').forEach(function (t) { t.classList.toggle('active', t === tab); });
    group.querySelectorAll('.tab-panel').forEach(function (p) {
      p.hidden = ('#' + p.id) !== tab.getAttribute('data-tab');
    });
  }
  // Modal open/close: [data-open="#modalId"] and [data-close]
  var opener = e.target.closest('[data-open]');
  if (opener) { document.querySelector(opener.getAttribute('data-open')).hidden = false; }
  if (e.target.closest('[data-close]') || e.target.classList.contains('modal-backdrop')) {
    var m = e.target.closest('.modal-backdrop'); if (m) m.hidden = true;
  }
  // Mobile drawer
  var drawer = e.target.closest('[data-drawer]');
  if (drawer) { document.querySelector('.sidebar').classList.toggle('open'); }
});
```

- [ ] **Step 10: Commit**

```bash
git add mockups/assets/css/components.css mockups/assets/js/ui.js
git commit -m "feat(mockups): add component stylesheet and ui helpers"
```

---

## Task 3: Component reference page + placeholder assets

**Files:**
- Create: `mockups/_component-reference.html`
- Create: `mockups/assets/img/logo-mark.svg`
- Create: `mockups/assets/img/doctors/` (5 placeholder portraits `doc-1.jpg` … `doc-5.jpg`)

- [ ] **Step 1: Add placeholder portraits and logo mark**

Place 5 portrait images at `mockups/assets/img/doctors/doc-1.jpg`..`doc-5.jpg` (any neutral professional headshots; e.g. download from a free portrait source, ≤200KB each, ~400×400). Create `logo-mark.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0F3A2A"/><circle cx="24" cy="8" r="4" fill="#B5852F"/></svg>
```

- [ ] **Step 2: Build the reference page rendering every component**

Create `_component-reference.html` using the standard `<head>` (Conventions). In `<body class="container">`, render one labelled block per component class group from `components.css`: headings scale, all button variants/states, inputs (default/focus/error), checkbox+radio, avatars, a doctor card, a slot row (all 4 states), all 5 badges, an open modal (danger accent + refund breakdown), each alert variant, a banner, an empty state, the top nav, the bottom tab bar, a sidebar snippet, a table with 3 rows, a stepper, prescription line items + total, and the video stage. This page is the visual contract for the component system.

- [ ] **Step 3: Verify in browser**

Open `mockups/_component-reference.html`. 
Expected acceptance:
- Fonts load (Archivo headings, Hanken body); no Times/Arial fallback flash after load.
- All colors match `DESIGN.md §2.1` swatches (spot-check primary spruce, brass accent, porcelain bg).
- Buttons show hover + focus ring; disabled is muted.
- Badges are squared, dot-less, correctly tinted.
- No console errors; no raw hex visible that bypasses tokens (grep check next step).

- [ ] **Step 4: Confirm no hard-coded hex in components.css**

Run: `rg "#[0-9a-fA-F]{3,6}" mockups/assets/css/components.css`
Expected: no matches (every color comes from a `var(--...)`). If any match appears, replace it with the appropriate token.

- [ ] **Step 5: Commit**

```bash
git add mockups/_component-reference.html mockups/assets/img
git commit -m "feat(mockups): add component reference page and placeholder assets"
```

**→ REVIEW CHECKPOINT 1 (Foundation):** Stop. Have the user review `_component-reference.html` in the browser before building screens. Apply any token/component changes here (and mirror into `DESIGN.md`) so all 24 screens inherit them.

---

## Tasks 4–16: Patient surface (13 screens)

Each patient task follows the same shape. **Per-task steps are:**
1. Create the file with the standard `<head>`.
2. Build the screen from `components.css` classes per the referenced `DESIGN.md §6` entry — markup only, no new colors.
3. Verify in the browser at mobile (375px) and desktop (≥1024px) widths against the acceptance checklist.
4. Commit.

Common commit form: `git commit -m "feat(mockups): add <screen-id> screen"`.

### Task 4: `patient-01-landing.html` — Landing (DESIGN.md P-01)
- [ ] Build: logged-out top nav; **feature-dark hero** (eyebrow, `.display` headline, sub, primary CTA "Find your dermatologist" + secondary "How it works", trust row, featured `.doc-card`); porcelain sections — 3-step "How it works", featured specialists grid (3 `.doc-card`), PMC trust strip; feature-dark footer.
- [ ] Verify: hero stacks to single column < 640px; CTA full-width on mobile; headline uses Archivo 800; trust row legible on green (uses `--color-on-dark`). Commit.

### Task 5: `patient-02-browse.html` — Doctor listing (DESIGN.md P-02, PRD P1)
- [ ] Build: top nav (desktop) + bottom tabs (mobile); page `.h1`; concern filter chips (All/Acne/Pigmentation/Hair & Scalp/Eczema) with first active; specialist count (`.tnum`); responsive doctor-card grid (1/2/3 col via media query); include an empty-state variant in a comment block.
- [ ] Verify: grid = 1 col @375px, 3 col @1024px; inactive doctors omitted; whole card is a link. Commit.

### Task 6: `patient-03-doctor-profile.html` — Doctor profile (DESIGN.md P-03)
- [ ] Build: large photo + PMC badge, name (`.h1`), specialization, fee (`.tnum`), years, bio; availability preview; prominent "Book consultation" button linking to `patient-06-booking.html`.
- [ ] Verify: layout two-column desktop, stacked mobile; book CTA above the fold on mobile. Commit.

### Task 7: `patient-04-signup.html` — Sign up (DESIGN.md P-04, PRD P2)
- [ ] Build: centered `.section-card` form — full name, email, phone, password fields; **mandatory consent `.choice` checkbox** with links to `/legal/terms` and `/legal/privacy`; submit `.btn--primary.btn--block` shown disabled until checked (static: show disabled state + a note); a duplicate-email `.error-text` example; link to login.
- [ ] Verify: consent checkbox present with both links; error state styled. Commit.

### Task 8: `patient-05-login.html` — Login + recovery (DESIGN.md P-05, PRD DA2/P2)
- [ ] Build: login `.section-card` (email + password, primary submit, "Forgot password?" link); below, two more cards representing **forgot-password request** and **set-new-password** states (can be stacked sections with labels). Note in copy that the same login serves doctor/admin.
- [ ] Verify: all three states visible and styled; enumeration-safe copy on forgot ("If an account exists, we've sent a link"). Commit.

### Task 9: `patient-06-booking.html` — Booking (DESIGN.md P-06, PRD P3/P8)
- [ ] Build: `.stepper` (Select slot → Who for → Pay); day tabs (`data-tabs`); slot grid showing all 4 `.slot` states; **"Who is this consultation for?"** `.choice` radios (Myself default / Someone else → reveals name, age, relation fields); fee summary (`.tnum`); "Confirm & Pay" with a 10-min-lock note; a "slot just taken" `.alert--danger` example.
- [ ] Verify: radio toggling reveals the someone-else fields (ui.js or static both-shown with note); disabled/locked slots visually distinct; stepper step 1 active. Commit.

### Task 10: `patient-07-payment.html` — Payment handoff & return (DESIGN.md P-07)
- [ ] Build: interstitial ("Taking you to secure checkout") + four return-state cards: success, failure (retry-in-lock), lock-expired, platform-couldn't-secure-slot (full refund). Use `.alert` variants per intent.
- [ ] Verify: all four return states present and intent-colored. Commit.

### Task 11: `patient-08-dashboard-upcoming.html` — Upcoming (DESIGN.md P-08, PRD P9)
- [ ] Build: dashboard nav; "Upcoming" list of compact doctor rows — slot date/time (`.tnum`), "for: [patient]" line, fee, **Join Call** button shown disabled (with "active 10 min before" note), **Cancel** link (confirmed only); include the empty state (`.empty` → Browse).
- [ ] Verify: Join disabled state clear; Cancel only on confirmed rows; mobile shows bottom tabs. Commit.

### Task 12: `patient-09-dashboard-past.html` — Past appointments (DESIGN.md P-09, PRD P7)
- [ ] Build: past rows with terminal-state `.badge`s (use the §5 mapping — at least Completed·Prescription ready, Cancelled–refunded, Missed, Cancelled by doctor, Cancelled–no refund); Download Prescription on applicable rows; a refund-status block (paid / gateway fee / refund `.tnum`, gateway ref, "initiated 2 days ago, expected within 7 days").
- [ ] Verify: every badge maps to the §5 table; refund breakdown math shown. Commit.

### Task 13: `patient-10-cancel-modal.html` — Cancellation modal (DESIGN.md P-10, PRD P6)
- [ ] Build: page with a confirmed appointment + a button opening the modal (`data-open`). Two modal variants: ≥2h (refund breakdown: paid − gateway fee = refund, "excludes gateway fee" line, "Cancel & refund") and <2h (warning "No refund; slot stays blocked", confirm). Danger accent bar.
- [ ] Verify: modal opens/closes via ui.js; both variants present; refund math correct. Commit.

### Task 14: `patient-11-waiting-room.html` — Pre-call waiting room (DESIGN.md P-11, PRD P5)
- [ ] Build: lighting prompt copy ("Find a well-lit area; sit facing a window or lamp"), device/camera preview placeholder, "Doctor will be with you shortly" state, Join button (active-from-10-min note).
- [ ] Verify: lighting prompt prominent; mobile-friendly single column. Commit.

### Task 15: `patient-12-video.html` — Video consultation, patient (DESIGN.md P-12, PRD P5)
- [ ] Build: `.video-stage` with remote tile + `.video-self`; `.video-controls` (mic/cam/leave); slot timer + cutoff warning; a "doctor running late" `.alert--warning` example.
- [ ] Verify: stage is 16:9, controls centered, leave button danger; works at mobile width. Commit.

### Task 16: `patient-13-prescription.html` — Prescription view + PDF (DESIGN.md P-13, PRD P7/§3.5)
- [ ] Build: patient identification header (name/age/relation); `.rx-item` rows (dosage/duration/instructions + price `.tnum`); a free-text item with `.tag-unpriced` excluded from total; `.rx-total`; "N item(s) not priced" note; general notes; follow-up date; doctor metadata; **Download PDF** button; show two prescriptions chronologically.
- [ ] Verify: total excludes unpriced item; both prescriptions downloadable; identification header read-only. Commit.

**→ REVIEW CHECKPOINT 2 (Patient surface):** Stop for user review of all 13 patient screens. Apply changes to mockups + mirror into `DESIGN.md`.

---

## Tasks 17–22: Doctor surface (6 screens)

Same per-task shape (create → build from components → verify desktop-first + mobile fallback → commit). Doctor screens use the `.layout` + `.sidebar` (Today / Availability / History) shell.

### Task 17: `doctor-01-password.html` — Forced first-login password change (DESIGN.md D-01, PRD DA3)
- [ ] Build: centered `.section-card` (no sidebar yet) — current/new/confirm password, primary submit; copy noting panel is locked until changed; reusable as post-reset path (DA5).
- [ ] Verify: cannot-proceed framing clear; styled errors. Commit.

### Task 18: `doctor-02-today.html` — Today's appointments + History (DESIGN.md D-02, PRD D2)
- [ ] Build: sidebar layout; "Today" list sorted by slot time — time (`.tnum`), patient name (+ "for: X"), notes, **Join Call** (active-10-min note); `data-tabs` History tab; an awaiting-prescription reminder badge on a completed-without-Rx row.
- [ ] Verify: tab switch works; sidebar "Today" active; mobile drawer toggles. Commit.

### Task 19: `doctor-03-availability.html` — Weekly availability grid (DESIGN.md D-03, PRD D1)
- [ ] Build: Sun–Sat × hours grid; selected recurring blocks highlighted (`--color-primary-tint`); 30-min auto-slot note; a blocking-warning `.alert--warning` for editing a block with confirmed bookings.
- [ ] Verify: grid readable; selected blocks distinct; warning present. Commit.

### Task 20: `doctor-04-video.html` — Video consultation, doctor (DESIGN.md D-04, PRD D3)
- [ ] Build: reuse `.video-stage` chrome with doctor controls; soft 5-min-remaining `.alert--warning`; note hard cutoff slot-end+5.
- [ ] Verify: mirrors patient video chrome with doctor-side framing. Commit.

### Task 21: `doctor-05-prescription-builder.html` — Prescription builder (DESIGN.md D-05, PRD D4)
- [ ] Build: **read-only patient identification header**; add-medicine row (catalogue search input + free-text fallback); per-medicine dosage/duration/instructions inputs; **running total** (`.rx-total`, `.tnum`) with a free-text item flagged `.tag-unpriced` excluded; general notes textarea; follow-up date; Submit (note: immutable; corrections = new prescription); show a prior submitted prescription read-only.
- [ ] Verify: identification header is read-only (no name input); running total excludes unpriced; immutability note present. Commit.

### Task 22: `doctor-06-cancel-modal.html` — Cancel appointment modal (DESIGN.md D-06, PRD D5)
- [ ] Build: appointment + open-modal button; modal with **required internal reason** textarea; copy: confirms `doctor_cancelled` → auto-refund (net of gateway fee) + apology email; no time-window restriction. Danger accent.
- [ ] Verify: reason required framing; modal open/close works. Commit.

**→ REVIEW CHECKPOINT 3 (Doctor surface):** Stop for user review of all 6 doctor screens. Apply changes + mirror into `DESIGN.md`.

---

## Tasks 23–27: Admin surface (5 screens)

Same shape; admin uses `.layout` + `.sidebar` (Doctors / Medicines / Alerts / Records & Audit / Settings) and is desktop-first (`.table` reflows to stacked cards < 768px).

### Task 23: `admin-01-doctors.html` — Doctors list / add / edit / deactivate (DESIGN.md A-01, PRD A1/A4)
- [ ] Build: `.table` (name, PMC, specialization, fee `.num`, status badge active/pending); an "Add Doctor" `.section-card` form (full name, PMC #, email, phone, photo upload note JPEG/PNG/WebP ≤2MB, bio, specialization, fee, availability template, **initial password**); an Edit variant where PMC # + email are shown disabled/immutable with a fee-change note; a **deactivate modal warning showing a count of upcoming confirmed appointments** that remain.
- [ ] Verify: immutable fields disabled in edit; deactivate modal shows the count + "cancels nothing" copy. Commit.

### Task 24: `admin-02-medicines.html` — Medicine catalogue (DESIGN.md A-02, PRD A2)
- [ ] Build: searchable `.table` (name, generic, dosage forms, **unit price PKR** `.num`, active); add/edit/deactivate row actions; note that renames/price changes never alter existing immutable prescriptions.
- [ ] Verify: price column tabular/right-aligned; immutability note present. Commit.

### Task 25: `admin-03-alerts.html` — Alert feed / system health (DESIGN.md A-03, PRD A3)
- [ ] Build: alert feed list using `.alert` variants — payment-webhook mismatch, refund-API failure, email send failure (post-retry), `awaiting_prescription`>12h, unhandled exception; each links to its record; show **email re-trigger only** action (no refund retry, with explanatory note).
- [ ] Verify: each alert type present and intent-colored; only email re-trigger action exposed. Commit.

### Task 26: `admin-04-records-audit.html` — Records & Audit Log (DESIGN.md A-04, PRD A5)
- [ ] Build: `.filters` bar (patient email/phone, doctor, appointment ID, payment ref, user, event type, actor type, date range); records `.table` (appt ID, slot, patient, doctor, state badge, amount `.num`, payment/refund ref); a row→detail panel with state-transition history + linked prescriptions and actions (mark `disputed`, re-trigger email); read-only/append-only note.
- [ ] Verify: full filter set present; detail view shows transition history; read-only framing. Commit.

### Task 27: `admin-05-settings.html` — Settings (DESIGN.md A-05, PRD A6)
- [ ] Build: `.section-card`s — minimum booking lead time (default 1h, range to 30m, with bounds note); fallback transaction-fee model (% and/or fixed PKR inputs, validated-bounds note); copy: changes apply to future bookings only, each change audit-logged.
- [ ] Verify: lead-time bounds + fee-model inputs present with notes. Commit.

**→ REVIEW CHECKPOINT 4 (Admin surface):** Stop for user review of all 5 admin screens. Apply changes + mirror into `DESIGN.md`.

---

## Task 28: Gallery index

**Files:**
- Create: `mockups/index.html`

- [ ] **Step 1: Build the gallery**

Create `mockups/index.html` with the standard `<head>`. Render a `.container` with three labelled sections (Patient / Doctor / Admin), each a grid of cards linking to every screen file with its screen ID and title (from §6). Include a link to `_component-reference.html`.

- [ ] **Step 2: Verify**

Open `mockups/index.html`. Expected: every one of the 24 screens is linked and opens; links are grouped by surface; styling matches the system.

- [ ] **Step 3: Commit**

```bash
git add mockups/index.html
git commit -m "feat(mockups): add gallery index linking all 24 screens"
```

**→ FINAL REVIEW:** Walk the full gallery with the user. Confirm `DESIGN.md` reflects every change made during the build.

---

## Self-Review (completed during authoring)

- **Spec coverage:** All 24 screens in `DESIGN.md §6` map to Tasks 4–16 (patient 13), 17–22 (doctor 6), 23–27 (admin 5). Foundation (§2 tokens, §3 components) → Tasks 1–3. Gallery + §7 deliverable structure → Task 28. Status mapping §5 exercised in Tasks 12, 18, 23, 26. No spec section left unbuilt.
- **Placeholder scan:** Shared CSS (`tokens.css`, `components.css`, `ui.js`) is written in full. Per-screen tasks intentionally reference `DESIGN.md §6` (the source of truth) rather than duplicating each screen's HTML — content detail is not invented in the plan, it already exists in the spec. Acceptance criteria are concrete per screen.
- **Type/name consistency:** Class names used in screen tasks (`.doc-card`, `.slot`, `.badge--*`, `.stepper`, `.rx-item`, `.rx-total`, `.tag-unpriced`, `.video-stage`, `.table`, `.section-card`, `.feature`, `.topnav`, `.tabbar`, `.sidebar`) are all defined in Task 2. `ui.js` hooks (`data-tabs`, `data-tab`, `data-open`, `data-close`, `data-drawer`) match their usage in Tasks 9, 13, 18, 22, 23, 26.

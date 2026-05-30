# Dermestha — Visual Design Specification (v1)

**Document type:** Visual / UX design system + screen spec
**Pairs with:** `docs/PRD.md` (what to build) and the forthcoming `docs/ARCHITECTURE.md` (how it's wired). This document defines *what it looks like and how it behaves visually*.
**Status:** Locked (design language approved). Per-screen layouts are the build brief for the static mockups.
**Date:** 2026-05-29

---

## 1. Design principles

1. **Professional, established clinic — not fashion, not techy.** Dermestha should read like a credible, modern dermatology practice. Restraint, hierarchy, and alignment over decoration.
2. **Specialty boutique, not a marketplace.** Where Ola Doc / Marham are generalist supermarkets, every screen is tuned for skin care: specialization-forward doctor cards, a structured derma prescription, calm visual-first consultation.
3. **Trust is the conversion lever.** Real doctor photography, PMC-verified signalling, transparent money (itemised fees, explicit refund breakdowns), clear states.
4. **Mobile-first, works on 3G, usable by low-tech users.** Big tap targets, one obvious primary action per screen, plain language. Flat rendering (hairline borders, minimal shadow/blur) keeps payloads light.
5. **One responsive system, three surfaces.** Patient (responsive web), doctor (desktop-first), admin (desktop). Shared tokens and components; different navigation chrome.

> Accessibility note: the PRD (§2.3) defers formal WCAG conformance for v1. This spec still adopts a usability baseline — AA-level text contrast, visible focus, ≥44px touch targets, `Asia/Karachi` time labelling — so a later WCAG pass is incremental, not a rebuild.

---

## 2. Design tokens

Tokens are framework-agnostic name→value pairs. They map directly onto a Tailwind `theme.extend` config (the chosen "light, hand-built components" approach) or plain CSS custom properties. Components reference **roles**, not raw hex.

### 2.1 Color

**Brand**
| Token | Value | Use |
|---|---|---|
| `color.primary` | `#0F3A2A` | Deep spruce — primary buttons, links, headings, brand |
| `color.primary-hover` | `#0A2C20` | Hover / pressed |
| `color.primary-tint` | `#E6F1EA` | Subtle green fill (success bg, selected rows) |
| `color.primary-border` | `#C2D3C8` | Green hairline (e.g., slot outline) |
| `color.on-primary` | `#FFFFFF` | Text/icons on spruce |

**Accent (use sparingly — a warm point of contrast, not a second brand color)**
| Token | Value | Use |
|---|---|---|
| `color.accent` | `#B5852F` | Brass — next-slot highlight, small flourishes, large/bold text only |
| `color.accent-deep` | `#9A6B1F` | Brass for **small text** (meets AA on white/porcelain) |
| `color.accent-tint` | `#FBF0E0` | Warning/awaiting background |

**Canvas, surface, ink (cool neutrals)**
| Token | Value | Use |
|---|---|---|
| `color.bg` | `#E8ECE9` | App canvas (cool porcelain) — functional screens |
| `color.surface` | `#FFFFFF` | Cards, inputs, sheets |
| `color.surface-sunken` | `#DFE5E1` | Wells, disabled fills |
| `color.border` | `#D7DED8` | Default 1px hairline |
| `color.border-strong` | `#C2CBC4` | Emphasised border / input border |
| `color.text-strong` | `#13241D` | Headings, key values |
| `color.text-body` | `#46524B` | Body copy |
| `color.text-muted` | `#56625B` | Metadata, secondary labels |

**Feature dark band** (landing hero / footer — the "ownable" green canvas)
| Token | Value | Use |
|---|---|---|
| `color.feature-bg` | `#0F3A2A` | Deep green section background |
| `color.on-dark` | `#DCE9E2` | Body text on green |
| `color.on-dark-muted` | `#AFC6BA` | Secondary text on green |
| `color.on-dark-accent` | `#9BE3B8` | Mint highlight on green (eyebrows, accents); also the video "live" indicator |

**Dark / immersive chrome** (video stage + waiting-room camera preview). Spruce-derived (NOT neutral black) so dark surfaces stay on-brand and feel part of Dermestha.
| Token | Value | Use |
|---|---|---|
| `color.dark-bg` | `#0A2C20` | Video stage / camera-preview background (deep spruce) |
| `color.dark-surface` | `#0E3328` | Self-tile / inset surface on dark |
| `color.dark-border` | `#1F5440` | Hairline on dark surfaces |
| `color.dark-deep` | `#072018` | Full-bleed immersive page background (video consultation screen) |

**Semantic / status** (text color / background tint)
| Token | Text | Background | Use |
|---|---|---|---|
| `success` | `#136B45` | `#E6F1EA` | Confirmed, completed/prescription-ready |
| `info` | `#2F6E6E` | `#E2EFEE` | In progress, cancelled–refunded |
| `warning` | `#9A6B1F` | `#FBF0E0` | Missed/no-show, awaiting prescription |
| `danger` | `#B23A2E` | `#F7E9E6` | Doctor-cancelled, destructive actions, errors |
| `danger-deep` | `#9A2A20` | — | Error text needing higher contrast |
| `neutral` | `#56625B` | `#EAEEEA` | Cancelled–no-refund, generic |

**Contrast guardrails:** `accent` (`#B5852F`) is ~3.4:1 on white — use it only for non-text accents or ≥18px/bold text; use `accent-deep` for small text. All `text-*` roles meet AA on both `bg` and `surface`. White on `primary` meets AA.

### 2.2 Typography

- **Headings / display / labels:** **Archivo** (700, 800). Tight tracking on large sizes.
- **Body / UI:** **Hanken Grotesk** (400, 500, 600, 700).
- **No monospace.** Money, times, counts, and reference numbers use `font-variant-numeric: tabular-nums` in Hanken for column alignment.
- Load via Google Fonts with `preconnect` + `display=swap`; limit to the weights above; fallback stack `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

| Role | Size (mobile→desktop) | Line | Weight | Family | Tracking |
|---|---|---|---|---|---|
| display | 30 → 40 | 1.1 | 800 | Archivo | −0.8px |
| h1 | 24 → 26 | 1.15 | 800 | Archivo | −0.6px |
| h2 | 20 | 1.2 | 700 | Archivo | −0.4px |
| h3 | 17 | 1.3 | 700 | Archivo | −0.3px |
| body-lg | 16 | 1.55 | 400 | Hanken | 0 |
| body | 14 | 1.55 | 400 | Hanken | 0 |
| body-sm | 13 | 1.5 | 400 | Hanken | 0 |
| caption | 12 | 1.4 | 500 | Hanken | 0 |
| label | 11 | 1.2 | 700 | Archivo | +0.8px, UPPERCASE |

### 2.3 Spacing, radius, elevation, motion

- **Spacing** — 4px base scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- **Radius** — `sm 3px` (buttons/controls), `md 4px` (cards/inputs), `lg 6px` (modals/sheets), `pill 999px` (avatars only). Squared = professional; badges use 3px.
- **Borders** — default `1px solid color.border`. Structure is carried by borders, not shadows.
- **Elevation** — flat by default. `shadow.overlay: 0 18px 44px rgba(15,33,24,.25)` for modals, menus, toasts **only**. Sticky bars use a `1px` divider, not a drop shadow.
- **Motion** — 150–200ms ease for hovers/dialogs; one staggered reveal allowed on the landing hero. Honor `prefers-reduced-motion`.

### 2.4 Breakpoints & layout

| Breakpoint | Range | Patient nav | Doctor card grid |
|---|---|---|---|
| mobile | < 640px | bottom tab bar | 1 column |
| tablet | 640–1023px | bottom tab bar (≤767) → top nav (≥768) | 2 columns |
| desktop | ≥ 1024px | top nav | 3 columns |

Content max-width ~1100px, centered, 16–24px gutters. Doctor/admin desktop layouts use a fixed left sidebar (~240px) + fluid content.

### 2.5 Iconography & imagery

- **Icons:** single line style, ~1.75px stroke, 20–24px, currentColor. (Library choice — e.g., Lucide — is an implementation detail; keep the line weight consistent.)
- **Photography:** real doctor portraits, warm and neutral, consistent crop (`object-position: center 20%`). Card image area is a rectangle with a 1px bottom divider; nav/header avatars are circular with initials fallback. Mockups use placeholder portraits; real photos supplied at onboarding (client Week-1 deliverable). Upload constraints per PRD A1: JPEG/PNG/WebP, ≤2MB.
- **PMC-verified badge:** white pill, 1px spruce border, `✓ PMC` — the core trust mark; appears on every doctor card/photo.

### 2.6 Logo

No external logo supplied. Use a **wordmark** "Dermestha" (Archivo 800, −0.6px) + a **square mark** (spruce rounded square, 7px radius, with a brass dot top-right). The mark alone is the favicon / app icon / mobile header lockup.

---

## 3. Component library

The "light" approach: ~16 hand-built components, all token-driven. Each is independently understandable and reused across surfaces.

### 3.1 Button
- **Variants:** `primary` (spruce fill), `secondary` (white + 1px border), `ghost` (text only), `danger` (red fill), `brass` (rare emphasis). 
- **Sizes:** sm (8×14), md (11×18), lg (13×22). Mobile primary CTAs go full-width.
- **States:** default, hover (`primary-hover`), active, `focus-visible` (3px ring `rgba(15,58,42,.30)`), disabled (`surface-sunken`/muted), loading (spinner, label retained, non-interactive).
- Radius `sm`. Label Hanken 700.

### 3.2 Text input / textarea
- Anatomy: label (Archivo label-case 12px), field, helper text, error text.
- States: default (`border-strong`), focus (spruce border + ring), error (`danger` border, `danger-deep` text), disabled. Optional leading icon. Radius `md`.

### 3.3 Select / picker
- Native-styled `<select>` for simple cases; custom listbox for the **medicine search** (D-05) and **day/slot** selection (P-06). Keyboard-navigable.

### 3.4 Checkbox & radio
- Checkbox: the **mandatory ToS/Privacy consent** at sign-up (P2) with inline policy links. Radio group: **"Who is this consultation for?"** Myself / Someone else (P8). Spruce when checked; 3px radius checkbox, circular radio.

### 3.5 Avatar
- Circular; doctor photo or initials on `primary-tint` with `primary` text. Sizes 28/34/48.

### 3.6 Doctor card  *(signature component)*
- Anatomy: photo (with PMC badge overlay) → name (Archivo 700) → specialization + years (muted) → divider → footer: fee (`text-strong`, tabular) + next slot (`accent`/brass, tabular).
- Variants: `listing` (grid), `featured` (landing hero side), `compact` (dashboard rows, horizontal). Whole card is the tap target → doctor profile / booking.

### 3.7 Time-slot button
- States: `available` (white, green hairline), `selected` (spruce fill), `disabled/booked` (sunken, struck-through), `locked` (held during another patient's payment — sunken + small lock). Grouped under day tabs. Tabular time labels. ≥44px tall.

### 3.8 Status badge
- Squared (3px), dot-less, semantic tint+text. Mapping in §5. Used in dashboards, listings, admin tables.

### 3.9 Modal / dialog
- Centered card (radius `lg`, `shadow.overlay`), 4px top accent bar colored by intent (danger for cancellations/deactivation, spruce for confirmations). Title (h3), body, right-aligned actions (ghost "cancel" + filled "confirm"). Used: cancellation (P6), doctor cancel (D5), deactivate doctor (A4), generic confirms.

### 3.10 Inline alert / toast
- Variants success/info/warning/danger (semantic tint + 1px border + icon). Inline for form/section feedback; toast (top-right, `shadow.overlay`, auto-dismiss) for transient confirmations.

### 3.11 System banner
- Full-width strip below the nav for system states: payment-aggregator outage ("new bookings paused"), video-provider outage (reschedule offer). `warning`/`danger` tint, dismissible where safe.

### 3.12 Navigation
- **Top nav (desktop patient + all public):** mark+wordmark left; links (Browse, My Appointments / How it works, For doctors); right: Login (secondary button) or avatar menu. Active link in spruce.
- **Bottom tab bar (mobile patient, logged-in):** Browse / Appointments / Profile, icon+label, active in spruce. Fixed, 1px top divider.
- **Sidebar (doctor & admin, desktop):** fixed ~240px; mark at top, section links with active fill (`primary-tint`), profile + logout pinned bottom. Collapses to a top bar + drawer on mobile.

### 3.13 Table / data row  *(admin)*
- Header row (label-case, sortable carets), zebra-free rows with 1px dividers, hover highlight, status-badge cells, right-aligned numerics (tabular), row → detail. Filters bar above. Desktop-first; below tablet, rows reflow to stacked key/value cards.

### 3.14 Form section card
- White card, section title (h3) + optional helper, grouped fields, footer actions. The backbone of booking, the prescription builder, and all admin forms.

### 3.15 Stepper
- Compact horizontal step indicator for booking (Select slot → Who for → Pay) and reset/onboarding flows. Current step spruce, done step check, upcoming muted.

### 3.16 Prescription line-item + totals  *(signature component)*
- Row: medicine name (strong) + dosage/duration/instructions (body-sm) on the left; price (tabular) right. Free-text (non-catalogue) medicines show a `not priced` neutral tag and are excluded from the total. Footer: **computed total** (tabular, strong) + "N item(s) not priced" note when applicable. Used read-only in the prescription view (P-13) and live (with running total) in the builder (D-05).

### 3.17 Video chrome  *(consultation)*
- Waiting-room card (lighting prompt, device preview), participant tiles (self + remote), control bar (mic / camera / leave), and a slot timer with the slot-end+5min cutoff warning. Shared between patient (P-12) and doctor (D-04) with role-specific controls.

### 3.18 Empty state
- Centered icon + short message + primary CTA. E.g., "No upcoming appointments — Browse doctors" (P9), empty listing, empty search.

### 3.19 Signature layout patterns (anti-generic)
To keep screens feeling finished and on-brand rather than generic, these composition patterns are standard:
- **Split-auth** (`.auth-split`): sign-up and login are a two-pane layout — a full-height spruce brand panel (wordmark + value props + trust line) beside the form (max ~400px). Collapses to a single column with a compact centered brand lockup below 860px. Avoids the "small form adrift on white" look.
- **Document "paper"** (`.rx-paper`): the prescription renders as a centered ~760px document card with a 3px brass top accent and a clinic-lockup header (mark + "PRESCRIPTION" + date) — reads like a real medical Rx, not a generic list.
- **Centered status card**: payment handoff/return states are centered, constrained (~520px) finished cards (icon circle + title + body + single action), not bare alert bars. Return-state variants live under a labelled "Return states" divider.
- **Real centered modals**: cancellation/confirmation modals render centered on a dimmed backdrop (never left-aligned in a content column).
- **Branded immersive header**: the dark video screen carries a slim spruce top bar (mark + wordmark + "Connected" badge) so it's unmistakably in-app.
- **Constraint over whitespace**: content is constrained to intentional reading widths and centered/composed; full-bleed brand surfaces (spruce panels/bands) fill space rather than leaving large empty margins. Top nav is full-width (logo at the left edge, links at the right).

---

## 4. Navigation & layout per surface

- **Patient (responsive):** Public/landing uses the top nav + a deep-green hero band. Logged-in: bottom tabs on mobile, top nav on desktop (same routes). Functional pages sit on the porcelain canvas; landing hero and footer use the feature-dark band.
- **Doctor (desktop-first):** left sidebar (Today, Availability, History) + top bar showing today's date and doctor name. Built for between-clinic-hours desktop use; mobile is a usable fallback (drawer nav).
- **Admin (desktop):** left sidebar (Doctors, Medicines, Alerts, Records & Audit, Settings) + data-dense content. Not optimized for mobile.

---

## 5. Appointment state → badge mapping (PRD §4.3 / P7)

| Underlying state | Patient-facing label | Badge |
|---|---|---|
| `confirmed` | Confirmed | success |
| `in_progress` | In progress | info |
| `completed` / `prescription_issued` | Completed · Prescription ready | success |
| `cancelled_refunded` | Cancelled — refunded | info |
| `cancelled_no_refund` | Cancelled — no refund | neutral |
| `doctor_cancelled` / `doctor_no_show` | Cancelled by doctor — refund issued | danger |
| `patient_no_show` | Missed (no-show) | warning |
| `awaiting_prescription` (derived) | Awaiting prescription | warning |
| `disputed` (flag, admin only) | Disputed | danger outline marker, orthogonal to state |

---

## 6. Screen inventory (24)

Each entry: purpose · layout · key components · states · responsive · PRD ref. Screen IDs map 1:1 to mockup filenames (§7).

### Patient surface (13)

**P-01 · Landing** — *Conversion (KPI #1).* Deep-green hero band: eyebrow, display headline, sub, primary CTA ("Find your dermatologist") + secondary ("How it works"), trust row (PMC-verified · 30-min video · Itemised Rx), and a featured doctor card. Below on porcelain: a 3-step "How it works", a featured specialists grid, a PMC/trust strip, deep-green footer. Logged-out top nav. Responsive: hero stacks single-column on mobile; CTA full-width.

**P-02 · Doctor listing / Browse** — *P1.* Page title + concern filter chips (All / Acne / Pigmentation / Hair & Scalp / Eczema), specialist count, responsive doctor-card grid (1/2/3 col). Inactive doctors hidden. No auth required. States: loading skeleton, empty ("No specialists match"). Top nav (desktop) / bottom tabs (mobile, when logged in).

**P-03 · Doctor profile** — *P1.* Header: large photo, name, specialization, PMC-verified, fee, years, bio. Availability preview + prominent "Book consultation". Deactivated-but-honored doctors still render here for existing patients (photo+bio retained). Opens P-06.

**P-04 · Sign up** — *P2.* Centered form card: full name, email, phone, password; **mandatory consent checkbox** with links to `/legal/terms` & `/legal/privacy` (submit blocked until checked). Error: duplicate email (clear message). Link to login.

**P-05 · Login + password recovery** — *P2, DA2.* Shared login (email + password) → role-routed. Forgot-password request (enumeration-safe: identical response for known/unknown). Set-new-password (token, 1h expiry). Doctors/admin use the same login surface.

**P-06 · Booking (slot + who-for)** — *P3, P8.* Stepper (Select slot → Who for → Pay). Day tabs → time-slot grid (available/selected/disabled/locked). "Who is this consultation for?" radio (Myself default / Someone else → name, age, relation). Fee summary (tabular). "Confirm & Pay" → 10-min lock note. Lead-time-blocked slots disabled. Errors: "slot just taken".

**P-07 · Payment handoff & return** — *P3, edge #6a.* Interstitial ("Taking you to secure checkout"). Return states: success (confirmed → dashboard), failure (retry within lock), lock-expired ("slot released — please pick another"), platform-couldn't-secure-slot (full refund message).

**P-08 · Dashboard — Upcoming** — *P9.* List of `confirmed`/`in_progress`, sorted ascending: compact doctor card, slot date/time (`Asia/Karachi`), "for: [patient]" if applicable, fee, **Join Call** (disabled until 10 min before), **Cancel** link (confirmed only). Empty state → Browse. Mobile: bottom tabs; desktop: top nav.

**P-09 · Dashboard — Past appointments** — *P7.* Rows with terminal-state badges (§5), Download Prescription where applicable, rebook affordance. Refund-status view: breakdown (paid / gateway fee / refund), gateway reference, timeline ("initiated 2 days ago, expected within 7 days").

**P-10 · Cancellation modal** — *P6.* ≥2h: refund breakdown (paid − gateway fee = refund) + "excludes gateway fee" line → "Cancel & refund". <2h: warning modal ("No refund; the slot stays blocked") → confirm. Danger accent bar.

**P-11 · Pre-call waiting room** — *P5.* Lighting prompt ("Find a well-lit area; sit facing a window or lamp"), device/camera preview, "Doctor will be with you shortly" when early, Join button (active from 10 min before).

**P-12 · Video consultation (patient)** — *P5.* Participant tiles, control bar (mic/cam/leave), slot timer + cutoff warning, "doctor running late" state. Browser-only, mobile-tested.

**P-13 · Prescription view + PDF** — *P7, §3.5.* Patient identification header (actual patient name/age/relation), prescription line-items (dosage, instructions, price), `not priced` tags, **computed total**, general notes, follow-up date, doctor metadata. **Download PDF** (rendered client-side from JSON). Multiple prescriptions listed chronologically, each downloadable. Indefinite availability.

### Doctor surface (6)

**D-01 · Forced first-login password change** — *DA3.* Centered form, cannot reach panel until changed. Also the post-admin-reset path (DA5).

**D-02 · Today's appointments + History** — *D2.* Sidebar layout. Today list sorted by slot time: time, patient name (+ "for: X"), notes, **Join Call** (active 10 min before). Separate History tab. Awaiting-prescription reminder surfaced on completed-without-Rx rows.

**D-03 · Weekly availability grid** — *D1.* Sun–Sat × hours grid; tap to set recurring blocks; 30-min auto-slots shown. Editing a block containing confirmed bookings → blocking warning ("cancel each booking first").

**D-04 · Video consultation (doctor)** — *D3.* Same room as patient; doctor controls; soft 5-min-remaining warning; hard cutoff slot-end+5. Joins immediately if patient present.

**D-05 · Prescription builder** — *D4 (signature).* **Read-only patient identification header** (doctor confirms, never types the name). Add medicine: catalogue search + free-text fallback; per-medicine dosage / duration / instructions; **running total** (catalogue priced; free-text flagged `not priced`, excluded). General notes, optional follow-up date. **Submit = immutable**; corrections = new prescription (chronological). "Prescription ready" email on submit.

**D-06 · Cancel appointment modal** — *D5.* Required internal reason (admin-visible). Confirms `doctor_cancelled` → auto-refund (net of gateway fee) + apology email. No time-window restriction.

### Admin surface (5)

**A-01 · Doctors — list / add / edit / deactivate** — *A1, A4.* Table (name, PMC, specialization, fee, status active/pending). Add Doctor form: full name, PMC #, email, phone, photo (JPEG/PNG/WebP ≤2MB), bio, specialization, fee, availability template, **initial password**. Edit: same fields **except PMC # and email (immutable)**; fee-change note (doesn't affect existing appts). Deactivate modal: **warning with count of upcoming confirmed appointments** that will remain (deactivation cancels nothing). Reactivate restores listing.

**A-02 · Medicine catalogue** — *A2.* Searchable table: name, generic (optional), dosage forms, **unit price PKR**, active. Add/edit/deactivate. Note that renames/price changes propagate to the builder but never to existing (immutable) prescriptions.

**A-03 · Alert feed / system health** — *A3.* Feed: payment-webhook reconciliation mismatches, refund-API failures, email send failures (post-retry), `awaiting_prescription` > 12h, unhandled exceptions. Each links to its record. Manual **email re-trigger only** (refunds resolved out-of-band).

**A-04 · Records & Audit Log (unified)** — *A5.* Filters: patient email/phone, doctor, appointment ID, payment ref, user ID/email, event type, actor type (patient/doctor/admin/system), date range. Record rows (appt ID, slot, patient, doctor, state, amount, payment/refund ref). Row → appointment detail with full state-transition history + linked prescriptions; actions: mark `disputed`, re-trigger email. **Read-only** (append-only); mutations are themselves audit-logged. Admin-role only.

**A-05 · Settings** — *A6.* Minimum booking lead time (default 1h, down to 30m). Fallback transaction-fee model (% and/or fixed PKR, validated bounds) used only when the aggregator doesn't report a fee. Changes apply to future bookings only; each change audit-logged.

> **Shared / minor:** the Login surface (P-05) serves doctor + admin. `/legal/terms` and `/legal/privacy` are long-form content pages (M4) using a simple centered prose template on the porcelain canvas — not counted among the 24 interactive mockups but styled from the same tokens.

---

## 7. Mockup deliverable plan

- **Build:** static HTML + one shared stylesheet (`tokens.css` + `components.css`), Google Fonts, vanilla CSS (no build step). Responsive via media queries at the §2.4 breakpoints. This matches the "light, framework-agnostic tokens" decision and keeps the mockups portable into whatever stack the architecture skill selects.
- **Fidelity:** all 24 screens, uniform high fidelity.
- **Structure:**
  ```
  mockups/
    index.html                  ← gallery linking all 24 screens
    assets/css/tokens.css
    assets/css/components.css
    assets/img/                 ← placeholder portraits, icons
    patient-01-landing.html ... patient-13-prescription.html
    doctor-01-password.html ... doctor-06-cancel.html
    admin-01-doctors.html ... admin-05-settings.html
  ```
- **Photography:** placeholder portraits in mockups; real doctor photos swapped in at onboarding.
- **Review:** a gallery `index.html` lets all 24 be reviewed together; screens map 1:1 to the §6 IDs.

---

## 8. Open items & non-goals

- **Component-library binding** (Tailwind vs plain CSS vs headless) is deferred to the architecture step; tokens here are framework-agnostic and map onto any of them.
- **Urdu / RTL** — deferred to v1.2 (PRD §2.3); no layout headroom reserved in v1 per product decision.
- **Real photography & copy** — placeholders now; final assets are a client deliverable.
- **Empty-state / spot illustrations** — simple line-icon style; specific art finalized during the build.
- **Formal WCAG conformance** — out of scope for v1 (PRD §2.3); usability baseline in §1 is followed.
- **Medicine Ordering Module (PRD §6)** screens are **not** in this v1 mockup set (separately scoped); the prescription view (P-13) only exposes prices + total + self-pay PDF.

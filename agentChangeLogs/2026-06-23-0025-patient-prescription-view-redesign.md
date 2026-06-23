# 2026-06-23-0025 — patient-prescription-view-redesign

**Status:** Completed
**Goal:** Redesign the patient prescription view (P-13) **and the doctor prescription builder (D-05)** so they read as well-crafted, on-theme surfaces instead of bare HTML, using only the app's existing design system.
**Skill(s) used:** systematic-debugging (opted in — reframed as design task), brainstorming (opted in), frontend-design (opted in)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (awaiting user approval to commit)
**Last updated:** 2026-06-23-0025
**Tags:** #frontend #design #presentation-only

## Summary
The patient prescription view (`PrescriptionView.jsx`) shipped as a bare placeholder (generic `.section-card` + raw `<ul>/<li>/<p>`), even though the polished "prescription paper" design exists in the mockup (`mockups/patient-13-prescription.html`) and is canon in spec doc 06 (§6 `.rx-paper`, §7 `.rx-item`/`.rx-total`). Root cause: the mockup's paper-shell CSS was never ported into the app's single stylesheet (`client/src/styles/components.css`), and the React view never adopted it — the same class of gap fixed yesterday for the appointment pages. Fix: ported the missing `rx-paper` family into `components.css` (tokens only), added one date formatter, and rewrote the view to render the document. Presentation-only; no API/schema/data changes.

## Context / why
User reported the prescription page "seems bland and dry… looks like simple html… should look like a well-crafted pdf," and asked specifically to follow the app's theming SOP (styles declared in one place, nothing invented). Patient side only for now.

## Files changed
| File | Action | What & why |
|---|---|---|
| `client/src/styles/components.css` | Modified | **Patient (P-13):** added the "paper" shell classes (`.rx-page`, `.rx-subhead`, `.rx-back`, `.rx-paper*`, `.rx-doc-header`, `.rx-doc-right/type/date`, `.rx-divider`, `.rx-patient-band/label/line`, `.rx-section`, `.rx-notes`, `.rx-followup*`, `.rx-doc-footer/info/name`, `.rx-stamp`, `.rx-footer-actions`, `.pmc-badge--inline`, `.older-label`, mobile + print media queries); `white-space: nowrap` on `.rx-item__price`. **Doctor (D-05):** added builder classes (`.rx-builder-item*`, `.mini-field`, `textarea.input`, `.rx-prev*`) + `.field--wide`. **Medicine combobox (follow-up):** added `.med-search*`, `.listbox` (floating popover, `--shadow-overlay`), and `.option*` (hover/active spruce-tint, name/generic/price, `--freetext`) — these classes were referenced by `MedicineSearch` but never defined, so the dropdown rendered unstyled. Tokens only, no raw hex. |
| `client/src/modules/prescription/views/PrescriptionView/PrescriptionView.jsx` | Modified | Rewrote from a `.section-card` placeholder into the paper document: clinic lockup (reuses `.brand*`), patient-ID band, `.rx-item` list with `Not priced` tag + em-dash, spruce total + unpriced caption, notes block, follow-up row (+ computed "(N weeks)"), doctor signature footer (initials `.avatar--lg`, name + inline PMC badge, specialization · PMC reg # · issued stamp), Download PDF (existing) + Print. Newest-first with "Earlier prescription" dividers; back-link to `/appointments/history`. Zero inline styles. |
| `client/src/modules/prescription/views/PrescriptionBuilder/PrescriptionBuilder.jsx` | Modified | Rewrote from a placeholder that misused `.appt-row` for form rows. Now: back-link + h1, read-only patient-ID band (reuses `.rx-patient-band`), a "Medicines" `.section-card` (kept `MedicineSearch` intact) rendering `.rx-builder-item` rows (Dosage/Duration/Instructions grid + right-aligned price + danger-ghost Remove), running total + caption, full-width notes `<textarea>`, follow-up card, immutability-confirm submit, and a read-only "Previously submitted" list of `.rx-prev` cards (newest-first, `.rx-item` rows + Submitted badge). Submit logic unchanged. Zero inline styles. |
| `client/src/lib/format/format.js` | Modified | Added `formatKarachiDate` (weekday + day + month + **year**, no time) for the document header/footer/follow-up and the doctor issued-stamp — prescriptions should show the year, which `formatKarachi` omits. |
| `client/src/modules/prescription/components/MedicineSearch/MedicineSearch.jsx` | Modified | **Follow-up polish:** restyled the medicine combobox — leading magnifier icon, full-width field, helper line; the dropdown is now a floating popover (`.listbox`) with structured options (bold name + muted generic + right-aligned price) and a visually separated "free text" fallback row (term bolded + `tag-unpriced`). Behavior/roles/keyboard-nav and the `getByLabel`/`getByRole('option')`/placeholder contracts all preserved. |
| `client/test/unit/.../PrescriptionView.test.jsx` | Modified | Updated 3 assertions to the redesign copy/structure ("Not priced" tag, split total row, "1 item not priced" caption). Intent preserved. |
| `client/test/unit/.../PrescriptionBuilder.test.jsx` | Modified | Updated 3 assertions: case-insensitive identity match (band cases the relation, "Age 9 · Son"), total read off the `.rx-total` row, "1 item not priced" caption. Submit-flow test unchanged. |

## Dependencies / config / schema
None.

## Decisions
- **Reuse over re-invent:** the mockup hand-rolled `.rx-clinic-mark/word`; the app already has `.brand__mark/word` (identical brand mark). Used those, plus existing `.avatar--lg`, `.pmc-badge`, `.rx-item*`, `.rx-total`, `.tag-unpriced`, `.btn*`. Only the missing paper shell was added.
- **No doctor photo:** `doctorSnapshot` is an immutable `{name, pmcNumber, specialization}` — no `photoUrl`. Used an initials `.avatar--lg` instead of the mockup's headshot, preserving the immutability guarantee (no live-data leak into a snapshot document).
- **App convention over mockup literal:** prices render via `formatPkr` → "Rs 1,500" (not the mockup's "PKR").
- **Newest-first display:** API returns `issuedAt asc`; reversed for display only (most relevant on top), matching the mockup. Data untouched.
- **Print support:** kept the mockup's Print button + added a minimal `@media print` (hides nav chrome / actions / back-link) so the on-screen document also prints cleanly.
- **Doctor (D-05) — no "View full prescription" button:** the mockup's prev-card had one, but there is no doctor route to view a prescription as a document (the `/appointments/:id/prescriptions` route is patient-only via `RoleRoute`). The `.rx-prev` card already shows all items, so the button was omitted (no dead destination).
- **Doctor (D-05) — notes as `<textarea>`:** switched the single-line `<input>` to a `<textarea>` (matches the mockup; multi-line clinical notes). Label text unchanged; e2e/unit assertions unaffected.
- **Doctor (D-05) — keep `MedicineSearch` as-is:** the e2e (`j3`) drives it via `getByLabel('Add medicine')` + `getByRole('option')`; initially left untouched and wrapped the new layout around it.
- **Medicine combobox restyle (follow-up, user-requested):** the dropdown looked "off" because `.listbox`/`.option` were never defined (bare `<ul>`). Designed an on-theme floating popover rather than an in-flow list (a search menu should overlay, not push content; `--shadow-overlay` is sanctioned for menus per §6). Kept the placeholder containing "search medicine" ("Search medicines by name…") so the existing `getByPlaceholderText(/search medicine/i)` assertions still match — no test churn this increment.

## Notable findings
- Exact same root-cause class as the 2026-06-22-1500 appointments redesign (mockup CSS never ported to `components.css`). The `.rx-item*`/`.rx-total`/`.tag-unpriced` classes already existed in `components.css` but the React view never even used them.
- The e2e `e2e/tests/j3-prescription.spec.js` asserts on the "Prescriptions" heading, "E2E Acne Cream" text, and "Download PDF" button — all preserved by the rewrite.

## Verification
- `npm run build` (client) — clean (multiple runs across patient + doctor changes).
- `npx eslint` on the changed views + formatter — clean.
- `npx vitest run` (full client suite) — **141 passed (40 files)**, incl. the 7 prescription tests (PrescriptionView + PrescriptionBuilder) after assertion updates.
- Visual: rendered throwaway preview HTML linking the **real** `tokens.css` + `components.css` with markup mirroring each view's JSX; screenshotted via Playwright. Patient document: desktop (1100px) + mobile (390px) — brass accent, clinic lockup, patient band, styled items, total, notes, follow-up, signature footer, "Earlier prescription" divider, full-width mobile actions. Doctor builder: desktop (1100px) — patient band, Medicines card with builder-item field grid + danger-ghost Remove, total + caption, notes textarea, follow-up, submit, "Previously submitted" `.rx-prev` card. Only console error was a favicon 404 (harmless). Preview artifacts deleted afterward.
- e2e j3 not re-run (requires full server/DB/auth stack) — assertions (`Write prescription` heading, `Add medicine` label, `Submit prescription` / `Confirm & issue` buttons, patient `Prescriptions` / `Download PDF`) confirmed preserved by inspection.

## Risk / rollback
Low. Presentation-only, additive CSS, two view rewrites (submit/data logic unchanged). Revert by restoring the changed files. No data/API/schema impact. The shared-class edit (`.rx-item__price` nowrap) is used only by the prescription surfaces.

## Open items / next session
- Spec doc-impact: doc 06 should record the ported `rx-paper` + builder families, `.field--wide`, and `formatKarachiDate` (mirrors the 2026-06-22 appointments entry). Tracked in the task wrap-up; apply only after the user approves the spec edits.
- Patient side committed as `75f637c`; doctor side + test updates committed separately (see index). Neither pushed (awaiting user).

# 2026-06-23-0025 — patient-prescription-view-redesign

**Status:** Completed
**Goal:** Redesign the patient prescription view (P-13) so it reads as a well-crafted document instead of bare HTML, using only the app's existing design system.
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
| `client/src/styles/components.css` | Modified | Added the prescription "paper" shell classes (`.rx-page`, `.rx-subhead`, `.rx-back`, `.rx-paper*`, `.rx-doc-header`, `.rx-doc-right/type/date`, `.rx-divider`, `.rx-patient-band/label/line`, `.rx-section`, `.rx-notes`, `.rx-followup*`, `.rx-doc-footer/info/name`, `.rx-stamp`, `.rx-footer-actions`, `.pmc-badge--inline`, `.older-label`, mobile + print media queries) — tokens only, no raw hex. Also added `white-space: nowrap` to the existing `.rx-item__price` so money never wraps on mobile. |
| `client/src/modules/prescription/views/PrescriptionView/PrescriptionView.jsx` | Modified | Rewrote from a `.section-card` placeholder into the paper document: clinic lockup (reuses `.brand*`), patient-ID band, `.rx-item` list with `Not priced` tag + `—`, spruce total + unpriced caption, notes block, follow-up row (+ computed "(N weeks)"), doctor signature footer (initials `.avatar--lg`, name + inline PMC badge, specialization · PMC reg # · issued stamp), Download PDF (existing) + Print. Newest-first ordering with "Earlier prescription" dividers; back-link to `/appointments/history`. Zero inline styles. |
| `client/src/lib/format/format.js` | Modified | Added `formatKarachiDate` (weekday + day + month + **year**, no time) for the document header/footer/follow-up — prescriptions should show the year, which `formatKarachi` omits. |

## Dependencies / config / schema
None.

## Decisions
- **Reuse over re-invent:** the mockup hand-rolled `.rx-clinic-mark/word`; the app already has `.brand__mark/word` (identical brand mark). Used those, plus existing `.avatar--lg`, `.pmc-badge`, `.rx-item*`, `.rx-total`, `.tag-unpriced`, `.btn*`. Only the missing paper shell was added.
- **No doctor photo:** `doctorSnapshot` is an immutable `{name, pmcNumber, specialization}` — no `photoUrl`. Used an initials `.avatar--lg` instead of the mockup's headshot, preserving the immutability guarantee (no live-data leak into a snapshot document).
- **App convention over mockup literal:** prices render via `formatPkr` → "Rs 1,500" (not the mockup's "PKR").
- **Newest-first display:** API returns `issuedAt asc`; reversed for display only (most relevant on top), matching the mockup. Data untouched.
- **Print support:** kept the mockup's Print button + added a minimal `@media print` (hides nav chrome / actions / back-link) so the on-screen document also prints cleanly.

## Notable findings
- Exact same root-cause class as the 2026-06-22-1500 appointments redesign (mockup CSS never ported to `components.css`). The `.rx-item*`/`.rx-total`/`.tag-unpriced` classes already existed in `components.css` but the React view never even used them.
- The e2e `e2e/tests/j3-prescription.spec.js` asserts on the "Prescriptions" heading, "E2E Acne Cream" text, and "Download PDF" button — all preserved by the rewrite.

## Verification
- `npm run build` (client) — clean (2 runs, after CSS port and after the nowrap tweak).
- `npx eslint` on the changed view + formatter — clean.
- Visual: rendered a throwaway preview HTML linking the **real** `tokens.css` + `components.css` with markup mirroring the new JSX; screenshotted desktop (1100px) and mobile (390px) via Playwright. Document renders as intended (brass accent, clinic lockup, patient band, styled items, total, notes, follow-up, signature footer, "Earlier prescription" divider, full-width mobile actions). Only console error was a favicon 404 (harmless). Preview artifacts deleted afterward.
- e2e j3 not re-run (requires full server/DB/auth stack) — assertions confirmed compatible by inspection.

## Risk / rollback
Low. Presentation-only, three client files, additive CSS. Revert by restoring the three files. No data/API/schema impact. The one shared-class edit (`.rx-item__price` nowrap) is used only in the prescription view.

## Open items / next session
- Doctor-side prescription page (D-05 builder/view) was explicitly out of scope ("patient side for now").
- Spec doc-impact: doc 06 revision footer should record the ported `rx-paper` family + `formatKarachiDate` (mirrors the 2026-06-22 appointments entry). Tracked below; apply only after commit + user approval.
- Commit is held pending user approval (user asked to be pinged before committing).

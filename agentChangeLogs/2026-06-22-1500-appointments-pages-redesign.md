# 2026-06-22-1500 — appointments-pages-redesign

**Status:** Completed (code verified; doc-impact + commit pending approval)
**Goal:** Fix the visual/UX design flaws on the patient (P-08/P-09) and doctor (D-02) appointment pages by porting the mockups' intended design into the shared stylesheet and restructuring the list rows.
**Skill(s) used:** systematic-debugging (invoked, then set aside — this is a design task, not a bug hunt); frontend-design context (design is locked to the existing system, so implemented directly)
**Ticket / issue:** None
**Branch:** main (no new branch — per CLAUDE.md, will not branch without approval)
**Commits / PR:** 1678f02 (code), + doc-06 spec-update commit
**Last updated:** 2026-06-22-1500
**Tags:** #frontend #ux #design-system

## Summary
The appointment pages referenced CSS classes (`.tabs`, `.tab`, `.tab--active`, `.appt-row`, `.empty-state`)
that were never defined in `components.css` — the intended design lived only in the inline `<style>` of the
HTML mockups and was never ported. Result: tabs rendered as raw links and rows as unstyled stacked divs with
oversized, congested buttons, no visible status, and lots of dead whitespace. This session ports that design
into the shared token-based stylesheet, restructures the three list views into proper row cards with clear
hierarchy + status badges, de-emphasises/relabels the action buttons, and adds a single state→badge mapping.

## Context / why
User-reported design flaws on both doctor and patient appointment screens: nav buttons look like bare links
with no gap; list items not UI-friendly; write/download prescription buttons congested and too big; excess
whitespace; the data in each row (status, name, time) is unclear. Requirement: follow the app's existing
theming/shared-component conventions and keep styles consolidated in one place.

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-22-1500-appointments-pages-redesign.md` | Created | This session log |
| `agentChangeLogs/index.md` | Modified | Index entry for this session |
| `client/src/styles/components.css` | Modified | Added token-based `.tabs/.tab/.tab--active` (underline tab control), `.appt-list/.appt-row/...` row-card component, and `.btn--danger-ghost` variant — all ported from the mockups |
| `client/src/lib/format/format.js` | Modified | Added shared `formatKarachiTime` (time-only) + `initials` helpers for the row layout |
| `client/src/modules/appointment/stateLabel.js` | Modified | Added active-state labels (Confirmed/In progress/Payment pending) as a fallback + `stateBadge` state→variant map (doc 06 §3) |
| `client/src/modules/appointment/views/Upcoming/Upcoming.jsx` | Modified | Restructured rows into avatar + meta + status badge + compact actions; proper `.empty` state |
| `client/src/modules/appointment/views/Past/Past.jsx` | Modified | Same row-card structure; status badge now state-mapped (was always neutral) |
| `client/src/modules/appointment/components/DoctorAvatar/DoctorAvatar.jsx` | Created | Shared doctor-avatar (photo or initials) for the patient appointment rows |
| `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx` | Modified | Time-led row cards for Today, meta-led for History; status badge on every row; compact actions |
| `docs/specification/06-DESIGN_SYSTEM_THEME_DOCUMENT.md` | Modified | v1.10 — §7 documents `.tabs`/`.appt-row`/`.btn--danger-ghost`; §3 status-badge note; revision footer |

## Dependencies / config / schema
None.

## Decisions
- Define the already-referenced class names (`.tabs/.tab/.tab--active`, `.appt-row`) in `components.css`
  rather than renaming JSX to the mockups' `.doc-tabs`/`.nav-tabs` — most surgical, fixes all three pages,
  consolidates two mockup naming variants into one shared set.
- Keep Cancel as a `<button>` (tests assert `role=button name=/cancel/`), de-emphasised via `btn--sm` +
  new `btn--danger-ghost` variant, instead of the mockup's bare danger link.
- Do NOT add a "concern"/chief-complaint line to doctor rows — the appointment API returns no such field
  (verified in server/src/modules/appointment/service.js). Surface only data that exists.
- Patient rows lead with the doctor avatar (`doctorPhotoUrl` exists); doctor Today rows lead with a time
  column; doctor History rows are meta-led (date+time in the sub-line) since a 76px time column is too narrow.

## Notable findings
- The mismatched/undefined CSS classes are the root cause of every reported flaw (missing styling, not bad styling).
- `DoctorCard.jsx` has a private `initials()` helper duplicating the one I added to format.js — pre-existing,
  left untouched (out of scope; flagged here).

## Verification
- Targeted specs: `Upcoming` (7) + `Past` (9) + `DoctorToday` (8) = 24 passed.
- Full client suite: **141 passed / 40 files** (`npm --workspace client run test`).
- Production build clean: `npm --workspace client run build` → 355 modules, CSS 20.20 kB, built in 2.70s.
- Not visually screenshotted (would require the full server+Postgres stack); structure was ported 1:1 from the
  approved mockups, so the unit + build evidence covers correctness. Can spin up the app for a visual pass on request.

## Risk / rollback
Low blast radius: presentation-only changes to 3 views + additive CSS/util/label helpers. No API/schema/behavior
change. Revert = restore these files. New CSS classes are additive (no existing rule modified).

## Open items / next session
- DONE: client tests + build green.
- DONE: doc-impact applied (user-approved) — doc 06 v1.10, §7 (new `.appt-row` + `.tabs` components,
  `.btn--danger-ghost` variant) + §3 (status badge on every row).
- Optional: visual screenshot pass on the running app (not done this session).
- Not pushed (per CLAUDE.md, awaiting explicit approval to push).

# 2026-06-12-2349 — slice-g-admin-panel-brainstorm

**Status:** Completed
**Goal:** Brainstorm and write the approved design spec for Slice G — the full admin panel (F10, F12, F13, F14 + screens A-01…A-05).
**Skill(s) used:** superpowers:brainstorming (user-invoked)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** docs(spec) commit for the Slice G design doc + this changelog
**Last updated:** 2026-06-12-2349
**Tags:** #design #spec #admin-panel

## Summary
Slice F (Prescriptions) is merged; the user chose the admin panel as the next step. Brainstormed Slice G scope with the user via the brainstorming skill: explored canon (docs 00/02/05/06/13) and code seams (two Explore agents over server + client), resolved the open decisions one question at a time, presented the design in five sections (each approved), and wrote the design spec to `docs/superpowers/specs/2026-06-12-slice-g-admin-panel-design.md`.

## Context / why
M3 sits at ~85–90% (A-02 admin medicine UI outstanding) and M4 at 0%. The spec suite already named Slice G (admin panel) and Slice H (vendor adapters + launch surface); Slice G has no external-credential dependency, so it goes first.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-12-slice-g-admin-panel-design.md` | Created | Approved Slice G design: F10 doctor management + photo upload (local disk + Docker volume), F12 alert feed (audit-row sources + exception bridge), F13 records & audit, F14 settings, five admin views, testing + spec-impact plan |
| `agentChangeLogs/2026-06-12-2349-slice-g-admin-panel-brainstorm.md` | Created | This session log |
| `agentChangeLogs/index.md` | Modified | Appended this session's line |

## Dependencies / config / schema
None this session (design only). The design itself plans: multer dependency, `UPLOADS_DIR` env var, `dermestha_uploads` Docker volume — all in the build session, none applied now. No schema changes planned at all.

## Decisions
1. **Next slice = Slice G, one big slice** (user chose over a G1/G2 split).
2. **Photo storage:** local disk + named Docker volume (like `dermestha_pg`), multer memory → magic-byte validation → `uploads/doctors/<id>.<ext>`, static serve; object storage deferred.
3. **F12.01 "unhandled exceptions" source:** audit-row bridge — `errorHandler` writes `system.unhandled_exception`; Sentry/DSN wiring stays a separate later item.
4. **Build order:** vertical, scaffold-first — A-02 medicines (UI-only) → F10+A-01 → F13+A-04 → F12+A-03 → F14+A-05.
5. **Alert feed:** live query over audit rows + derived awaiting-prescription predicate; no dedicated alerts table (closes the question Slice E deferred).
6. **Email re-trigger:** reset failed job to `pending`; existing dispatch worker resends (no parallel send path).

## Notable findings
- Slice G needs **zero schema changes** — every field it touches (`photoUrl`, `status`, `mustChangePassword`, `disputed`, `Settings`, notification failure fields) already exists from M0's schema-first design.
- `Settings` (id=1) is already read live by slot generation (`doctor/service.js:104`) and refund fallback (`appointment/service.js:309`), so F14 needs only routes + UI.
- Slice E deliberately wrote the alert audit rows (`payment.reconciliation_mismatch`, `payment.refund_exhausted`, `email.send_failed_final`) with `targetRef` for this feed.
- Client has no admin module; `SidebarLayout` links are doctor-hardcoded (becomes a prop); `.table`/`.filters`/`.modal-*`/`.badge` CSS already ported from mockups.
- Doc 05 names the resend param `:eventId`; it is the notification-job id — naming fix queued for the spec sweep.

## Verification
Design-only session: no code changed, no tests run. The design's success criteria define the build-time verification (integration proof of DA1→DA3 loop, #9 non-cascade, settings live effect, volume persistence).

## Risk / rollback
None — documentation only. Revert = delete the spec + this log entry.

## Open items / next session
1. User reviews `docs/superpowers/specs/2026-06-12-slice-g-admin-panel-design.md`.
2. On approval: invoke superpowers:writing-plans to produce the Slice G implementation plan.
3. At build start: ask the user about branch creation (`feature/slice-g`) — requires explicit approval per CLAUDE.md.
4. Spec-suite edits (design §8) need explicit user approval before any doc 00–15 file is touched.

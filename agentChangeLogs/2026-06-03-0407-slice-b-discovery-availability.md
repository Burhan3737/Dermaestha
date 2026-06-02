# 2026-06-03-0407 — slice-b-discovery-availability

**Status:** In progress
**Goal:** Build Slice B (Discovery & Availability) of the M1+M2 journey — public doctor listing/profile, doctor weekly availability + 30-min slot generation, nav layouts, seeded doctors; screens P-02/P-03/D-03.
**Skill(s) used:** superpowers:brainstorming (user-invoked) → writing-plans next
**Ticket / issue:** None
**Branch:** feat/slice-b-discovery-availability (off main @ 9440403)
**Commits / PR:** (pending)
**Last updated:** 2026-06-03-0407
**Tags:** #feature #discovery #availability #frontend

## Summary
Second slice of the 4-slice M1+M2 decomposition (Slice A merged in 9440403). Brainstormed + approved the Slice B design: doctor discovery (listing/profile), availability read/replace with slot generation, three nav layouts, seeded demo doctors. Implementation pending.

## Context / why
Slice A delivered auth + the client foundation. Slice B adds the read-side discovery + doctor availability that booking (Slice C) depends on. Doctors are seeded because admin onboarding is M4.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-03-slice-b-discovery-availability-design.md` | Created | Slice B design (brainstorming output). |
| `agentChangeLogs/2026-06-03-0407-slice-b-discovery-availability.md` | Created | This changelog. |
| `agentChangeLogs/index.md` | Modified | Added Slice B index line. |

## Dependencies / config / schema
Planned (pending): add `date-fns-tz` (server) for Asia/Karachi→UTC slot math (ADR-21). No schema change (Doctor/AvailabilityBlock models already exist). Seed gains demo doctors (data, not schema).

## Decisions
- Doctor seeding via `seed.js` (demo doctors + availability). (User chose.)
- Build all 3 nav layouts now (TopNav + BottomTabs + Sidebar). (User chose.)
- P-03 shows slots; Book → Slice-C placeholder. (User chose.)
- Timezone: `date-fns-tz` server-side + native `Intl` client display. (User chose.) → ADR-21.
- P-01 Landing confirmed OUT of Slice B (M4).

## Notable findings
- `seed.js` currently seeds only settings + 3 medicines — no doctors/users.
- Slots are generated at read time (not stored), so the availability guard checks live appointments, not slot rows.

## Verification
Not verified (design stage; no code yet).

## Risk / rollback
New server dependency (`date-fns-tz`) + ADR-21 doc edit; both reversible. No schema/migration in Slice B.

## Open items / next session
- Governance: write ADR-21 (doc 11) + doc-03 note (after spec approval, before code).
- Run writing-plans → implement Slice B (TDD) → merge like Slice A.
- doc 13 status sweep on completion.

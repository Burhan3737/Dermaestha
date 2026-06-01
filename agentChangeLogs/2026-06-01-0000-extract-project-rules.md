# 2026-06-01-0000 — extract-project-rules

**Status:** Completed
**Goal:** Populate the empty PROJECT_RULES.md by extracting all binding technical rules, conventions, and anti-patterns from ARCHITECTURE.md into a single scannable reference.
**Skill(s) used:** superpowers:writing-plans (opted in)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (awaiting user commit approval)
**Last updated:** 2026-06-01-0000
**Tags:** #docs

## Summary

`PROJECT_RULES.md` existed but was empty. `CLAUDE.md` requires reading it on every load; it was pointing at nothing. This session extracted all binding rules from `docs/engineering/ARCHITECTURE.md` into 13 topic-grouped sections with imperative rule statements and `[ARCH §x]` citations. No numeric values were hard-coded — they reference `CONFIG.md`, `prisma/schema.prisma`, or `.env.example` to prevent drift.

## Context / why

`CLAUDE.md` references `PROJECT_RULES.md` as the project-specific rule set to load every session. Without content, developers/agents had to read the full ARCHITECTURE.md prose to find binding rules mixed into rationale. This extraction creates a scannable, citation-backed rule index.

## Files changed

| File | Action | What & why |
|---|---|---|
| `PROJECT_RULES.md` | Modified (populated) | Extracted comprehensive rules from ARCHITECTURE.md §1–§15 into 13 topic sections with [ARCH §x] citations |
| `agentChangeLogs/2026-06-01-0000-extract-project-rules.md` | Created | Session changelog (this file) |
| `agentChangeLogs/index.md` | Modified | Added one-line entry for this session |

## Dependencies / config / schema

None. Documentation-only change.

## Decisions

- **Comprehensive scope** (confirmed with user): extracted invariants, layering, auth, data/money/time, immutability, adapter seams, styling, config/deploy, AND the §15 anti-patterns.
- **Cite [ARCH §x]** on every rule (confirmed with user) for traceability.
- **No numeric value hard-coding**: values deferred to `CONFIG.md`/`prisma/schema.prisma`/`.env.example` as ARCH §17 specifies; rules reference those files by name.
- **Module Context heading** scaffolded empty (CLAUDE.md expects it for per-module notes added after user approval).

## Notable findings

- The no-double-booking partial index caveat is the single highest-risk rule: Prisma's DSL cannot express a `WHERE` clause on a UNIQUE index, so the hand-edit of the generated migration SQL is non-negotiable and must be visible. Prominently surfaced in the Critical Invariants section.
- PROJECT_RULES.md was an untracked file with a single blank line — no prior content to preserve.

## Verification

- Completeness: §1–§15 of ARCHITECTURE.md scanned; each rule-bearing statement is represented or explicitly deferred to its contract file.
- §5 critical-constraints list mapped 1:1 to PROJECT_RULES.md "Critical invariants" section.
- §15 anti-pattern table reproduced 1:1 in "What NOT to over-engineer" section.
- All section headings carry `[ARCH §x]` citations.
- No numeric values (timeouts, thresholds, buffer windows) copied into PROJECT_RULES.md.

## Risk / rollback

None. Documentation-only; no code or config changed. Revert by discarding PROJECT_RULES.md changes.

## Open items / next session

- None arising from this session. PROJECT_RULES.md is now the active rule reference; add Module Context entries as modules are worked on (with user approval per CLAUDE.md).

# 2026-06-01-2321 — documentation-suite-design

**Status:** Partial
**Goal:** Brainstorm and spec a canonical, numbered documentation suite (per `docs/documentation_guide.md`) that becomes the sole source of truth for Dermestha.
**Skill(s) used:** `superpowers:brainstorming` (opted in via slash command)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (commit pending user approval per CLAUDE.md)
**Last updated:** 2026-06-01-2321
**Tags:** #docs

## Summary
Ran the brainstorming process to design a 16-document canonical suite (`00`–`15`) under `docs/specification/`, following `documentation_guide.md`. Resolved the key decisions (sole-source-of-truth, faithful re-presentation only, §6 included-but-deferred, two extra docs approved, old docs left as-is) and wrote the design spec. Implementation (the actual document generation) is the next phase via `writing-plans`.

## Context / why
The repo already holds rich engineering docs (PRD, ARCHITECTURE, API, DESIGN, CONFIG, INTEGRATIONS, prisma schema) but not in the standardized numbered format the documentation guide prescribes, and with no governance/status docs. The user wants a single navigable canon that reorganizes existing information for readability without altering it.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-01-documentation-suite-design.md` | Created | The approved design spec for the documentation suite. |
| `agentChangeLogs/2026-06-01-2321-documentation-suite-design.md` | Created | This session change log. |
| `agentChangeLogs/index.md` | Modified | Added one-line entry for this session. |

## Dependencies / config / schema
None.

## Decisions
- Suite is the **sole source of truth**; old docs deprecated-by-policy, left physically unchanged (deprecation recorded in doc 00).
- **Faithful re-presentation only** — reformat/structure/index existing info; do not invent, alter, or drop facts.
- §6 Medicine Ordering Module **included** under explicit "Deferred — not in v1 build" sections.
- Approved extra docs: **14 (Integration Contracts)**, **15 (Configuration Reference, separate)**.
- Location `docs/specification/`; files `00`–`15`; standardized file anatomy with per-file index.
- Generate in dependency-tier batches (A–G) with review checkpoints.

## Notable findings
- `INTEGRATIONS.md` and `CONFIG.md` have no natural home in the guide's 01–12 scheme — hence docs 14 and 15.
- Docs 09 (testing) and 12 (test cases) are net-new but must be *derived only* from documented scope (02) + security (08), not authored freely.
- Populating 13 (status) requires inspecting `server/`/`client/` against the ARCH §5b module inventory; unverifiable items get `Not verified`.

## Verification
Not verified (design phase only; no code or docs generated yet beyond the spec).

## Risk / rollback
None — only a spec file and changelog entries were added. Revert by deleting the spec file and reverting the index line.

## Open items / next session
- Spec self-review (placeholder/consistency/scope/ambiguity scan).
- User review of the written spec.
- Invoke `superpowers:writing-plans` to produce the generation plan.
- Commit pending user approval (not allowed to commit without it per CLAUDE.md).

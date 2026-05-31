# Changelog: docs-restructure — 2026-05-31

## Executive summary
Reorganized the flat `docs/` folder into a lifecycle-based structure (`product/`, `engineering/`, `design/`) with a new `README.md` index. All files were moved (git history preserved for tracked files via `git mv`), inconsistent names normalized, and every hard-coded `docs/*.md` cross-reference rewritten to the new paths. The skill-generated `docs/superpowers/` tree was left untouched per developer decision.

## Files affected

### Moved
| From | To | Why |
|---|---|---|
| `docs/PRD.md` | `docs/product/PRD.md` | Group discovery/product docs. |
| `docs/competitive-baseline.md` | `docs/product/competitive-baseline.md` | Same. |
| `docs/proposal/PROPOSAL.md` + PDF | `docs/product/proposal/` | Same. |
| `docs/meetingNotes/05_26_2026.txt` | `docs/product/meeting-notes/2026-05-26.txt` | Group + kebab folder + ISO date. |
| `docs/ARCHITECTURE.md` | `docs/engineering/ARCHITECTURE.md` | Group build contracts. |
| `docs/API.md` | `docs/engineering/API.md` | Same. |
| `docs/CONFIG.md` | `docs/engineering/CONFIG.md` | Same. |
| `docs/INTEGRATIONS.md` | `docs/engineering/INTEGRATIONS.md` | Same. |
| `docs/DESIGN.md` | `docs/design/DESIGN.md` | Group design docs. |

### Created
| File | Why |
|---|---|
| `docs/README.md` | Index/map of all docs by lifecycle; flags `superpowers/` as generated scratch and `DESIGN.md` as canonical. Later amended with a "Related artifacts (not docs)" table pointing to `../mockups/` and `../prisma/schema.prisma`. |

### Addendum — artifacts left at repo root (decision)
Evaluated moving `prisma/` and `mockups/` into `docs/`. **Decided against:** both are run/built artifacts, not documentation — `prisma/schema.prisma` is at the Prisma CLI's default path, and `mockups/` is a runnable HTML prototype destined for the frontend. Only action taken: added the "Related artifacts" pointer table to `docs/README.md` (no file moves). `requirements.txt.txt` at repo root flagged but left untouched.

### Edited (cross-reference rewrites only)
| File | Change | Why |
|---|---|---|
| `.env.example` | 2 refs: `docs/CONFIG.md`, `docs/ARCHITECTURE.md` → `docs/engineering/...` | Files moved. |
| `prisma/schema.prisma` | 3 refs: ARCHITECTURE/PRD/CONFIG → new paths (`docs/engineering/...`, `docs/product/PRD.md`) | Files moved. |
| `docs/engineering/ARCHITECTURE.md` | header "Pairs with" (PRD→product, DESIGN→design) + §17 table (API/CONFIG/INTEGRATIONS → `docs/engineering/...`) | Files moved. |
| `docs/engineering/API.md` | "Companion to" ARCHITECTURE.md → `docs/engineering/ARCHITECTURE.md` | Files moved. |
| `docs/engineering/CONFIG.md` | Same. | Files moved. |
| `docs/engineering/INTEGRATIONS.md` | Same. | Files moved. |
| `docs/design/DESIGN.md` | "Pairs with" PRD→product, ARCHITECTURE→engineering | Files moved. |

### Not touched (intentional)
- `docs/superpowers/**` — developer chose to leave generated scratch as-is (still references old `docs/PRD.md`/`docs/DESIGN.md`; noted in README as stale).
- `agentSessions/**`, `changelogs/**` — point-in-time history records; old paths preserved.

## Verification
- Link sweep: no old-path `docs/*.md` references remain outside `superpowers/`, `agentSessions/`, `changelogs/`.
- `git status` confirms renames (R/RM) for tracked moves — history intact.
- `docs/` root contains only `README.md` + 4 folders.

---

## Session narrative (merged from the former `agentSessions/` report)

### Goal
Restructure the flat `docs/` folder into a lifecycle-based structure with a README index, while keeping all cross-references intact.

### Decisions (by developer)
- Lifecycle subfolders + README index.
- Leave `docs/superpowers/` untouched (still holds a stale design-spec snapshot superseded by `DESIGN.md`).
- UPPERCASE for canonical docs, kebab-case + ISO dates for the rest.
- Move everything and fix every link (vs. partial foldering).

### Notable findings
- `docs/superpowers/specs/2026-05-29-visual-design-design.md` is a stale, shorter copy of `docs/design/DESIGN.md` (DESIGN.md has 18 extra lines incl. §3.19). Left in place per the "leave superpowers untouched" decision; flagged in README.
- The spec docs are tightly cross-linked (~15 hard-coded `docs/*.md` paths). History records (`agentSessions/`, `changelogs/`) intentionally NOT updated — they are point-in-time.

### Follow-up for future sessions
- The `prd`, `prd-review`, and `architecture` skills default to `docs/PRD.md` / `docs/ARCHITECTURE.md` (root). Pass explicit paths now: `docs/product/PRD.md`, `docs/engineering/ARCHITECTURE.md`.

# Dermestha — Documentation Index

Docs are grouped by **lifecycle stage**: discovery → product spec → engineering contracts → design. Paths below are stable; tools and cross-references rely on them.

## product/ — discovery & requirements
| Doc | Purpose |
|---|---|
| [`product/PRD.md`](product/PRD.md) | Product Requirements Document (v2) — the source of truth for *what* to build. |
| [`product/competitive-baseline.md`](product/competitive-baseline.md) | Competitive analysis (Ola Doc, Al Marham) and how Dermestha differentiates. |
| [`product/proposal/PROPOSAL.md`](product/proposal/PROPOSAL.md) | Client-facing project proposal (+ PDF in the same folder). |
| [`product/meeting-notes/`](product/meeting-notes/) | Dated meeting notes (ISO `YYYY-MM-DD`). |

## engineering/ — build contracts
| Doc | Purpose | Binds |
|---|---|---|
| [`engineering/ARCHITECTURE.md`](engineering/ARCHITECTURE.md) | System architecture — how it's wired. §17 indexes the companion specs. | PRD §3 |
| [`engineering/API.md`](engineering/API.md) | REST endpoint inventory, API conventions, §4.3 state-machine transition table. | ARCHITECTURE §17 |
| [`engineering/CONFIG.md`](engineering/CONFIG.md) | Pinned operational constants (timing, rate limits, crypto, migration caveats). | ARCHITECTURE §17 |
| [`engineering/INTEGRATIONS.md`](engineering/INTEGRATIONS.md) | Vendor adapter contracts (PayFast, Daily.co, Resend) + payload shapes. | ARCHITECTURE §12, §17 |

> The runnable data model lives in [`prisma/schema.prisma`](../prisma/schema.prisma); deploy config in [`.env.example`](../.env.example).

## design/ — visual & UX
| Doc | Purpose |
|---|---|
| [`design/DESIGN.md`](design/DESIGN.md) | **Canonical** visual design system + 24-screen spec. |

## superpowers/ — generated scratch (not hand-maintained)
Output from the brainstorming/plans skills. `superpowers/specs/2026-05-29-visual-design-design.md` is a **stale snapshot** superseded by `design/DESIGN.md` — do not edit by hand or treat as authoritative.

## Related artifacts (not docs)
Built/run, not read — these live at the repo root, not under `docs/`. Each is generated from a spec here:

| Artifact | Generated from | What it is |
|---|---|---|
| [`../mockups/`](../mockups/) | `design/DESIGN.md` | Runnable static HTML prototype (24 screens + component reference + shared CSS/JS). Open `mockups/index.html`. |
| [`../prisma/schema.prisma`](../prisma/schema.prisma) | `engineering/ARCHITECTURE.md` §5 | Executable Prisma data model (CLI default path — do not move). |

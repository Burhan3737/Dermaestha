# Dermestha Architecture v2 — Index

Produced by: `anthropics/knowledge-work-plugins@system-design`  
Inputs: `docs/mvp-scope.md`, `docs/competitive-baseline.md`, `docs/architectureSkillGuideLine.md`  
Stack: React + Vite / Node.js + Express / PostgreSQL + Prisma / Vercel + Railway / Daily.co / Resend

---

## Reading Order

| File | Section | Start here if you need to... |
|---|---|---|
| [01-requirements.md](01-requirements.md) | Requirements | Understand what the system must do and non-negotiable constraints |
| [02-high-level-architecture.md](02-high-level-architecture.md) | High-Level Architecture | See the component diagram and storage decisions |
| [03-tech-stack.md](03-tech-stack.md) | Tech Stack | Know what packages to install and why each was chosen |
| [04-data-model.md](04-data-model.md) | Data Model | Copy-paste the Prisma schema into `schema.prisma` |
| [05-api-surface.md](05-api-surface.md) | API Surface | See every REST endpoint, its auth, and its request/response shape |
| [06-directory-structure.md](06-directory-structure.md) | Directory Structure | Know where every file lives and why |
| [07-key-abstractions.md](07-key-abstractions.md) | Key Abstractions | Understand the 5 services and middleware interfaces |
| [08-data-flows.md](08-data-flows.md) | Data Flows | Trace booking, prescription, cron, and video-join end-to-end |
| [09-environment-variables.md](09-environment-variables.md) | Environment Variables | Set up `.env` files for server and client |
| [10-effort-estimates.md](10-effort-estimates.md) | Effort Estimates | Plan sprints — per-module days, build order, complexity |
| [11-no-over-engineer.md](11-no-over-engineer.md) | What NOT to Build | Anti-pattern table to prevent scope creep |
| [12-scale-reliability.md](12-scale-reliability.md) | Scale & Reliability | Load math, failure modes, and the scaling path post-launch |
| [13-trade-offs.md](13-trade-offs.md) | Trade-off Analysis | Every architecture decision with what was rejected and when to revisit |
| [14-future-considerations.md](14-future-considerations.md) | Future Considerations | v1.1 → v2 upgrade paths with exact file changes |

---

## Locked Decisions

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Frontend hosting | Vercel |
| Backend | Node.js + Express |
| Backend hosting | Railway |
| Database | PostgreSQL (Railway managed) |
| ORM | Prisma |
| Auth | JWT + bcrypt (7-day expiry) |
| Video | Daily.co (`@daily-co/daily-react`) |
| Email | Resend |
| PDF | PDFKit (in-process) |
| File storage | Railway volume at `/uploads` |
| Scheduling | node-cron inside Express process |

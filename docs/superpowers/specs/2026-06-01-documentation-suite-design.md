# Dermestha — Canonical Documentation Suite — Design Spec

**Document type:** Design specification (brainstorming output)
**Status:** Approved (design ratified by user 2026-06-01); ready for implementation planning
**Date:** 2026-06-01
**Skill used:** `superpowers:brainstorming` (user opted in via slash command)
**Next step:** hand off to `superpowers:writing-plans` to produce the step-by-step generation plan

---

## 1. Index

1. [Purpose](#2-purpose)
2. [Background & sources of truth](#3-background--sources-of-truth)
3. [Locked decisions](#4-locked-decisions)
4. [The document set](#5-the-document-set)
5. [Standard file anatomy](#6-standard-file-anatomy)
6. [The two special documents](#7-the-two-special-documents)
7. [Per-document content mapping](#8-per-document-content-mapping)
8. [Generation order & review checkpoints](#9-generation-order--review-checkpoints)
9. [Out of scope / non-goals](#10-out-of-scope--non-goals)
10. [Open items](#11-open-items)

---

## 2. Purpose

Produce a **canonical, numbered documentation suite** for the Dermestha telederm platform under `docs/specification/`, following the structure prescribed by `docs/documentation_guide.md`. The suite becomes the **sole source of truth**; the existing engineering docs remain in place but are deprecated-by-policy.

The defining constraint: this is a **faithful re-presentation** effort. Existing information is reorganized, structured, indexed, and made easier for humans and agents to read — but **not invented, altered, or dropped**. Net-new documents (testing, test cases) are *derived strictly* from documented scope and security material, not authored from imagination.

---

## 3. Background & sources of truth

The repository already contains high-fidelity engineering docs. The suite absorbs them:

| Existing file | Feeds suite doc(s) |
|---|---|
| `docs/product/PRD.md` | 01 (PRD), 02 (Scope), 07 (Risk) |
| `docs/engineering/ARCHITECTURE.md` | 03 (Architecture) |
| `prisma/schema.prisma` | 04 (Database) |
| `docs/engineering/API.md` | 05 (API Spec) |
| `docs/design/DESIGN.md` + `mockups/assets/css` | 06 (Design System) |
| `docs/engineering/INTEGRATIONS.md` | 14 (Integration Contracts) |
| `docs/engineering/CONFIG.md` + `.env.example` | 15 (Configuration Reference) |
| `Dockerfile`, `docker-compose.yml`, ARCH §13/§14 | 10 (Deployment) |
| `agentChangeLogs/`, `docs/superpowers/specs/` | 11 (ADR) |
| `server/`, `client/`, milestone notes | 13 (Status Tracker) |

---

## 4. Locked decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Suite relationship to existing docs | **Sole source of truth.** New suite is canonical; old docs deprecated-by-policy. |
| D2 | Self-containment | Each doc reads independently; duplicate facts where needed so a doc is self-sufficient. |
| D3 | Location | `docs/specification/`, numbered files `00`–`15`. |
| D4 | §6 Medicine Ordering Module | **Included**, in a clearly-flagged "Deferred — not in v1 build" section within relevant docs. |
| D5 | Optional docs | Include **14 (Integration Contracts)** and **15 (Configuration Reference, separate)**. |
| D6 | Old-doc handling | **Left exactly as-is** (no banners, no move). Deprecation recorded in the governance doc (00). |
| D7 | Editing posture | **Faithful re-presentation only.** Reformat/restructure/index for readability; never change the substance of source information. |
| D8 | Per-file index | Every file carries an in-file index (TOC). |

---

## 5. The document set

Folder: `docs/specification/`

| # | File | Origin |
|---|---|---|
| 00 | `00-INDEX_AND_GOVERNANCE.md` | Requested (governance + suite map) |
| 01 | `01-PRD_DOCUMENT.md` | Guide |
| 02 | `02-SCOPE_FEATURE_DOCUMENT.md` | Guide |
| 03 | `03-ARCHITECTURE_DOCUMENT.md` | Guide |
| 04 | `04-DATABASE_DOCUMENT.md` | Guide |
| 05 | `05-API_SPECIFICATION_DOCUMENT.md` | Guide |
| 06 | `06-DESIGN_SYSTEM_THEME_DOCUMENT.md` | Guide |
| 07 | `07-RISK_ASSUMPTION_DOCUMENT.md` | Guide |
| 08 | `08-SECURITY_COMPLIANCE_DOCUMENT.md` | Guide |
| 09 | `09-DEVTESTING_QATESTING_DOCUMENT.md` | Guide (net-new, derived) |
| 10 | `10-DEPLOYMENT_DOCUMENT.md` | Guide |
| 11 | `11-ARCHITECTURE_DECISION_RECORD.md` | Guide |
| 12 | `12-SCOPE_FEATURE_TEST_CASES_DOCUMENT.md` | Guide (net-new, derived) |
| 13 | `13-PRODUCT_STATUS_TRACKER.md` | Requested (status) |
| 14 | `14-INTEGRATION_CONTRACTS_DOCUMENT.md` | Suggested + approved |
| 15 | `15-CONFIGURATION_REFERENCE_DOCUMENT.md` | Suggested + approved |

No further documents proposed — this set covers the full project scope (product, scope, architecture, data, API, design, risk, security, testing, deployment, decisions, status, integrations, config) with no identified overlap.

---

## 6. Standard file anatomy

Every file `00`–`15` follows the same skeleton:

1. `# NN — <Document Name>`
2. **Metadata block** — `Document ID` · `Status: Canonical` · `Version` · `Last-updated` · `Sources absorbed` (exact paths) · `Related docs`
3. **In-file Index** — numbered TOC with anchor links
4. **Purpose** — 2–3 lines
5. **Body** — exactly the sections the guide prescribes for that document
6. **Revision footer** — per-file change log (date · what changed · why)

**Cross-referencing by stable ID, never duplicated prose.** A fact lives in one place and is referenced elsewhere by ID:
- Requirement IDs: `P1`–`P9`, `D1`–`D5`, `A1`–`A6`, `DA1`–`DA6`, `MO1`–`MO2`
- Feature IDs (doc 02): `F01`, `F01.02`, `F01.02.a`
- Invariants: `#1`–`#10` (PRD §3.3)
- Edge cases: `Edge #1`–`Edge #40` (PRD §4.4)
- Decisions: `ADR-NN` (doc 11)
- Test cases: `TC-F01-001` (doc 12)

The "Sources absorbed" metadata line is the audit trail proving each doc is a faithful re-presentation of a specific source file (diff-able old→new).

---

## 7. The two special documents

### 7.1 `00-INDEX_AND_GOVERNANCE.md`

Entry point + change protocol.

- **Suite map & reading order** — the dependency chain What → How → Look → Guard → Valid → Ship → Record (per `documentation_guide.md`).
- **Glossary** — the canonical glossary (carried faithfully from PRD Appendix A) lives here in `00` as the shared entry point; all other docs reference it rather than redefining terms.
- **Change protocol:**
  - Surgical-edit rule: touch only the changed fact; never restructure or delete surrounding content; nothing is removed unless the underlying fact is removed.
  - ID-assignment rules for new features/modules (next free `FNN`, `ADR-NN`, etc.).
  - **Change-impact matrix:** e.g., a new feature → update `02` → then `04`, `05`, `12`, `13`. A schema change → `04` → `05`, `08`, `12`. A new decision → `11` (+ the doc it affects).
  - Versioning + revision-footer convention.
  - Deprecation policy: the original `docs/` files are not canon and must not be edited as canon.
  - Cross-reference-integrity rule: never reuse or break a retired ID.
  - Alignment with `PROJECT_RULES.md` / `CLAUDE.md` changelog discipline.

### 7.2 `13-PRODUCT_STATUS_TRACKER.md`

Defined format; both axes requested.

- **Status legend** — `Done` / `In progress` / `Not started` / `Deferred → v1.1` / `Deferred → v1.2+` — plus a `Last-verified` date.
- **Milestone snapshot** — M1–M4 (PRD §5.1) with % complete.
- **Module-wise table** — the 19 backend modules + 3 workers + frontend (ARCH §5b): `module → milestone → status → evidence (actual file/path) → notes`.
- **Feature-wise table** — F-IDs (doc 02): `feature → status → owning module → milestone`.
- **Iteration roadmap** — v1 / v1.1 / v1.2+ (PRD §5.1) with status.
- **Remaining-for-v1** — focused checklist of what's left.

Accuracy rule: current state is determined by inspecting `server/` and `client/` against the module inventory. Anything not verifiable in code is marked **`Not verified`** (never guessed).

---

## 8. Per-document content mapping

Each doc is generated per its `documentation_guide.md` section, sourced as in §3. Notes on the docs that need care:

- **02 Scope** — numbers every v1 feature as `FNN`; includes the §6 Medicine Ordering features under an explicit "Deferred — not in v1 build" heading; carries the §4.3 state machine and §4.4 edge catalogue.
- **04 Database** — schema blocks copied faithfully from `prisma/schema.prisma` (actual field/model names); includes the hand-added `uniq_active_slot` partial-index caveat.
- **05 API** — endpoint inventory + error envelope + state-machine transition table from `API.md`.
- **08 Security** — re-frames PRD §3.6 + ARCH §11 against the OWASP Top-10 categories the guide lists; pulls crypto/cookie/rate-limit values from `CONFIG.md`.
- **09 Testing / 12 Test Cases** — net-new but **derived only** from doc 02 acceptance criteria, §4.4 edge cases, and doc 08 controls; `TC-FNN-NNN` IDs map back to features.
- **14 Integrations** — adapter `@typedef` contracts, PayFast/Daily/Resend payload shapes, the 6-email merge-var catalog, the analytics event catalog.
- **15 Configuration** — single canonical knob list: timing windows, rate-limits/lockout, worker cadence, refund backoff, crypto/cookie params, migration caveats, env-var contract.

---

## 9. Generation order & review checkpoints

Generate in dependency tiers; each tier is a review checkpoint (a format problem is caught on Batch A, not replicated 16×):

- **A — What:** 00, 01, 02
- **B — How:** 03, 04, 05, 14, 15
- **C — Look:** 06
- **D — Guard:** 07, 08
- **E — Valid:** 09, 12
- **F — Ship / Record:** 10, 11
- **G — Status:** 13 (last — references everything)

*(Alternative considered: generate all 16 at once. Rejected — replicates any format defect across the whole suite. Batch A ratifies the standard anatomy first.)*

---

## 10. Out of scope / non-goals

- **No information change.** Substance of existing docs is preserved; only presentation improves.
- **No edits to the deprecated `docs/` originals.**
- **No code changes.** This effort produces documentation only.
- **No new product decisions.** Where the source is silent, the suite stays silent (or marks `Not verified` / points to an open question), rather than inventing.

---

## 11. Open items

- None blocking. The §6 inclusion style, config-doc separation, and old-doc handling are all resolved (§4).

---

## Revision footer

| Date | Change | Why |
|---|---|---|
| 2026-06-01 | Initial spec created and approved | Brainstorming output ratified by user |

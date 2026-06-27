# 00 — Index & Governance

| Field            | Value                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Document ID      | `00-INDEX_AND_GOVERNANCE`                                                                              |
| Status           | Canonical                                                                                              |
| Version          | 1.1                                                                                                    |
| Last updated     | 2026-06-28                                                                                             |
| Sources absorbed | `docs/superpowers/specs/2026-06-01-documentation-suite-design.md §7.1; docs/product/PRD.md Appendix A` |
| Related docs     | all (00–15)                                                                                            |

---

## Index

1. [Suite map](#1-suite-map)
2. [Reading order](#2-reading-order)
3. [Glossary](#3-glossary)
4. [Change protocol](#4-change-protocol)
5. [Change-impact matrix](#5-change-impact-matrix)
6. [Versioning & revision footers](#6-versioning--revision-footers)
7. [Deprecation policy](#7-deprecation-policy)

---

## Purpose

This document is the single entry point for the `docs/specification/` suite. It maps every document in the suite, defines the reading order for new contributors, establishes the shared glossary, and codifies the rules that govern how the suite is kept accurate and internally consistent over time.

---

## 1. Suite map

| #   | File                                      | Purpose                                                                                           |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 00  | `00-INDEX_AND_GOVERNANCE.md`              | Suite entry point: map, reading order, glossary, and the change protocol                          |
| 01  | `01-PRD_DOCUMENT.md`                      | High-level product requirements for stakeholders                                                  |
| 02  | `02-SCOPE_FEATURE_DOCUMENT.md`            | Numbered feature requirements (the most-referenced doc); single source of truth for what is built |
| 03  | `03-ARCHITECTURE_DOCUMENT.md`             | System architecture, tech stack, data-flow diagrams, deployment topology                          |
| 04  | `04-DATABASE_DOCUMENT.md`                 | Database schema, tables, relationships, indexing, naming conventions                              |
| 05  | `05-API_SPECIFICATION_DOCUMENT.md`        | REST endpoint inventory, auth, error format, state-machine transition table                       |
| 06  | `06-DESIGN_SYSTEM_THEME_DOCUMENT.md`      | Design system: screen flows, navigation, color/typography/spacing tokens, component behavior      |
| 07  | `07-RISK_ASSUMPTION_DOCUMENT.md`          | Assumptions, known risks with mitigations, open questions                                         |
| 08  | `08-SECURITY_COMPLIANCE_DOCUMENT.md`      | OWASP controls, data-handling policies, access-control strategy                                   |
| 09  | `09-DEVTESTING_QATESTING_DOCUMENT.md`     | Testing strategy, scope, environments, test-case structure, bug lifecycle, DoD                    |
| 10  | `10-DEPLOYMENT_DOCUMENT.md`               | Deployment overview, environments, steps, rollback, monitoring, releases                          |
| 11  | `11-ARCHITECTURE_DECISION_RECORD.md`      | Log of key architectural decisions (context/decision/consequences)                                |
| 12  | `12-SCOPE_FEATURE_TEST_CASES_DOCUMENT.md` | Functional + security test cases mapped to feature IDs                                            |
| 13  | `13-PRODUCT_STATUS_TRACKER.md`            | Current build state: feature-wise and module-wise progress + roadmap                              |
| 14  | `14-INTEGRATION_CONTRACTS_DOCUMENT.md`    | External adapter contracts, vendor payload shapes, email merge-vars, analytics catalog            |
| 15  | `15-CONFIGURATION_REFERENCE_DOCUMENT.md`  | Canonical tunable constants + environment-variable contract                                       |

---

## 2. Reading order

Later documents build on information established in earlier ones, so reading in dependency order prevents forward-reference confusion.

**What** (01, 02) → **How** (03, 04, 05, 14, 15) → **Look** (06) → **Guard** (07, 08) → **Valid** (09, 12) → **Ship** (10) → **Record** (11) → **Status** (13)

Start with what the product is and what it builds (01, 02); then understand how it is constructed — its architecture, data model, API contract, integrations, and configuration (03, 04, 05, 14, 15); then how it should look and feel (06); then what can go wrong and how it is secured (07, 08); then how correctness is verified (09, 12); then how it reaches production (10); then the record of key design choices (11); and finally where the build currently stands (13).

---

## 3. Glossary

All documents in this suite reference the definitions below rather than redefining terms locally; if a term appears in another doc, its authoritative meaning is the one recorded here.

| Term                          | Meaning                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PMC**                       | Pakistan Medical Commission — official medical licensing body                                                                                                                    |
| **DRAP**                      | Drug Regulatory Authority of Pakistan                                                                                                                                            |
| **Slot lock**                 | Booking a slot creates a `pending` appointment that holds (locks) the slot; the slot frees only when a human cancels or rejects the appointment — there is no 10-minute timed auto-expiry (ADR-43).        |
| **Immutable prescription**    | A submitted prescription cannot be edited; corrections require issuing a new linked prescription                                                                                 |
| **`feeAtBooking`**            | Snapshot of the doctor's consultation fee taken at booking/lock time (when the pending appointment is created, for the payment instructions); never changes for that appointment thereafter (ADR-43).      |
| **`mustChangePassword`**      | Flag on a user record (doctor or admin) requiring a password change before the next protected route is reached; set on creation and on admin reset, cleared on successful change |
| **Medicine price snapshot**   | The unit price copied onto a prescription (and onto a medicine order) at issue/placement time; later catalogue price changes never alter it (§3.3 #5).                           |
| **Minimum booking lead time** | Admin-configurable gap required between "now" and a bookable slot's start; default 1 hour, supported down to 30 minutes in v1 (§4.1 #3).                                         |

---

## 4. Change protocol

**These 16 documents are the sole source of truth.** Editors are humans or agents.

**Surgical-edit rule:** when a fact changes, edit ONLY the affected fact in place; never restructure, reformat, or delete surrounding content that did not change; remove content only when the underlying fact itself is removed.

**ID-assignment rule:** new features get the next free `FNN` in doc 02; new decisions get the next `ADR-NN` in doc 11; new test cases get the next `TC-FNN-NNN` in doc 12. Never reuse or renumber a retired ID.

**Self-containment:** each doc must remain readable on its own; cross-reference other docs by ID, do not duplicate large bodies of prose.

---

## 5. Change-impact matrix

| Change type                | Update in this order      |
| -------------------------- | ------------------------- |
| New feature                | 02, then 04, 05, 12, 13   |
| Schema change              | 04, then 05, 08, 12       |
| New external integration   | 14, then 03, 05, 08, 15   |
| New tunable/config value   | 15, then 08, 10           |
| New architectural decision | 11, then the affected doc |
| Build progress change      | 13                        |

---

## 6. Versioning & revision footers

- Bump a doc's `Version` minor (e.g., 1.0 → 1.1) on any content change.
- Record every change as a new row in that doc's revision footer (`Date | Change | Why`).
- Keep `Last updated` current.

---

## 7. Deprecation policy

The original engineering docs — `docs/product/PRD.md`, `docs/engineering/ARCHITECTURE.md`, `docs/engineering/API.md`, `docs/engineering/CONFIG.md`, `docs/engineering/INTEGRATIONS.md`, `docs/design/DESIGN.md` — are **deprecated-by-policy**. They remain in the repo for history but are NOT canon and must not be edited as the source of truth. This `docs/specification/` suite supersedes them.

---

## Revision footer

| Date       | Change           | Why                                                      |
| ---------- | ---------------- | -------------------------------------------------------- |
| 2026-06-01 | Initial creation | First version of the suite entry point + change protocol |
| 2026-06-28 | Glossary as-built sync: `Slot lock` (no timed expiry), `feeAtBooking` (at booking/lock time); removed `No-show grace`, `disputed`, `Refund idempotency key` (ADR-43) | Manual-payment pivot — as-built sync |

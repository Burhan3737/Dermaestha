# Design Document Generation Guidelines

Use this file as an instruction set for an AI agent to generate a complete design documentation suite for any software project. The agent should read the target project's codebase, gather context from the user, and produce each document following the structure, style, and depth described below.

## Document Set Overview

Documents follow a deliberate dependency chain:

```text
What   → 01-PRD + 02-SCOPE_FEATURE
How    → 03-ARCHITECTURE + 04-DATABASE + 05-API_SPECIFICATION
Look   → 06-DESIGN_SYSTEM_THEME
Guard  → 07-RISK_ASSUMPTION + 08-SECURITY_COMPLIANCE
Valid  → 09-DEVTESTING_QATESTING + 12-SCOPE_FEATURE_TEST_CASES
Ship   → 10-DEPLOYMENT
Record → 11-ARCHITECTURE_DECISION_RECORD
```

Generate documents in this order so later documents can reference earlier ones.

---

## 01 - PRD Document

**File**: `01-PRD_Document.md`

**Purpose**: High-level product requirements. Written for stakeholders, not engineers.

**What to include**:

- Problem statement (2-3 paragraphs describing the pain point and why this product exists).
- Product description (what the system is in plain language).
- Objectives (bullet list of 4-6 measurable goals).
- Core features (high-level, one line each, no implementation detail).
- Additional features (non-functional qualities like responsiveness, auth, audit, availability).
- Success metrics / KPIs (measurable outcomes that define success).

**How to generate**:

- Ask the user for the business context/problem if not obvious from codebase.
- Extract high-level feature names from route definitions, navigation schemas, or module folders.
- Keep language business-facing, not technical.

---

## 02 - Scope Feature Document

**File**: `02-SCOPE_FEATURE_DOCUMENT.md`

**Purpose**: Detailed, numbered feature requirements that serve as the single source of truth for what will be built. This is the most referenced document in the set.

**What to include**:

- Features numbered as `F01`, `F02`, ... `FNN`.
- Sub-features numbered as `F01.01`, `F01.02`, etc.
- Granular items lettered as `F01.01.a`, `F01.01.b`, etc. when needed.
- For each feature:
  - One-line feature summary.
  - Form fields with input type, required/optional, and data source.
  - Business rules and validation constraints.
  - List/table column definitions and action buttons.
  - Role-specific behavior differences.
  - References to shared UI components by name.

**Style rules**:

- Use `### __FNN - Feature Name__` for top-level features.
- Use `* __FNN.NN - Sub Feature__` for sub-features.
- Bold field names with type/required info in parentheses.
- Write rules as named constraints (e.g., `__Overlap Rule__`, `__Max Span Rule__`).

**How to generate**:

- Read all route definitions, navigation schemas, page components, and module folders.
- Read any existing feature docs, implementation docs, or screen docs in the repo.
- Map each route/module to a numbered feature.
- Extract form fields from component JSX/TSX.
- Extract validation rules from validators, hooks, or API middleware.
- Ask the user for any business rules not visible in code.

---

## 03 - Architecture Document

**File**: `03-ARCHITECTURE_DOCUMENT.md`

**What to include**:

1. **High-level architecture** - Monolith vs microservices vs hybrid. One paragraph + bullet points.
2. **Technology stack** - Frontend, backend, database, tooling. Extracted from `package.json`, config files, Dockerfiles.
3. **Data flow diagrams** (Mermaid):
   - Simple 3-layer architecture diagram (`flowchart TB` with `subgraph` for Presentation / Application / Data layers).
   - One sequence diagram per critical user flow (keep participants to 3-4 max).
   - One normal-flow diagram showing 2-3 core business processes.
4. **Integration points** - External APIs, message queues, third-party services. State explicitly if none exist.
5. **Deployment architecture** - Local dev setup and production setup.
6. **Evolution direction** - Future extraction or scaling notes.

**Diagram rules**:

- Keep diagrams simple. Do not list individual modules as separate nodes in architecture diagram.
- Use `subgraph` for layer grouping.
- Sequence diagrams should have max 4 participants.
- Use `flowchart TB` (top-to-bottom) for layer diagrams, not `LR`.

**How to generate**:

- Read `package.json` (frontend and backend) for stack.
- Read Docker/docker-compose files for deployment info.
- Read environment config files for integration points.
- Read route handlers and middleware for flow understanding.

---

## 04 - Database Document

**File**: `04-DATABASE_DOCUMENT.md`

**What to include**:

1. **Database type** - Primary DB, modeling style, v1 approach summary.
2. **Core collections/tables** - One subsection per collection with:
   - Short description.
   - Final schema as JavaScript/TypeScript object (for Mongoose/ORM projects) or SQL DDL.
   - Include reusable embedded/snapshot objects separately if used across collections.
3. **Collection relationships** - Reference links and snapshot explanations.
4. **Indexing strategy** - Compound indexes mapped to screen filter/sort behavior.
5. **Naming conventions** - Collection names, ID fields, timestamps, status enums, soft delete pattern.
6. **Scope-to-database notes** - How features map to collections.

**Critical rules**:

- Schema objects must match actual model files in the codebase. Read existing models first.
- If the project uses embedded snapshot objects (denormalized copies for history), define them once and reuse.
- Mark optional fields explicitly. All other fields are required.
- Use the project's actual field names, not invented ones.

**How to generate**:

- Read all model/schema files in the backend.
- Read any existing collection documentation.
- Cross-reference with scope document features to ensure coverage.
- Ask the user which collections exist if not obvious from code.

---

## 05 - API Specification Document

**File**: `05-API_SPECIFICATION_DOCUMENT.md`

**What to include**:

1. **Auth mechanism** - Token type (JWT/session), refresh strategy, field mode auth if applicable.
2. **Base URL and versioning** - API prefix pattern.
3. **Endpoints per module** - Grouped by feature/collection:
   - Method + path.
   - Request body/params.
   - Response shape.
   - Required permissions.
4. **Error format** - Standard error response structure with codes.
5. **Pagination/filtering patterns** - If a shared pattern exists.

**How to generate**:

- Read route files, controllers, and middleware.
- Read any existing API pattern documentation.
- Extract request/response shapes from types or validation schemas.

---

## 06 - Design System Theme Document

**File**: `06-DESIGN_SYSTEM_THEME_DOCUMENT.md`

**What to include**:

1. **Screen flows** - Core interaction patterns used across the app (list->filter->action->confirm, etc.) and reusable building blocks (shared components).
2. **Navigation structure** - Extracted from nav schema with section groupings and routes.
3. **Key interactions** - Form validation patterns, confirmation dialogs, state feedback.
4. **Color palette** - Extract exact hex values and token names from theme file.
5. **Typography** - Font stack, heading/body variant usage, and rules.
6. **Spacing rules** - Spacing scale, layout rhythm, border-radius conventions.
7. **Component behavior** - Theme-level overrides for core UI components (buttons, cards, inputs, etc.) and shared component standards.

**How to generate**:

- Read the theme file (e.g., `muiTheme.ts`, `tailwind.config`, `theme.js`).
- Read navigation schema for structure.
- Read `shared/components` index for reusable building blocks.
- Extract actual color values, font settings, and component override patterns.

---

## 07 - Risk & Assumption Document

**File**: `07-RISK_ASSUMPTION_DOCUMENT.md`

**What to include**:

- **Assumptions** - Business/technical assumptions the team is operating under (bullet list).
- **Known risks** - Technical, operational, or business risks with brief mitigation notes.
- **Open questions** - Unresolved decisions or ambiguities.

**How to generate**:

- Review scope document for implicit assumptions.
- Check for TODO/FIXME comments in codebase.
- Ask the user for known business assumptions.

---

## 08 - Security & Compliance Document

**File**: `08-SECURITY_COMPLIANCE_DOCUMENT.md`

**What to include**:

1. **OWASP considerations** - One subsection per relevant OWASP Top 10 category with specific controls for this project:
   - Broken access control
   - Cryptographic failures
   - Injection
   - Insecure design
   - Security misconfiguration
   - Identification/authentication failures
   - Software/data integrity failures
   - Security logging/monitoring failures
2. **Data handling policies** - Classification, minimization, retention, transmission, access/privacy, backup/recovery.
3. **Access control strategy** - Authorization model (RBAC etc.), role definitions, endpoint authorization rules, special access flows (field mode/PIN/SSO), audit/traceability.

**How to generate**:

- Read auth middleware, permission models, and role definitions from code.
- Cross-reference with scope document role definitions.
- Read environment config for secrets handling patterns.
- Align OWASP items to actual project patterns (e.g., Mongoose validation for injection, embedded audit logs for insecure design).

---

## 09 - Dev Testing & QA Testing Document

**File**: `09-DEVTESTING_QATESTING_DOCUMENT.md`

**What to include**:

1. **Testing strategy** - Unit, integration, QA functional, UAT layers with scope for each.
2. **Test scope** - In-scope features and explicitly out-of-scope items for current version.
3. **Test environments** - Dev and staging environment definitions.
4. **Test types** - Functional, regression, basic security, data integrity.
5. **Test case structure** - ID format (`TC-<Feature>-<Seq>`), required fields, priority flow coverage mapped to scope features.
6. **Bug lifecycle** - Status flow diagram and severity level definitions.
7. **Entry/exit criteria** - What must be true to start QA and to release.
8. **Definition of Done** - Checklist for feature completion.
9. **Test reporting** - Metrics, pass rate, defect summary, release recommendation format.

**How to generate**:

- Map test scope directly to scope document features.
- Reference database document for data integrity testing needs.
- Reference security document for security test items.

---

## 10 - Deployment Document

**File**: `10-DEPLOYMENT_DOCUMENT.md`

**What to include**:

1. **Deployment overview** - Type (containerized/serverless/VM) and strategy (rolling/blue-green).
2. **Environments** - Dev, staging, production with key differences.
3. **Pre-deployment checklist** - Build, test, config verification steps.
4. **Deployment steps** - Step-by-step procedure.
5. **CI/CD pipeline** - If applicable, pipeline stages and triggers.
6. **Rollback plan** - How to revert a failed deployment.
7. **Post-deployment validation** - Smoke tests and health checks.
8. **Monitoring & alerts** - What to monitor post-deploy.
9. **Access control** - Who can deploy to which environment.
10. **Versioning/releases** - Version scheme and release tagging.

**How to generate**:

- Read Dockerfiles, docker-compose, CI config files (.github/workflows, Jenkinsfile, etc.).
- Read package.json scripts for build/deploy commands.
- Read environment variable patterns.

---

## 11 - Architecture Decision Record

**File**: `11-Architecture_Decision_Record.md`

**What to include**:

- Log of key architectural decisions made during the project.
- Each entry should have: Decision title, date, context, decision, consequences.
- Examples: "Use single timesession collection instead of separate timesheets", "Embed user snapshots for historical integrity", "Use PIN-based auth for field mode".

**How to generate**:

- Extract from conversation history, scope notes, and database modeling decisions.
- Ask the user for any major decisions made before documentation started.

---

## 12 - Scope Feature Test Cases Document

**File**: `12-SCOPE_FEATURE_TEST_CASES_DOCUMENT.md`

**What to include**:

1. **Purpose and references** - Link to scope and security documents.
2. **Test case format** - Standard fields (ID, feature mapping, preconditions, steps, expected result, priority).
3. **Common preconditions** - Shared test data baseline.
4. **Functional test cases** - Grouped by feature (`F01`, `F02`, etc.):
   - Each case has unique ID (`TC-F01-001`).
   - Cover happy path, validation failures, role-based restrictions, and edge cases.
   - Priority tagged as Critical/High/Medium/Low.
5. **Security test cases** - Access control, auth, data protection, audit completeness.
6. **Execution and reporting notes** - Tagging, evidence, release readiness criteria.

**How to generate**:

- Read scope document and create at least 2-3 test cases per major feature.
- Read security document and create access control / auth / data protection cases.
- Prioritize core workflow cases as Critical.

---

## General Generation Rules

1. **Read before writing** - Always read existing code, models, routes, components, and any existing documentation before generating any document.
2. **Use actual names** - Field names, collection names, component names, route paths must match the codebase exactly.
3. **Cross-reference** - Later documents must reference earlier ones (e.g., database doc references scope features, test cases reference scope IDs).
4. **No placeholder content** - Every section should contain real, project-specific content. If information is missing, ask the user.
5. **Schema as code** - Database schemas should be written as actual ORM/schema code blocks, not prose bullet lists.
6. **Diagrams as Mermaid** - All diagrams should be Mermaid syntax for markdown rendering.
7. **Consistent formatting** - Use `#` for document title, `##` for numbered sections, `###` for subsections. Bold for field names and key terms.
8. **No lint errors** - Ensure markdown passes standard linting (blank lines around headings/lists/fences, trailing newline).

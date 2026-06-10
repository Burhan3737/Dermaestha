# 08 — Security & Compliance Document

| Field            | Value                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Document ID      | `08-SECURITY_COMPLIANCE_DOCUMENT`                                                                       |
| Status           | Canonical                                                                                               |
| Version          | 1.4                                                                                                     |
| Last updated     | 2026-06-05                                                                                              |
| Sources absorbed | `docs/product/PRD.md §3.6; docs/engineering/ARCHITECTURE.md §7, §11; docs/engineering/CONFIG.md §2, §5` |
| Related docs     | 02, 05, 12, 15                                                                                          |

---

## Index

1. [Purpose](#purpose)
2. [OWASP Top-10 considerations](#1-owasp-top-10-considerations)
3. [Data handling policies](#2-data-handling-policies)
4. [Access control strategy](#3-access-control-strategy)
5. [Compliance posture](#4-compliance-posture)
6. [Revision footer](#revision-footer)

---

## Purpose

This document maps the v1 platform's existing, documented security controls onto the OWASP Top-10 framing, describes data handling and retention policies, and states the access-control and compliance posture. Every control cited is grounded in PRD §3.6, ARCH §7/§11, or CONFIG §2/§5. Where the project explicitly defers or omits a control, this document says so plainly.

---

## 1. OWASP Top-10 considerations

### A01 — Broken access control

Authorization is enforced by a **single `requireRole(...)` middleware** (DA6) that gates every authenticated server route. It is not duplicated in route handler bodies and is never enforced only on the frontend; the server is the sole enforcement boundary.

Scoping rules by role (PRD §3.6):

- **Patient** — can read only their own appointments, profile, and prescriptions.
- **Doctor** — can read and act on only the appointments assigned to them; their own profile and availability. Doctor schedule and contact information is accessible only to that doctor and admin.
- **Admin** — can read any appointment, patient, doctor, or audit-log record via A5; admin-only routes (`/api/admin/*`) are unreachable by patient or doctor sessions.

**Existence leak prevention.** Routes that act on resources a caller does not own return `404` rather than `403` to avoid confirming resource existence (PRD §3.6 authorization rules; ARCH §11).

**Deactivated-doctor access (invariant #9).** When admin deactivates a doctor, the `active` flag blocks only public-listing visibility and new-booking eligibility. The `requireRole` middleware still authorizes a deactivated doctor normally for routes scoped to their existing `confirmed` appointments (login, view schedule, join call, submit prescription) — required by the "honored appointments" policy (PRD §3.3 #9; §3.6).

**Admin-only surfaces.** The unified records & audit-log search (A5), health alert feed (A3), and platform settings page (A6) are reachable only by the `admin` role per DA6.

---

### A02 — Cryptographic failures

- **Password hashing:** `argon2id` with `memoryCost 19456 KiB`, `timeCost 2`, `parallelism 1` (OWASP baseline; CONFIG §5). `bcrypt` is noted as acceptable per ARCH §7. Plaintext password storage is explicitly forbidden (PRD §3.6).
- **Transport:** HTTPS everywhere (PRD §3.6; ARCH §11).
- **Session cookies:** HTTP-only, Secure, SameSite=Lax (PRD §3.6; ARCH §7; CONFIG §5). Cookie TTL is 7 days rolling (CONFIG §5).
- **Session secret:** `SESSION_SECRET` is a per-environment secret injected via 12-factor env; it is not committed to source control (`.env.example` is the contract — ARCH §14.5).
- **Money:** stored and transmitted as **integer paisa** (no floating-point representation of currency values — CONFIG §6; ARCH §5).

---

### A03 — Injection

- **SQL injection:** all database access is through **Prisma's parameterized query layer**. No raw SQL strings are constructed from user input.
- **Input validation:** shared **Zod schemas** (`shared/schemas/`) validate all inbound data at the edge, shared between client and server (ARCH §4). Controllers validate before passing to the service layer.

---

### A04 — Insecure design

- **Appointment state machine as single authority:** all appointment transitions go through one writer (the `transition()` function in `server/src/modules/appointment/service.js`). No route or worker transitions state outside this module; the allowed-transition table is the definitive authority (PRD §4.3; ARCH §8).
- **Data integrity invariants:** ten non-negotiable invariants (#1–#10) are enforced at the storage and service layers (PRD §3.3): slot double-booking impossible via partial unique index; atomic booking+payment commit; doctor-identity durability across renames; prescription immutability; price/fee/medicine snapshots at write time; idempotent payment intents and refunds; deactivation that preserves existing appointments.
- **Append-only audit log:** `audit.service.record()` is the single writer; no update or delete path exists for audit entries anywhere in the application (PRD §3.6; ARCH §8).
- **Idempotency keys:** `payments.intent_key` UNIQUE `(patient_user_id, slot_start)` prevents double-payment-intents; `refund_idempotency_key` UNIQUE per appointment prevents double-refund settlements (PRD §3.3 #7/#10; ARCH §5).

---

### A05 — Security misconfiguration

- **12-factor secrets:** all secrets and integration credentials (`DATABASE_URL`, `SESSION_SECRET`, `PAYFAST_*`, `DAILY_API_KEY`, `RESEND_API_KEY`, error-tracking DSN) are environment variables, not committed to code (ARCH §14.5; `.env.example` is the documented contract).
- **PayFast sandbox/live mode:** the payment adapter toggles between sandbox and live mode via an env var, preventing accidental live-mode charges in non-production environments (ARCH §12).
- **Dev provider switches must stay at production-safe defaults:** `PAYMENT_PROVIDER` and `EMAIL_PROVIDER` default to the non-simulating `stub` adapters; the dev mock payment gateway (`mock`) and its `/dev/checkout` routes activate only on explicit opt-in and **must never be set in production** (ADR-22; doc 10 deploy checklist). The mock-IPN HMAC uses `PAYFAST_PASSPHRASE` (or a dev-only fallback constant when unset) — this signing secret is for the dev simulator only; production uses the real PayFast passphrase for genuine IPN verification (doc 15).
- **Dev video switch must stay at production-safe default:** `VIDEO_PROVIDER` defaults to `stub`; the dev mock video provider (`mock`), the `/dev/video/*` participant-join simulator routes, and the `/dev/worker/*` evaluation trigger route must never be active in production (ADR-24; doc 10 deploy checklist; doc 15). `VIDEO_MOCK_SECRET` is a dev-only signing key for mock meeting tokens and must not be set in production.
- **Error-tracking DSN:** the DSN for the error-tracking tool is an env secret; unhandled exceptions are surfaced to the admin alert feed (A3) via the integration rather than leaked in error responses (PRD §3.6 A3; ARCH §14.5).
- **Single-instance worker assumption:** in-process `node-cron` workers and the memory-backed `express-rate-limit` store assume a single running instance. If the app ever scales horizontally, workers must be gated behind a Postgres advisory lock or moved to scheduled tasks, and the rate-limit store must move to a shared backend. This is a documented known limitation (CONFIG §3), not a silent assumption.

---

### A07 — Identification and authentication failures

**Rate limits and lockout (CONFIG §2 — mandated to be specified per PRD §3.6):**

| Surface         | Limit                                   | On breach                                                             |
| --------------- | --------------------------------------- | --------------------------------------------------------------------- |
| Login           | 5 failures / account / 15 min → lockout | `429 ACCOUNT_LOCKED`; audit-logged; sustained abuse → A3              |
| Login (per IP)  | 20 / 15 min                             | `429 RATE_LIMITED`                                                    |
| Sign-up         | 5 / IP / hour                           | `429 RATE_LIMITED`                                                    |
| Forgot-password | 5 / account / hour                      | Enumeration-safe `200`; counted silently                              |
| Payment-intent  | 10 / patient / hour                     | `429 RATE_LIMITED` (protects PayFast API quota beyond idempotency #7) |

Lockout duration: **15 min rolling**. Threshold breaches are written to `audit_log` (`event_type=login_lockout`); sustained abuse is surfaced to the admin alert feed (A3).

**Enumeration safety:** `POST /api/auth/forgot-password` and `POST /api/auth/login` return an identical response shape for known and unknown email addresses, preventing account enumeration (PRD §2.2 P2; ARCH §7).

**Forced first-login password change (DA3):** when a doctor account is created by admin, `must_change_password = true` is set on the record. A middleware gate blocks all non-auth routes for that session until the password is changed. The same flag is set when admin resets a doctor's password (DA5), so the exposure window is limited to the doctor's first post-reset session (PRD DA3; ARCH §7; ARCH §5 module 1).

**Admin bootstrap (DA4):** a single admin account is created via a one-off bootstrap script run on first deploy. No admin self-signup and no admin-creates-admin UI exist in v1. The admin account has no email-based password reset path; the admin password is rotated immediately after the bootstrap run (PRD DA4; PRD §5.2 risk row).

**Password reset token:** patient self-service reset tokens expire in **1 hour** and are single-use (PRD P2; CONFIG §1). They are stored as a SHA-256 hash in `users.reset_token_hash` (the raw token appears only in the email link), with expiry in `users.reset_token_expires_at`; both columns are cleared on use (single-use) and on expiry.

---

### A08 — Software and data integrity failures

**PayFast webhook signature verification:** every inbound `payment.success` or `payment.failed` webhook is signature-verified before any state change is applied. Payloads with a missing, invalid, or expired signature are rejected with a `401` and logged to the admin alert feed (PRD §3.4; PRD §3.6; ARCH §11).

**Refund idempotency:** each appointment carries a single `refund_idempotency_key` (UNIQUE constraint). An automatic retry, the hourly reconciliation path, or an admin's out-of-band gateway action can never produce a second refund settlement for the same appointment (PRD §3.3 #10; ARCH §8).

**Reconciliation safety net:** an hourly worker queries PayFast for unconfirmed payments over the last 24 hours and completes the same atomic commit used by the webhook path, preventing silent missed-webhook data loss (PRD §3.1 flow 2; ARCH §10).

**Prescription immutability:** no `UPDATE` or `DELETE` route or service method exists for prescriptions. Corrections require a new linked prescription; the original is permanently retained (PRD §3.3 #4; ARCH §5).

---

### A09 — Security logging and monitoring failures

**Audit log coverage (PRD §3.6):**

- Appointment state transitions: `confirmed`, `cancelled_refunded`, `cancelled_no_refund`, `doctor_cancelled`, `in_progress`, `completed`, `prescription_issued`, `patient_no_show`, `doctor_no_show`.
- Auth events: successful login, password change, admin-mediated password reset.
- Payment events: intent created, webhook success, webhook failure.
- Refund events: initiated, retried, settled, failed.
- Admin operational actions: doctor edits and deactivate/reactivate (A4), manual email re-trigger (A3/A5), `disputed` flag set/cleared (A5), platform settings changes (A6).
- System actor events: reconciliation resolutions, no-show evaluations, reminder dispatches.

The audit log is **append-only** — no update or delete path is exposed at the application or API layer. Access is admin-only via the filtered query API (A5) (PRD §3.6; ARCH §11).

**Admin alert feed (A3):** the admin dashboard surfaces alert entries for payment-webhook reconciliation mismatches, refund API failures after retry exhaustion, email-send failures after retry exhaustion, appointments in `awaiting_prescription` state for over 12 hours, and unhandled application exceptions sourced from the error-tracking integration (PRD A3).

**Threshold-breach escalation:** sustained failed-login volume (beyond the per-account/per-IP rate-limit triggers) is surfaced to the A3 alert feed (PRD §3.6; ARCH §7; CONFIG §2).

---

### Categories not applicable

**A06 — Vulnerable and outdated components** and **A10 — Server-side request forgery (SSRF)** are not specifically addressed by project-level controls in the source documents. Dependency management and SSRF mitigations are standard Node/Express practices not documented as project-specific requirements and are therefore not described here.

---

## 2. Data handling policies

### 2.1 Data classification

| Category     | Data                                                                                                                                     | Notes                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PII          | Patient full name, email, phone; "booked for" subject name, age, relation; prescription content (medicines, dosage, instructions, notes) | Accessible per §3 access-control rules                                                                                                                                                                    |
| Doctor PII   | Full name, email, phone, PMC number, photo                                                                                               | PMC number and email are immutable post-creation (PRD §3.3 #8)                                                                                                                                            |
| Payment data | Card numbers, wallet credentials                                                                                                         | **Never touches the platform.** Handled exclusively by PayFast's hosted checkout. The platform stores only: gateway-assigned payment reference, gateway-reported fee, refund reference, and refund status |
| Session data | Session cookie + server-side session record in the `session` table                                                                       | HTTP-only, Secure, SameSite=Lax; 7-day rolling TTL                                                                                                                                                        |
| Audit log    | Timestamped event records with actor identity                                                                                            | Admin-only; append-only; no PII beyond actor/target references                                                                                                                                            |

### 2.2 Data minimization

The platform collects only what the PRD requires for its stated functions. Profile photo uploads are constrained to JPEG/PNG/WebP, max 2 MB; SVG and other formats are rejected. Free-text fields in prescriptions are bounded to clinical purpose. No card or wallet data is collected or stored.

### 2.3 Retention

v1 retains all patient PII and prescription content **indefinitely**. There is no in-app account-deletion or data-export flow in v1. This is an acknowledged privacy and regulatory risk documented in PRD §2.3 and §5.2 and deferred to v1.1.

Audit log retention is also indefinite in v1. No log rotation or purge policy is in place.

### 2.4 Transmission

- All data in transit is protected by **HTTPS**.
- Money values are transmitted as **integer paisa** (no floating-point currency representation).
- All timestamps are stored in **UTC** and rendered in `Asia/Karachi` (no DST). Pakistan does not observe DST.

### 2.5 Access and privacy

| Resource                         | Patient               | Doctor                     | Admin                         |
| -------------------------------- | --------------------- | -------------------------- | ----------------------------- |
| Own appointments and PII         | Read/write (own only) | —                          | Read all                      |
| Appointments assigned to them    | —                     | Read/write                 | Read all                      |
| Doctor schedule and contact info | No access             | Own only                   | Read/write all                |
| Audit log                        | No access             | No access                  | Read (filtered query API, A5) |
| Another patient's data           | No access             | No access                  | Read (via A5)                 |
| Prescription content             | Own only (download)   | Assigned appointments only | Read (via A5)                 |

Consent at sign-up: a mandatory acceptance of the Terms of Service and Privacy Policy is recorded on the `users` record as `tos_accepted_at` with timestamp (PRD P2; PRD §3.6).

### 2.6 Backup and recovery

The database is a **Railway-managed PostgreSQL** instance. Railway handles automated backups; their SLA and retention window apply. v1 makes no additional platform-level backup guarantees beyond what the managed provider offers. There is no documented platform-managed restore procedure; recovery from data loss in v1 depends on Railway's backup tooling. This is an acknowledged single-service deployment with no redundancy, acceptable at ~100 consultations/week (PRD §5.2; ARCH §1).

---

## 3. Access control strategy

### 3.1 RBAC model

The platform uses role-based access control (RBAC) with three user-facing roles and one system actor:

| Role      | Description                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patient` | Registered patients; self-managed accounts                                                                                                            |
| `doctor`  | Dermatologists onboarded by admin; credentials managed by admin                                                                                       |
| `admin`   | Internal Dermestha staff; single bootstrap account (DA4)                                                                                              |
| `system`  | The three in-process background workers (reconciliation, notification, appointment-evaluation); no session, identified in audit entries by actor type |

Roles are stored on the `users.role` enum column. A single `requireRole(...)` middleware reads the session's role and rejects any request outside the allowed roles for the route. This is the **only authorization mechanism** — it is not duplicated in route handler bodies and not enforced only on the frontend (PRD DA6; ARCH §7; ARCH §11).

### 3.2 Endpoint authorization by route group

For the full list of routes with per-endpoint role requirements, see **document 05 (API Specification)**. The governing rules are:

- All `/api/admin/*` routes: `admin` only.
- All `/api/doctors/:id/appointments` and prescription-builder routes: `doctor` (own appointments only).
- All `/api/patients/:id/*` and patient dashboard routes: `patient` (own records only) or `admin`.
- Webhook inbound routes (`/api/webhooks/payfast`): no session; verified by the PayFast webhook signature check instead (signed IPN — see doc 14 for the verification specifics).

### 3.3 Special authentication flows

**Admin bootstrap (DA4):** a one-off `prisma/scripts/bootstrap-admin.js` script creates the single admin account on first production deploy. No admin self-signup, no admin-creates-admin path. The admin password is rotated immediately after bootstrap. The admin has no email-based reset path in v1.

**Doctor creation and initial password (DA1):** admin creates a doctor account via A1 and sets an initial password in the same form. The password is shared with the doctor out-of-band. `mustChangePassword` is set to `true` on creation.

**Forced first-login change (DA3):** the `mustChangePassword` middleware gate blocks all non-auth routes for a doctor session until `POST /api/auth/change-password` is called and the flag is cleared. This applies at creation and after any admin-mediated reset.

**Doctor password recovery — admin-mediated (DA5):** doctors have no self-service reset in v1. A doctor who forgets their password contacts admin out-of-band; admin resets via the doctor edit panel, which sets `mustChangePassword = true`. The doctor changes it on next login.

**Deactivated-doctor access (invariant #9):** the `active` flag on the `doctors` table gates only public-listing visibility and new-booking eligibility. A deactivated doctor retains full authentication and can access their existing assigned appointments, join calls, and submit prescriptions. The `requireRole` middleware treats deactivated doctors identically to active doctors for routes scoped to their existing appointments (PRD §3.3 #9; ARCH §11).

### 3.4 Audit traceability

Every security-relevant action is written to `audit_log` by `audit.service.record()` with: `at` (UTC timestamp), `event_type`, `actor_type` (`patient` / `doctor` / `admin` / `system`), `actor_id`, `target_ref`, optional `reason`, and optional `meta` jsonb. The log is append-only; no update or delete path is exposed at any layer.

The admin can query the log via the filtered API backing A5 (filters: appointment ID, user ID/email, event type, actor type, date range). No write or delete API for audit entries is exposed.

### 3.5 Disputed marker

An appointment can be flagged `disputed = true` by admin via the A5 detail view when a chargeback or unresolved patient claim is recorded. This is a **boolean flag on the `appointments` table, not a state transition** — the §4.3 state machine is unchanged and the flag can attach to any terminal state. Setting and clearing the flag are admin-only actions and are themselves audit-logged. No automated behavior is triggered by the flag in v1; it is a support-workflow marker only (PRD §3.6; ARCH §11).

---

## 4. Compliance posture

### 4.1 DRAP/PMDC regulatory compliance

DRAP (Drug Regulatory Authority of Pakistan) and PMDC/PMC regulatory compliance are **explicitly out of scope for v1**. The platform is an MVP for hypothesis validation and is not positioned as a regulated medical service. This is stated in PRD §2.3, §3.6, and §5.2. The risk is flagged as Medium likelihood / High legal impact in the PRD risk table and is carried as a known deferred risk, not mitigated in v1.

### 4.2 Patient consent

Consent to the Terms of Service and Privacy Policy is captured at patient sign-up via a mandatory checkbox (P2). Acceptance is recorded on the `users` record as `tos_accepted_at` with timestamp. The `/legal/terms` and `/legal/privacy` page contents are M4 deliverables (PRD §5.1).

Policy versioning and re-prompting users on policy updates are **deferred to v1.1** (PRD §2.3). v1 records a single acceptance at sign-up only.

### 4.3 Patient data deletion and export

There is no in-app patient account-deletion or data-export flow in v1. All patient PII and prescription content is retained indefinitely. This is an acknowledged privacy and operational risk; it is documented as a v1.1 deliverable, and the client is informed via the Privacy Policy text (PRD §2.3; §3.6; §5.2).

### 4.4 Accessibility (WCAG)

No WCAG conformance target or accessibility acceptance criteria is set for v1. The PRD acknowledges accessibility risk for a low-tech-literacy, mobile-first audience and notes a WCAG 2.1 AA baseline for the core booking/payment/join flow as a candidate fast-follow after launch hypothesis validation (PRD §2.3). The patient surface targets mobile-browser usability on Chrome/Safari over 3G as its baseline for v1.

---

## Revision footer

| Date       | Change           | Why                                                               |
| ---------- | ---------------- | ----------------------------------------------------------------- |
| 2026-06-01 | Initial creation | Faithful re-presentation of PRD §3.6 + ARCH §7/§11 + CONFIG §2/§5 |
| 2026-06-03 | Noted reset token hashed + single-use on `users` (A07) | Slice A reset-token storage decision |
| 2026-06-04 | Noted dev provider switches must stay at safe defaults in prod; mock-IPN passphrase is dev-only | Slice C dev payment simulation (ADR-22) |
| 2026-06-05 | Added dev video switch (`VIDEO_PROVIDER=mock`) + `/dev/video/*`/`/dev/worker/*` + `VIDEO_MOCK_SECRET` must-not-be-prod note (§A05) | Slice D (F05 video & lifecycle) |
| 2026-06-11 | Re-pointed the state-machine single-authority ref to the `transition()` writer in `modules/appointment/service.js` (merged) | Folder-structure restructure (ADR-26); behavior unchanged |

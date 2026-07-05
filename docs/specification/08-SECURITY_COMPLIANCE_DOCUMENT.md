# 08 — Security & Compliance Document

| Field            | Value                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Document ID      | `08-SECURITY_COMPLIANCE_DOCUMENT`                                                                       |
| Status           | Canonical                                                                                               |
| Version          | 1.12                                                                                                    |
| Last updated     | 2026-07-05                                                                                              |
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

Route-level authorization is enforced exclusively by the **`requireRole(...)` middleware** (DA6), which gates every authenticated server route. Supplemental **parameter-level** authorization (e.g. an admin-only `includeInactive` query param on an otherwise role-shared route) may be performed in the handler body, where the parameter itself — not the route — is the protected surface. Authorization is never enforced only on the frontend; the server is the sole enforcement boundary.

Scoping rules by role (PRD §3.6):

- **Patient** — can read only their own appointments, profile, and prescriptions.
- **Doctor** — can read and act on only the appointments assigned to them; their own profile and availability. Doctor schedule and contact information is accessible only to that doctor and admin.
- **Admin** — can read any appointment, patient, doctor, or audit-log record via A5; admin-only routes (`/api/admin/*`) are unreachable by patient or doctor sessions.
- **Superadmin** — this cycle a functional clone of `admin`: admitted on every `admin`-gated and admin-shared route via explicit per-route dual-listing, and nowhere else new (not on patient- or doctor-only routes). Audited as `actor_type='admin'` by coercion (§3.4; ADR-47).

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
- **Data integrity invariants:** the non-negotiable data-integrity invariants are enforced at the storage and service layers (PRD §3.3): slot double-booking impossible via the `uniq_active_slot` partial unique index (covering `pending`/`confirmed`); doctor-identity durability across renames; prescription immutability; price/fee/medicine snapshots at write time (`feeAtBooking` snapshotted at lock); deactivation that preserves existing appointments.
- **Append-only audit log:** `audit.service.record()` is the single writer; no update or delete path exists for audit entries anywhere in the application (PRD §3.6; ARCH §8).

---

### A05 — Security misconfiguration

- **12-factor secrets:** all secrets and integration credentials (`DATABASE_URL`, `SESSION_SECRET`, `DAILY_API_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`) are environment variables, not committed to code (ARCH §14.5; `.env.example` is the documented contract).
- **Dev provider switch must stay at the production-safe default:** `EMAIL_PROVIDER` defaults to the non-simulating `stub` adapter; the dev simulator adapter activates only on explicit opt-in and **must never be set in production** (doc 10 deploy checklist). Payment is an offline bank transfer with no gateway, so there is no payment-provider switch, mock checkout, or IPN signing secret in v1 (ADR-43).
- **Dev video switch must stay at production-safe default:** `VIDEO_PROVIDER` defaults to `stub`; the dev mock video provider (`mock`) must never be active in production (doc 10 deploy checklist; doc 15). `VIDEO_MOCK_SECRET` is a dev-only signing key for mock meeting tokens and must not be set in production. (Daily runs on the free tier — room + token only, no participant webhook; ADR-43.)
- **Dev worker trigger route mounts only in development:** the single on-demand worker trigger route (`POST /dev/worker/notifications`) is conditionally mounted at startup only when `NODE_ENV === 'development'` and is never registered in production (doc 10 deploy checklist; doc 15).
- **Sentry error tracking (DSN-gated, PII-scrubbed):** error tracking is Sentry (`@sentry/node`), initialized at boot only when `SENTRY_DSN` is set — with no DSN it is a logging no-op, so non-production environments never egress. Sentry is configured with `sendDefaultPii: false` and a `beforeSend` hook that **scrubs PII before any event leaves the process**: it deletes the request body (`request.data`), cookies, the `Authorization` and `Cookie` headers, and the entire `user` object (emails / patient identifiers). **External error-egress posture:** only scrubbed exception metadata reaches Sentry; request bodies, cookies, auth tokens, and user identity never cross the boundary. The DSN is an env secret. This external sink is separate from A3 — A3 exception alerts come from `system.unhandled_exception` audit rows (see §A09). Unhandled exceptions are never leaked in error responses (PRD §3.6 A3; ARCH §14.5).
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
| Payment-reference submit | 10 / patient / hour            | `429 RATE_LIMITED`                                                   |
| Admin writes    | 60 / 15 min (keyed by `session.userId`) | `429 RATE_LIMITED` (applied to admin doctor writes, settings PUT, email resend, payment accept/reject) |

Lockout duration: **15 min rolling**. Threshold breaches are written to `audit_log` (`event_type=login_lockout`); sustained abuse is surfaced to the admin alert feed (A3).

**Enumeration safety:** `POST /api/auth/forgot-password` and `POST /api/auth/login` return an identical response shape for known and unknown email addresses, preventing account enumeration (PRD §2.2 P2; ARCH §7). On an unknown email, the forgot-password path performs a dummy token-generate + hash operation (mirroring the login dummy-hash discipline) before returning the uniform response, so response timing does not betray whether an account exists. The reset-email send is fire-and-forget; the HTTP response never reflects whether a send occurred (G4 timing equalization).

**Forced first-login password change (DA3):** when a doctor account is created by admin, `must_change_password = true` is set on the record. A middleware gate blocks all non-auth routes for that session until the password is changed. The same flag is set when admin resets a doctor's password (DA5), so the exposure window is limited to the doctor's first post-reset session (PRD DA3; ARCH §7; ARCH §5 module 1).

**Known gap (DA5):** an admin password reset sets the DB `mustChangePassword = true` flag but does **not** invalidate the doctor's existing sessions. A concurrently-active doctor session retains its old in-session `mustChangePassword = false` value for up to `SESSION_TTL_DAYS` (default 7 days), so the forced-change gate only takes effect on that session's next re-authentication. Session revocation on admin reset is deferred to v1.1.

**Admin bootstrap (DA4):** a single admin account is created via a one-off bootstrap script run on first deploy. No admin self-signup and no admin-creates-admin UI exist in v1. The admin account has no email-based password reset path; the admin password is rotated immediately after the bootstrap run (PRD DA4; PRD §5.2 risk row).

**Password reset token:** patient self-service reset tokens expire in **1 hour** and are single-use (PRD P2; CONFIG §1). They are stored as a SHA-256 hash in `users.reset_token_hash` (the raw token appears only in the email link), with expiry in `users.reset_token_expires_at`; both columns are cleared on use (single-use) and on expiry.

---

### A08 — Software and data integrity failures

**Manual payment confirmation (no gateway, no webhook):** payment is an offline bank transfer the admin verifies by hand. There is no online gateway, no inbound payment or video webhook, and no webhook signature verification anywhere — `routes.js` mounts no webhook routes. The patient submits a free-text bank transaction reference (`POST /api/appointments/:id/pay` sets `paymentReference` + `paymentSubmittedAt`, appointment stays `pending`); the admin matches it against the bank account and either accepts (`pending → confirmed`) or rejects (`pending → cancelled`). No refunds, disputes, or chargebacks exist, so there is no refund-idempotency or reconciliation machinery (ADR-43).

**Prescription immutability:** no `UPDATE` or `DELETE` route or service method exists for prescriptions. Corrections require a new linked prescription; the original is permanently retained (PRD §3.3 #4; ARCH §5).

---

### A09 — Security logging and monitoring failures

**Audit log coverage (PRD §3.6):**

- Appointment state transitions (3-state machine): `pending` (booking), `confirmed` (admin accept), `cancelled` (admin reject, patient/doctor cancel). Prescriptions are child-record writes that do not change appointment state.
- Auth events: successful login, password change, admin-mediated password reset.
- Payment events: bank-reference submitted (`payment.submitted`).
- Admin operational actions: doctor edits and deactivate/reactivate (A4), manual email re-trigger (A3/A5), payment accept/reject (A5), platform settings changes (A6).
- System actor events: notification/reminder dispatches.

The audit log is **append-only** — no update or delete path is exposed at the application or API layer. Access is admin-only via the filtered query API (A5) (PRD §3.6; ARCH §11).

**Admin alert feed (A3):** the admin dashboard surfaces alert entries for patient bank-reference submissions awaiting verification (`payment.submitted`), email-send failures after retry exhaustion, and unhandled application exceptions. The A3 exception alerts are sourced from `system.unhandled_exception` audit rows written by the global error handler (no PII, no stack, message truncated to ≤500 chars; written fire-and-forget so an audit-write failure can never block the 500 response). The `captureException(...)` → Sentry (`SENTRY_DSN`, PII-scrubbed; §A05) call is a separate parallel path and does **not** feed A3 (PRD A3).

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
| Payment data (low sensitivity) | Patient-typed bank transaction reference (`paymentReference`) + `paymentSubmittedAt` on the appointment; admin-set bank details in Settings | **No card, wallet, or gateway data exists.** Payment is an offline bank transfer the admin verifies by hand (ADR-43). The only payment data stored is a free-text bank reference the patient types — no hosted checkout, gateway callbacks, fees, or refund records |
| Session data | Session cookie + server-side session record in the `session` table                                                                       | HTTP-only, Secure, SameSite=Lax; 7-day rolling TTL                                                                                                                                                        |
| Audit log    | Timestamped event records with actor identity                                                                                            | Admin-only; append-only; no PII beyond actor/target references                                                                                                                                            |
| Notification outbox | `recipient_email` snapshot and `vars` JSON snapshot stored in `notification_jobs` at enqueue time | No PHI beyond what `users`/`appointments` already hold; rows are accessible only by the in-process dispatch worker — no external read path |

### 2.2 Data minimization

The platform collects only what the PRD requires for its stated functions. Free-text fields in prescriptions are bounded to clinical purpose. No card or wallet data is collected or stored.

**Profile photo uploads** are constrained to JPEG/PNG/WebP enforced by a **magic-byte sniff** of the file buffer — the client-supplied MIME type and filename extension are not trusted. SVG is explicitly rejected as an XSS vector. Filenames are **server-generated** as `<doctorId>.<ext>` (no client-controlled path segment, so no traversal); a stale photo stored under a previous extension is `unlink`ed when the extension changes, so no orphaned file remains publicly served. The 2 MB `multer` size cap returns `400 INVALID_FILE` on breach.

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

The platform uses role-based access control (RBAC) with four user-facing roles and one system actor:

| Role         | Description                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patient`    | Registered patients; self-managed accounts                                                                                                            |
| `doctor`     | Dermatologists onboarded by admin; credentials managed by admin                                                                                       |
| `admin`      | Internal Dermestha staff; bootstrap account (DA4)                                                                                                     |
| `superadmin` | Internal Dermestha staff, elevated; bootstrap account (DA4). This cycle a **functional clone of `admin`** — admitted wherever `admin` is and nowhere else new (ADR-47). Distinct role kept so `admin` can be restricted per-route in a future cycle |
| `system`     | The in-process notification-dispatch worker (the single remaining cron job; reconciliation and appointment-evaluation workers were removed in the manual-payment pivot — ADR-43); no session, identified in audit entries by actor type |

Roles are stored on the `users.role` enum column. A single `requireRole(...)` middleware reads the session's role and rejects any request outside the allowed roles for the route. This is the **exclusive route-level authorization mechanism** and is never enforced only on the frontend. Supplemental **parameter-level** authorization may additionally be performed in a handler body where the protected surface is a specific query param rather than the route itself — for example, the admin-only `includeInactive` flag on the otherwise-shared doctor/medicine list routes gates the param with an in-handler role check (PRD DA6; ARCH §7; ARCH §11).

**`superadmin` admission (ADR-47).** There is **no central role hierarchy** in `requireRole`; `superadmin` is admitted by **explicit per-route dual-listing** — every `admin`-gated `requireRole(...)` names both `admin` and `superadmin`, and the four in-body `admin` checks (doctor & medicine `includeInactive` gates; appointment & prescription service visibility) admit it too. This makes `superadmin` ⊇ `admin` this cycle without granting any patient- or doctor-only route. A `superadmin`'s actions are recorded in the audit log as **`actor_type='admin'`** by deliberate coercion (auth login/reset/change coerce `superadmin`→`admin`; admin-action writes already hardcode `admin`); the `AuditActorType` enum is unchanged (`patient`/`doctor`/`admin`/`system`), so `superadmin` is not a distinct audit actor. A role-accurate alternative (adding `superadmin` to `AuditActorType`) was considered and deferred (ADR-47).

### 3.2 Endpoint authorization by route group

For the full list of routes with per-endpoint role requirements, see **document 05 (API Specification)**. The governing rules are:

- All `/api/admin/*` routes: `admin` only.
- All `/api/doctors/:id/appointments` and prescription-builder routes: `doctor` (own appointments only).
- All `/api/patients/:id/*` and patient dashboard routes: `patient` (own records only) or `admin`.
- Admin payment review: `POST /api/admin/appointments/:id/accept` and `.../reject` (`admin` only) confirm or cancel a `pending` appointment after the admin matches the submitted bank reference; there are no webhook inbound routes in v1 (`routes.js` mounts none — ADR-43).

### 3.3 Special authentication flows

**Admin bootstrap (DA4):** a one-off `prisma/scripts/bootstrap-admin.js` script creates the single admin account on first production deploy. No admin self-signup, no admin-creates-admin path. The admin password is rotated immediately after bootstrap. The admin has no email-based reset path in v1.

**Doctor creation and initial password (DA1):** admin creates a doctor account via A1 and sets an initial password in the same form. The password is shared with the doctor out-of-band. `mustChangePassword` is set to `true` on creation.

**Forced first-login change (DA3):** the `mustChangePassword` middleware gate blocks all non-auth routes for a doctor session until `POST /api/auth/change-password` is called and the flag is cleared. This applies at creation and after any admin-mediated reset.

**Doctor password recovery — admin-mediated (DA5):** doctors have no self-service reset in v1. A doctor who forgets their password contacts admin out-of-band; admin resets via the doctor edit panel, which sets `mustChangePassword = true`. The doctor changes it on next login.

**Deactivated-doctor access (invariant #9):** the `active` flag on the `doctors` table gates only public-listing visibility and new-booking eligibility. A deactivated doctor retains full authentication and can access their existing assigned appointments, join calls, and submit prescriptions. The `requireRole` middleware treats deactivated doctors identically to active doctors for routes scoped to their existing appointments (PRD §3.3 #9; ARCH §11).

### 3.4 Audit traceability

Every security-relevant action is written to `audit_log` by `audit.service.record()` with: `at` (UTC timestamp), `event_type`, `actor_type` (`patient` / `doctor` / `admin` / `system`), `actor_id`, `target_ref`, optional `reason`, and optional `meta` jsonb. The log is append-only; no update or delete path is exposed at any layer. A `superadmin`'s actions are recorded as `actor_type='admin'` by deliberate coercion — `superadmin` is not a distinct `AuditActorType` value (§3.1; ADR-47).

The admin can query the log via the filtered API backing A5 (filters: appointment ID, user ID/email, event type, actor type, date range). No write or delete API for audit entries is exposed.

---

## 4. Compliance posture

### 4.1 DRAP/PMDC regulatory compliance

DRAP (Drug Regulatory Authority of Pakistan) and PMDC/PMC regulatory compliance are **explicitly out of scope for v1**. The platform is an MVP for hypothesis validation and is not positioned as a regulated medical service. This is stated in PRD §2.3, §3.6, and §5.2. The risk is flagged as Medium likelihood / High legal impact in the PRD risk table and is carried as a known deferred risk, not mitigated in v1.

### 4.2 Patient consent

Consent to the Terms of Service and Privacy Policy is captured at patient sign-up via a mandatory checkbox (P2). Acceptance is recorded on the `users` record as `tos_accepted_at` with timestamp. The `/legal/terms` and `/legal/privacy` pages are built (Slice H · S4) as public/unauthenticated, banner-marked **DRAFT** content pending legal review (ADR-35); the **Privacy page cross-references this document's §2 data-handling policies** for how patient and health information is classified, minimized, retained, and access-controlled. Final lawyer-reviewed copy replacing the DRAFT is a pre-launch gate (doc 13).

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
| 2026-06-11 | Added G4 forgot-password timing equalization (§A07); notification outbox data-handling row (§2.1); dev worker trigger routes conditional-mount note (§A05) | Slice E hardening + outbox data-handling; schema/config cascade |
| 2026-06-13 | Relaxed A01/§3.1 RBAC wording to allow supplemental param-level authz (`includeInactive`); corrected A09 A3-exception source to `system.unhandled_exception` audit rows (not the DSN); added Admin-writes rate-limit row (§A07); expanded photo-upload control (§2.2 magic-byte sniff/SVG/server-named/unlink/2MB); added DA5 session-revocation known gap (§A07) | Slice G as-built sweep |
| 2026-06-13 | A08: noted PayFast **Pakistan** has no refund/status-query API → admin out-of-band record-refund is the primary refund path (idempotency-key-safe) and reconciliation surfaces stuck payments for manual review (`payment.manual_review_required`; ADR-32) | Slice H · S1 (PayFast Pakistan adapter) |
| 2026-06-14 | A08: added Daily webhook signature-verification control — `POST /api/webhooks/daily` is HMAC-SHA256 verified over the raw body (base64-decoded `DAILY_WEBHOOK_SECRET`, constant-time); bad signature → `401` + `video.webhook_rejected` audit (doc 14 §3; ADR-33) | Slice H · S2 (Daily.co video adapter) |
| 2026-06-14 | §4.2: noted the public/unauthenticated `/legal/terms`,`/legal/privacy` pages are built as banner-marked DRAFT pending legal review, and that the Privacy page cross-references this document's §2 data-handling policies (final copy = pre-launch gate; ADR-35) | Slice H · S4 (public surface — landing + legal) |
| 2026-06-14 | A05: documented the Sentry error-tracking control — DSN-gated (`SENTRY_DSN`), `sendDefaultPii:false`, `beforeSend` scrubs request bodies/cookies/auth headers/user identity before egress + external error-egress posture; renamed the generic "error-tracking DSN" secret to `SENTRY_DSN` in the §A05 secrets list and the §A09 `captureException` note (ADR-36) | Slice H · S6 (launch foundation + hardening) |
| 2026-06-28 | Manual-payment pivot sync: reclassified payment data as low-sensitivity free-text bank reference (§2.1); removed the PayFast webhook + Daily webhook signature-verification, refund-idempotency, and reconciliation controls (A04/A08), the PayFast adapter + IPN/mock-payment controls (A05), the `disputed` marker (§3.5) and the payfast webhook route (§3.2); re-scoped the payment rate-limit row and audit/alert coverage (A07/A09); dropped `PAYFAST_*` from the secrets list | Manual-payment pivot — as-built sync (ADR-43) |
| 2026-07-05 | Added `superadmin` to the §3.1 RBAC role table (internal staff, elevated; this cycle a functional admin clone) + a §3.1 admission note (explicit per-route dual-listing, no central hierarchy; in-body admin checks also admit it; actions audited as `actor_type='admin'` by coercion, `AuditActorType` unchanged); enumerated superadmin in the A01 scoping list (§1); noted the audit coercion in §3.4 (ADR-47) | superadmin role |

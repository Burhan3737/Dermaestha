# Slice F — Prescriptions (M3) — Design

| Field      | Value                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date       | 2026-06-11                                                                                                                                             |
| Status     | Approved (brainstorming output); plan + build pending                                                                                                  |
| Slice      | F of 8 (second of the four v1-completion slices E→F→G→H)                                                                                               |
| Depends on | Slice E — merged to `main` (169 server + 41 client tests green)                                                                                        |
| Canon refs | F08, F11, doc 02 §3.3 #3/#4/#5, §4.3 (`completed→prescription_issued`), `awaiting_prescription` derived condition, policy #9, edge #29; doc 04 (Prescription/PrescriptionItem/Medicine models, notification_jobs); doc 05 §2/§5; doc 06 screens P-09/P-13/D-02/D-05 + medicine-listbox interaction; doc 14 §5 (`prescription_ready` vars) |

---

## 1. Scope & goals

**Goal:** M3 complete against the spec — a doctor can issue an immutable, itemised, price-snapshotted prescription after a completed consultation; the patient sees it within 60 seconds, is emailed, and can download a client-rendered PDF indefinitely.

**In scope**

1. **Prescription service + routes (F08.02):** immutable submit (`POST /api/appointments/:id/prescriptions`) with doctor/patient/price snapshots, `completed→prescription_issued` transition, in-transaction `prescription_ready` outbox enqueue; chronological read (`GET /api/appointments/:id/prescriptions`).
2. **Medicine service + routes (F11 backend):** doctor/admin searchable read (`GET /api/medicines`), admin create/edit/deactivate (`POST /api/admin/medicines`, `PATCH /api/admin/medicines/:id`). The admin **UI** screen (A-02) stays in Slice G.
3. **Outbox dedupe-key migration:** `notification_jobs.dedupe_key` + widened unique `(appointment_id, type, dedupe_key)` so every prescription — including policy-#9 corrections — sends its own `prescription_ready` email (the relaxation Slice E's schema comment anticipated).
4. **Client views:** P-09 patient past appointments (state-label mapping per F08.01), P-13 prescription view + PDF download, D-05 prescription builder; D-02 gains the "Write prescription" action and the `awaiting_prescription` (>12 h) badge.
5. **Client PDF boundary:** `renderPrescriptionPdf(json)` over lazily-imported **pdf-lib** — client-side only; the server never produces PDF bytes (server-side PDF is v1.2+).

**Out of scope (later slices)**

- Admin screens A-01…A-05 incl. the medicine-catalogue UI (Slice G); the F12/A3 `awaiting_prescription` admin alert (Slice G — this slice ships only the doctor-facing D-02 badge).
- Real PayFast/Daily.co adapters, analytics, landing/legal (Slice H).
- Final email marketing copy (M4); PDF visual polish beyond a clean itemised layout (template copy is vars-contract-first, doc 14 §5).
- Medicine Ordering Module (v1.2+, separate scope per doc 02 §6).

**Success criteria**

1. Existing 210 tests stay green; every new behavior lands test-first.
2. Submitting a prescription creates the prescription + items + state transition + outbox job **atomically**; a second (correction) prescription creates a second row + second email and leaves state untouched.
3. Catalogue rename/reprice/deactivate after issue never changes an existing prescription's display or total (snapshot proof in an integration test).
4. No update/delete path for prescriptions exists at any layer (immutability by absence — same convention as the audit log).
5. The PDF downloads from stored JSON in the browser; pdf-lib never enters the main bundle (dynamic import).

---

## 2. Architecture & components

```
submit path (one $transaction — the same outbox guarantee as Slice E)
  POST /api/appointments/:id/prescriptions  (doctor-owner; state ∈ {completed, prescription_issued})
    ├─ resolve snapshots server-side:
    │    items: catalogue medicineId → {name, unitPrice} copied; free-text → price null
    │    doctorSnapshot {name, pmcNumber, specialization}; patientIdSnapshot (who-for, P8)
    ├─ tx: prescription.create (+items)
    ├─ tx: transition(completed → prescription_issued)        [only if currently completed]
    └─ tx: notification.enqueue(prescription_ready, dedupeKey = prescription.id)
            └ dispatched by the existing Slice E minute-cron worker (no worker changes)

read path
  GET /api/appointments/:id/prescriptions  (patient-owner | doctor-owner | admin)
    └─ chronological list + items  ──►  P-13 renders; Download → renderPrescriptionPdf(json)
                                          └ client/src/lib/pdf/ — dynamic import('pdf-lib') → Uint8Array → Blob download

catalogue
  GET /api/medicines?search=       (doctor/admin; active-only)  ──► D-05 autocomplete
  POST /api/admin/medicines        (admin)                      ──► no UI until Slice G
  PATCH /api/admin/medicines/:id   (admin; edit + isActive)
```

New server modules: `server/src/modules/prescription/`, `server/src/modules/medicine/` (feature-first, ADR-26). New client modules: `client/src/modules/prescription/` (P-13 view, D-05 builder), `client/src/lib/pdf/`. `appointmentState.transition` remains the only `Appointment.state` writer; its `LEGAL` map gains exactly one entry: `completed: {prescription_issued}`.

---

## 3. Data model & migration

No new tables — `prescriptions`, `prescription_items`, `medicines` already exist (doc 04) with snapshot semantics built in (`doctorSnapshot`/`patientIdSnapshot` JSON; `PrescriptionItem.price Int?` where null = "not priced").

**One migration — `notification_jobs`:**

```prisma
  dedupeKey String @default("") @map("dedupe_key")
  @@unique([appointmentId, type, dedupeKey])   // was @@unique([appointmentId, type])
```

Existing rows/callers keep `""` (single-job-per-type semantics unchanged for all Slice E types). Prescription jobs pass `dedupeKey = prescription.id`: exactly-once per prescription, repeatable per appointment. `notification.enqueue()` gains an optional `dedupeKey = ''` parameter; its upsert `where` switches to the new composite. No dispatch-worker change — `prescription_ready` is not a reminder type, so the invalidation re-check does not apply.

---

## 4. API surface (doc 05 additions)

| Method | Path                                      | Auth                                 | Behavior                                                                                                  |
| ------ | ----------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/api/medicines?search=`                  | doctor or admin                      | Active-only, name/genericName substring search                                                            |
| POST   | `/api/admin/medicines`                    | admin                                | Create: name, genericName?, dosageForms[] (≥1), unitPrice (PKR paisa int > 0)                              |
| PATCH  | `/api/admin/medicines/:id`                | admin                                | Edit any create field + `isActive`; no DELETE route (Deactivate Rule)                                     |
| POST   | `/api/appointments/:id/prescriptions`     | doctor-owner                         | Immutable submit (see §5); 404 no-leak for non-owner; 409 for wrong state                                  |
| GET    | `/api/appointments/:id/prescriptions`     | patient-owner, doctor-owner, admin   | Chronological list with items — the exact JSON the PDF renders                                            |

**Existing endpoint additions (`listForRole`):** the patient branch gains `scope=history` (terminal states; it currently returns only upcoming), and rows for both roles gain `hasPrescription: boolean` (Prisma `_count` of linked prescriptions > 0). Zod DTOs: `shared/schemas/medicine/`, `shared/schemas/prescription/`.

---

## 5. Backend services

**`medicine/service.js`** — `list({search})` (active-only), `create(data)`, `update(id, data)`. Admin CRUD writes an audit row (`medicine.created` / `medicine.updated`) per the doc 08 admin-mutation convention.

**`prescription/service.js`** — `submit({appointmentId, doctorUserId, items, notes, followUpDate})`:

1. Load appointment; verify the session doctor owns it (404 no-leak) and `state ∈ {completed, prescription_issued}` (else 409 `INVALID_STATE`).
2. Resolve item snapshots **server-side** (client-sent prices are never trusted): `medicineId` present → copy `name` + `unitPrice` from the Medicine row (400 if id unknown; a deactivated medicine still resolves — deactivation only hides it from the dropdown, and a snapshot of a real medicine remains valid); free-text → `medicineName` as sent, `price: null`.
3. Build `doctorSnapshot` (fullName, pmcNumber, specialization) and `patientIdSnapshot` (forSelf → account-holder name; else captured name/age/relation) from current doctor + appointment rows (§3.3 #3, Identity Snapshot Rule).
4. `$transaction`: create prescription + items → `transition(completed→prescription_issued)` *only when* state is `completed` (corrections skip it) → `enqueue(prescription_ready, dedupeKey: prescription.id, vars: {patientName, doctorName, prescriptionUrl})` per doc 14 §5.

`listByAppointment({appointmentId, requester})` — owner/admin check, then `issuedAt asc` with items. **No update/delete functions exist in this module — immutability is enforced by absence (§3.3 #4).**

---

## 6. Frontend

**P-09 — Past appointments** (`client/src/modules/appointment/views/Past/`): the patient dashboard becomes the D-02-style two-tab chrome (Upcoming | Past) wrapping the existing `Upcoming` view. Past rows show patient-facing labels via a pure `stateLabel()` helper, exactly per F08.01: `completed`/`prescription_issued` → "Completed", `patient_no_show` → "Missed (no-show)", `doctor_no_show`/`doctor_cancelled` → "Cancelled by doctor — refund issued", `cancelled_refunded` → "Cancelled — refunded", `cancelled_no_refund` → "Cancelled — no refund". `prescription_issued` rows show **Download Prescription** → navigates to P-13.

**P-13 — Prescription view + PDF** (`client/src/modules/prescription/views/PrescriptionView/`): fetches the list endpoint; renders each prescription chronologically (corrections all visible, each separately downloadable) — patient-ID header, items with price or "not priced", computed total, "N item(s) not priced" note, notes/follow-up, issuing-doctor block from `doctorSnapshot`. Download → PDF boundary → Blob download named `prescription-<issuedAt>.pdf`.

**PDF boundary** (`client/src/lib/pdf/renderPrescriptionPdf.js`): `async (prescriptionJson) => Uint8Array`; performs `await import('pdf-lib')` internally so the ~250 KB chunk loads only on demand (3G target). Single replaceable file = the future server-side seam (§3.5 Client-Render Rule). Layout: deterministic single-document itemised sheet; marketing/visual polish deferred to M4.

**D-05 — Prescription builder** (`client/src/modules/prescription/views/PrescriptionBuilder/`): entered from D-02 rows in `completed`/`prescription_issued`. Read-only patient-ID header (auto-pulled, never typed — P8). Medicine rows: keyboard-navigable autocomplete listbox (doc 06 "Select / dropdown": custom listbox mandated for medicine search on D-05) over `GET /api/medicines` with free-text fallback; required dosage/duration/instructions per row; running total + "not priced" flags (Running-Total Rule); optional notes + follow-up date. Submit → immutability confirmation step (doc 06 D-05 interaction) → POST. Previously issued prescriptions render read-only below the form (corrections context, policy #9).

**D-02 (surgical edits to `DoctorToday.jsx`):** rows in `completed`/`prescription_issued` get "Write prescription"; rows `completed` + `!hasPrescription` + >12 h past slot end get the "Awaiting prescription" badge (derived client-side; the F12/A3 admin alert stays Slice G).

---

## 7. Error handling

Standard `AppError` envelope. Notable cases: non-owner (doctor on submit, patient/doctor on read) → 404 no-leak; wrong state on submit → 409 (`INVALID_STATE` from the service guard; the state machine's own `INVALID_TRANSITION` 409 backstops first-issue races); empty items / missing per-item required fields → Zod 400; unknown `medicineId` → 400 `VALIDATION` (only reachable by race or hand-crafted request); email enqueue is inside the tx so it cannot half-fail; email **send** failure is the dispatch worker's retry/backoff problem (Slice E machinery, unchanged). Submit never blocks on email.

---

## 8. Testing

Two-tier pattern as established.

**Unit (mocked Prisma, module-local `test.js`):** medicine — search filters active-only, CRUD guards, audit write; prescription — snapshot resolution (catalogue price copied, free-text null, client price ignored, unknown id 400), transition called only from `completed`, corrections enqueue with distinct `dedupeKey`, owner/state guards; notification — `enqueue` default `dedupeKey:''` keeps every existing call site's upsert idempotent; state machine — `completed→prescription_issued` legal, `prescription_issued→*` illegal.

**Integration (real DB, `server/src/test/prescription.integration.test.js`):** drive an appointment to `completed` via existing helpers → submit → assert prescription + items + state + outbox job (vars per doc 14 §5); second submit → second prescription + second job, state unchanged; reprice + rename + deactivate the medicine → stored snapshot and total unchanged; non-owner doctor 404; replayed identical submit creates a *new* prescription (immutable corrections, not idempotent-by-design — doc 02 policy #9).

**Client (Vitest/jsdom):** `stateLabel()` mapping table; P-09 button visibility per state; D-05 running total + "not priced" + free-text row + immutability confirm; P-13 chronological render; PDF boundary returns bytes beginning `%PDF` (pdf-lib runs in Node).

---

## 9. Canon-doc impact (gated — list for approval before editing, per CLAUDE.md)

| Doc | Change |
| --- | ------ |
| 04  | `notification_jobs`: `dedupe_key` column + widened unique |
| 05  | 5 new endpoints; patient `scope=history`; `hasPrescription` field; `completed→prescription_issued` in the transition table (if not present) |
| 12  | New F08/F11 test cases |
| 13  | M3 status sweep (modules 10/11, F08/F11, views P-09/P-13/D-05, M3 checklist — incl. correcting its stale screen IDs to doc 06 canon: P-09/P-13/D-05, not "P-10/P-11/D-04") |
| 14  | §5 `prescription_ready` trigger column: "every prescription submit" (not just the transition); note the dedupe-key semantics |
| 08  | Admin medicine routes in the access-control matrix (if it enumerates routes) |
| 11  | ADR if deemed decision-worthy: outbox dedupe-key relaxation (small; may fold into ADR-27's record instead) |

---

## 10. Slice roadmap reminder

E (done) → **F (this)** → G (admin panel: A-01…A-05 screens, alert feed reading Slice E/F audit rows, settings) → H (real PayFast/Daily.co adapters, analytics, landing/legal, E2E QA).

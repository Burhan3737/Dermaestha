# Slice D — Video & Appointment Lifecycle — Design

| Field        | Value                                                       |
| ------------ | ----------------------------------------------------------- |
| Date         | 2026-06-04                                                  |
| Status       | Approved (brainstorming output); plan + build pending       |
| Slice        | D of 4 (M1+M2 patient journey)                              |
| Depends on   | Slice A (auth), Slice B (discovery/availability), Slice C (booking/payment) — all merged to `main` |
| Canon refs   | F05, doc 05 §5 (state machine), doc 14 §1/§3 (VideoProvider/Daily), doc 15 §3 (worker cadence), doc 06 (P-11/P-12/D-02/D-06), ADR-08/10/12/22/23 |

---

## 1. Scope & goals

**In scope**

- **F05 video consultation:** `daily.mock` VideoProvider, `GET /api/appointments/:id/video-token`, patient P-11 (waiting room) + P-12 (video) and the doctor D-04 video screen.
- **Lifecycle transitions:** `confirmed→in_progress`, `in_progress→completed`, and no-show resolution `in_progress→{patient_no_show, doctor_no_show}` with doctor-absence precedence (ADR-12) and the missing-participant-data fallback — all extending `appointmentState.service` (the single transition writer from Slice C).
- **Appointment-evaluation worker:** the `system`-actor component that drives the non-payment transitions (doc 02 §3, doc 15 §3). First in-process `node-cron` worker (ADR-08).
- **Doctor UI:** D-02 today view + Join Call; D-06 doctor-cancel modal (backend already supports the doctor role).

**Out of scope (deferred, user decision)**

- F07 reminders + the notification worker.
- F04.03 reconciliation worker (edge #6/#6a).
- F08 prescriptions (`completed→prescription_issued`).
- Real Daily.co client SDK + REST adapter + webhook signature verification.
- Analytics ingestion route (`POST /api/analytics/events`).
- Admin module (M4).

The `server/src/workers/` seam is created now; only the evaluation worker is built. The deferred notification/reconciliation workers reuse the seam later.

**Success criteria**

1. A confirmed appointment auto-advances: `confirmed→in_progress` at slot-start, `→completed` at slot-end+5m when both joined.
2. No appointment can remain `in_progress` past slot-end + `VIDEO_TOKEN_POST_MIN` (hard guarantee, doc 02 §3).
3. No-show resolves per ADR-12 precedence: doctor never joined → `doctor_no_show` (refund net-of-fee + apology); doctor joined, patient absent → `patient_no_show` (no refund).
4. Patient and doctor join an appointment-scoped room offline through the mock; the real-Daily swap reduces to (server REST adapter + client media SDK + webhook signature).

---

## 2. Architecture & components

```
Browser (P-11/P-12, D-02/D-04, D-06)
   │  GET /api/appointments/:id/video-token   (patient/doctor, ownership + time-windowed)
   ▼
appointment.controller ──► video.service ──► videoProvider (daily.stub | daily.mock | daily.js)
                                              createRoom / issueToken

POST /api/webhooks/daily ──► video.service.recordJoin ──► appointments.doctorJoinedAt / patientJoinedAt
   ▲  real: Daily;  dev (VIDEO_PROVIDER=mock): /dev/video/* simulator emits the documented payload

node-cron (* * * * *, server-run block only)
   └─► evaluation.service.evaluateDueAppointments(now)         (pure, clock-injected, catch-up safe)
          ├─ confirmed & now≥slotStart                → transition(in_progress)
          ├─ in_progress & now≥slot+GRACE & !both     → no-show resolution (ADR-12 precedence)
          └─ in_progress & now≥slotEnd+POST           → completed | non-penalizing terminal + alert
                                                         side-effects: refund.initiateRefund, email (reused)
```

**Design principle.** The worker is a thin driver. `evaluateDueAppointments(now)` is pure and clock-injected so every branch is unit-testable with a fixed clock and zero timers. `appointmentState.service.transition` remains the **only** writer of `Appointment.state`; the worker calls it, then fires best-effort side-effects. Room identity is deterministic (`appt_<id>`), so the room is derived, never stored — only join facts are persisted.

---

## 3. Schema change

Two additive nullable columns on `appointments` (Prisma migration; doc 04 cascade):

```prisma
doctorJoinedAt  DateTime? @map("doctor_joined_at")  @db.Timestamptz(6)
patientJoinedAt DateTime? @map("patient_joined_at") @db.Timestamptz(6)
```

- Set on **first** join only (idempotent — never overwritten; transient drops are irrelevant, edge #22).
- No `roomName`/`roomUrl` columns — derived as `appt_<id>` (doc 14 §3).
- `uniq_active_slot` partial index untouched.

Rationale: the no-show/completion logic only ever asks "did each party join at least once?" (doc 02 §3). Two timestamps are the minimal sufficient store; a per-event table is YAGNI for v1.

---

## 4. Backend

### 4a. `daily.mock` VideoProvider — `server/src/integrations/video/daily.mock.js`

Implements the `VideoProvider` typedef (doc 14 §1):

- `createRoom(appointmentId)` → `{ roomName: 'appt_<id>', roomUrl: '<APP_BASE_URL>/video/<id>' }`. Deterministic, no network.
- `issueToken({ roomName, role, notBeforeIso, notAfterIso, displayName })` → `{ token, expiresAt: notAfterIso }`. Token is an opaque HMAC-signed dev string (keyed on `VIDEO_MOCK_SECRET`) so its shape mirrors a real meeting token; the route's time-window gate is the real enforcement.

Selected via the `VIDEO_PROVIDER` env switch (`stub|mock|daily`, default `stub`) in the `integrations/video/index.js` barrel. The production default (`stub`) keeps throwing `NOT_IMPLEMENTED` until the concrete `daily.js` adapter is wired.

### 4b. `video.service` — `server/src/services/video.service.js`

- `issueAppointmentToken({ id, role, userId })`:
  - ownership-checked (patient owns / doctor assigned, else **404** — mirrors `appointment.service.getForRole`, no existence leak);
  - state must be `confirmed` or `in_progress` (else 404/409);
  - window gate: `now ∈ [slotStart − VIDEO_TOKEN_PRE_MIN, slotEnd + VIDEO_TOKEN_POST_MIN]`, else **422 `VIDEO_WINDOW_CLOSED`**;
  - ensures room (`createRoom`, idempotent) then `issueToken` with `notBefore`/`notAfter` from constants and role mapping (doctor → `is_owner` in the real adapter);
  - returns `{ token, expiresAt, roomName, roomUrl }`.
- `recordJoin({ appointmentId, role, at })`: sets the matching `*JoinedAt` column only if currently null (first-join wins).

### 4c. Route

`GET /api/appointments/:id/video-token` → `requireRole('patient','doctor')` → controller → `video.service.issueAppointmentToken`. Wired in `routes/appointments.js`.

### 4d. Real Daily webhook — `POST /api/webhooks/daily`

- System role, no session (authenticity is from the payload/signature, not a cookie) — mirrors the payfast webhook route.
- Parses the documented payload `{ type: 'participant.joined'|'participant.left', room: 'appt_<id>', user_name, timestamp }` (doc 14 §3), maps `room`→appointment + role, and calls `video.service.recordJoin` on `participant.joined`.
- Daily HMAC signature verification is deferred to the real-Daily swap (consistent with the swap-cost analysis); the handler logic is production-shape now.

### 4e. Dev simulator — `server/src/routes/devVideo.js`

Mounted only when `VIDEO_PROVIDER=mock` (mirrors the `/dev/checkout` guard):

- `GET /dev/video/:id` — a simple page with "Doctor joined / Patient joined / Leave" buttons.
- Each button POSTs the documented Daily payload to the **real `POST /api/webhooks/daily` handler** (not the service directly) — so signature-less-but-production-shape webhook ingestion → `recordJoin` → worker no-show flow is genuinely exercised offline.
- In `mock` mode, mounting P-12 also emits the join for the current role, so the normal "open the room" flow records a join without manual buttons.

---

## 5. Appointment-evaluation worker

### 5a. `evaluation.service.evaluateDueAppointments(now)` — pure, clock-injected, idempotent/catch-up safe

Correct even if earlier minute-ticks were missed (downtime). Per tick:

1. **Activate:** `confirmed` & `now ≥ slotStart` → `transition(in_progress, actor=system)`.
2. **No-show (grace):** `in_progress` & `now ≥ slotStart + NO_SHOW_GRACE_MIN` & not both joined →
   - `doctorJoinedAt == null` → `doctor_no_show` (refund net-of-fee + `cancellation_apology` email; ADR-12 precedence, edge 25a);
   - else `patientJoinedAt == null` → `patient_no_show` (no refund).
3. **Finalize / hard cutoff:** `in_progress` & `now ≥ slotEnd + VIDEO_TOKEN_POST_MIN` →
   - both joined → `completed`;
   - else the non-penalizing fallback (resolve as `doctor_no_show` for refund purposes) **+ an admin-alert audit entry** flagging resolution without confident join data — the hard guarantee that nothing stays `in_progress` past slot-end+5m (doc 02 §3, ADR-12).

### 5b. Driver

- `node-cron` (new server dependency) `* * * * *` registered in a `startWorkers()` function called **only** from the server-run block in `index.js` (never imported by tests).
- Dev manual trigger: env-guarded `POST /dev/worker/evaluate` runs one pass on demand for demo/testing (no waiting for the tick).

### 5c. Side-effect reuse

Extract Slice C's private `safeRefund` (in `cancellation.service`) into a small shared helper `server/src/services/refundSideEffects.js` so the worker and `cancellation.service` share one best-effort refund-with-audit wrapper. `cancellation.service` is the only Slice-C file touched, and the change is surgical (move + re-import).

---

## 6. State-machine extension

Extend the `LEGAL` map in `appointmentState.service` (matches doc 05 §5 exactly):

```js
const LEGAL = {
  slot_locked: new Set(['confirmed']),
  confirmed: new Set(['cancelled_refunded', 'cancelled_no_refund', 'doctor_cancelled', 'in_progress']),
  in_progress: new Set(['completed', 'patient_no_show', 'doctor_no_show']),
};
```

`completed→prescription_issued` stays out (F08, a later slice).

---

## 7. Frontend

### 7a. Patient — P-11 waiting room + P-12 video

- Join Call enabled 10m before slot start (doc 06 §"Join Call activation").
- Flow: Join Call → fetch token → P-11 "Doctor will be with you shortly" until the peer is present / slot starts → P-12 stage.
- Peer-presence via polling `GET /api/appointments/:id`, extended to return role-aware `peerJoined` (patient sees `doctorJoinedAt`, doctor sees `patientJoinedAt`) + `serverNow` (drives the slot timer without client-clock drift).
- P-12 renders the doc 06 video chrome (`.video-stage` / `.video-self` / `.video-controls`) with a **simulated placeholder stage** (no real media in the mock); slot timer + slot-end+5m hard cutoff per doc 06 §"Video slot timer and cutoff".
- In `mock` mode, mounting P-12 emits the join (dev path).

### 7b. Doctor — D-04 video

Reuses the P-12 component with `role=doctor` (owner controls; the 5-min-remaining soft warning is shown on the doctor side per doc 06 §"Video slot timer").

### 7c. Doctor — D-02 today view

- Default doctor dashboard: today's appointments sorted by slot time ascending + Join Call; a separate History tab for past appointments.
- Consumes the existing doctor-scoped `GET /api/appointments`; add a "today" filter + History grouping. Columns: slot time, patient name (+ "for: [actual patient]" if booked-for-someone-else), Join Call (doc 02 §F05.02).

### 7d. Doctor — D-06 cancel modal

- Reason-required (internal, shown to admin only), no time-window restriction.
- Calls the existing `POST /api/appointments/:id/cancel` (doctor → `doctor_cancelled`; backend + refund + apology already built and tested in Slice C). Pure frontend.

---

## 8. Configuration & constants

- New env in `env.js` + `.env.example`: `VIDEO_PROVIDER` (`stub|mock|daily`, default `stub`); optional `VIDEO_MOCK_SECRET` (dev mock token signing key, dual-use safe in prod).
- Existing constants reused: `VIDEO_TOKEN_PRE_MIN` (10), `VIDEO_TOKEN_POST_MIN` (5), `NO_SHOW_GRACE_MIN` (15).
- Safety invariant (mirrors ADR-22): `daily.mock` + `/dev/video/*` + `/dev/worker/*` are never active in production — the switch defaults to `stub` and the `/dev` mounts are env-guarded.

---

## 9. Error handling

- `VIDEO_WINDOW_CLOSED` (422) — token requested outside the join window.
- 404 on non-owner / non-visible appointment (no existence leak); 409 `INVALID_TRANSITION` from the state writer for an illegal pair (already exists).
- Worker side-effects are best-effort (reused `safeRefund` + try/catch email) and never block a committed transition — same discipline as Slice C (findings C1/C2).

---

## 10. Testing strategy

Hybrid, matching prior slices (mocked-Prisma unit + a few real-DB integration).

- **Unit (fixed clock):** `evaluateDueAppointments` across every branch — early/late join combinations, neither-joined (→`doctor_no_show`), doctor-only (→`patient_no_show`), both-joined (→`completed`), past-deadline fallback + alert, and catch-up (missed grace, resolves at finalize). `video.service` window gate + ownership + state guard. `daily.mock` token issue/shape. `appointmentState` new legal/illegal pairs.
- **Integration (real DB):** lock→pay→confirm→simulate joins→worker→`completed`; and →`doctor_no_show`→refund settled; video-token window 200 vs 422.
- **Client:** P-11/P-12 states (waiting → active, cutoff), D-02 today/history, D-06 cancel-confirm.

---

## 11. Canon documentation impact

Per doc 00 change protocol + change-impact matrix (apply after user approval at the doc-update step):

| Doc | Change | Matrix driver |
| --- | ------ | ------------- |
| 04  | Add `doctorJoinedAt` + `patientJoinedAt` columns + migration note; v-bump | Schema change (first) |
| 05  | Add `VIDEO_WINDOW_CLOSED` (422) to §3.2; confirm `video-token` + `webhooks/daily` rows (already present); v-bump | New feature / code |
| 11  | Add **ADR-24** (dev video simulation: mock provider + real webhook + dev simulator) and **ADR-25** (appointment-evaluation worker = first node-cron worker; scopes ADR-08 into reality; contrasts ADR-23 lazy); v-bump | New architectural decision |
| 15  | Add `VIDEO_PROVIDER` (+ `VIDEO_MOCK_SECRET`) switch; v-bump | New tunable/config |
| 08  | Note new dev switches must stay off in prod; mock secret dev-only; v-bump | Config cascade |
| 10  | Pre-deploy check: `VIDEO_PROVIDER` not `mock` in prod; v-bump | Config cascade |
| 03  | Note the appointment-evaluation worker now runs in-process; v-bump | Architecture cascade |
| 14  | Note the `daily.mock` dev simulation under §3 (mirror the payfast.mock note); v-bump | Integration |
| 12  | Add TC rows for the new transitions + video-token window | New feature → test cases |
| 13  | Status sweep (F05 Built; module 9 video; M2 progress) | Build progress |

---

## 12. Decisions log (this slice)

| # | Decision | Choice |
| - | -------- | ------ |
| 1 | Video simulation fidelity | Faithful mirror of ADR-22 (mock provider + real webhook + dev simulator + worker reads real join data) |
| 2 | Join-event storage | Two nullable timestamp columns on `appointments` |
| 3 | Worker driver | `node-cron` per ADR-08; pure `evaluateDueAppointments(now)` + dev trigger |
| 4 | Scope boundary | Video + lifecycle + doctor UI only; defer F07 + F04.03 |
| 5 | Token-window rejection | New `VIDEO_WINDOW_CLOSED` (422) |
| 6 | Peer presence | Poll `GET /api/appointments/:id` (role-aware `peerJoined` + `serverNow`) |
| 7 | P-12 media in mock | Simulated placeholder stage (no real media) |
| 8 | Dev worker trigger | `POST /dev/worker/evaluate` (env-guarded) |
| 9 | Refund side-effects | Extract Slice C `safeRefund` to a shared helper reused by the worker |

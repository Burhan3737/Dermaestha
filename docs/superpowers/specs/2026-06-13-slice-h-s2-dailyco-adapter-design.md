# Slice H · S2 — Daily.co Adapter — Design

| Field      | Value |
| ---------- | ----- |
| Date       | 2026-06-13 |
| Status     | Approved (brainstorming output); plan + build pending |
| Slice      | H of 8 — sub-slice S2 of 7 |
| Depends on | Slice D (video + evaluation worker, merged) + Slice G (merged). Independent of all other S-sub-slices. |
| Canon refs | F05 (video & lifecycle); doc 02 §3.3 video edges #22; doc 05 §F05 + `POST /api/webhooks/daily`; doc 14 §1 (VideoProvider) + §3 (Daily payload shapes); doc 15 §Daily.co; ADR-24 (dev mock) + its flagged role-mapping follow-up |

---

## 0. Decision provenance (read first)

The video gateway is **Daily.co** (`api.daily.co/v1`). Its API was confirmed via a full research pass against the current official docs (`docs.daily.co/reference/rest-api/...`) — **almost entirely [CONFIRMED]**, unlike the PayFast PK research. The user chose: add `verifyWebhook` to the `VideoProvider` contract (adapter verifies + normalizes), and fix the role-mapping bug at the root.

Two Slice-D "fix in the real adapter" markers drive this slice:
1. **No webhook verification exists.** `POST /api/webhooks/daily` is mounted public with `// Signature verification deferred to the real adapter` and checks nothing — an unauthenticated public endpoint that writes appointment join-state. S2 closes this.
2. **Role-mapping is a dev-only hack.** `recordJoinFromDailyEvent` infers doctor/patient by substring-matching `user_name` for `'doctor'`/`'patient'` (only the dev simulator sends those literals). Real Daily echoes the participant's display name, so this would misclassify every real join (flagged in-code, ADR-24 follow-up).

Confirmed Daily facts the design relies on (all [CONFIRMED via official docs] unless noted):
- Token `user_id` is echoed back as `payload.user_id` in `participant.joined`/`.left`; token `is_owner` reflects as `payload.owner` (note the **rename**).
- Webhook signature: headers `X-Webhook-Timestamp` + `X-Webhook-Signature`; `signedContent = timestamp + "." + body`; HMAC-SHA256 with the **base64-decoded** hmac secret; output **base64**; constant-time compare. **Not** Svix.
- Event envelope: `{ version, type, id, payload: { room, user_id, user_name, owner, joined_at, session_id, ... }, event_ts }`. `room` = room **name**, not URL.
- Creating a webhook (`POST /v1/webhooks`) returns the `hmac` secret. Default `retryType: circuit-breaker` **disables** the webhook after 3 consecutive failures; `exponential` is the safer choice.
- Room names are unique per domain; `GET /v1/rooms/{name}` exists for idempotent create. Duplicate-create error body is **[UNVERIFIED]** — use GET-first, treat any create-400 as "confirm via GET."
- Signed-string serialization (raw bytes vs `JSON.stringify`) is **[the one real implementation risk]** — must be validated against a live delivery.

---

## 1. Scope & goals

**Goal:** a production-ready `daily.js` so video is keys-only at launch, with a verified, normalized webhook path that maps participants to roles reliably.

**In scope**
1. **`server/src/integrations/video/daily.js`** — `createRoom`, `issueToken`, **new** `verifyWebhook`.
2. **Contract extension (doc 14 §1):** `VideoProvider` gains `verifyWebhook(req)`; `createRoom` gains an optional window arg; new `NormalizedVideoEvent` typedef.
3. **Controller/service refactor:** verification + normalization + role-mapping move into the adapter; the dev role-inference hack is deleted from production code.
4. **Raw-body capture** on the Daily webhook route (for byte-correct HMAC).
5. **Config:** `DAILY_WEBHOOK_SECRET`; provider selection routes `daily → dailyReal`.
6. **Webhook-registration ops step** (`retryType: exponential`).
7. **HTTP-mocked tests**; all existing video/mock/simulator suites stay green.

**Out of scope**
- Video consultation UI (→ S3).
- Dev `mock` / `/dev/video/*` / `/dev/worker/*` paths — retained unchanged; `mock` stays the dev/CI default.
- Recording/transcription/raw-tracks; any server-side media (browser-only).
- PayFast adapter (→ S1); analytics emits (→ owning feature slices).

**Success criteria**
1. Existing server + client suites stay green; every new behavior lands test-first.
2. `createRoom` is idempotent: a second call for an existing room reuses it (GET), never erroring on a duplicate name.
3. A signed Daily delivery with a valid signature normalizes to `{ type, appointmentId, role, timestamp, eventId }` and records the join; a tampered signature → `401` + `video.webhook_rejected` audit, no write.
4. Role is derived from the token's `user_id` (`doctor`/`patient`), not `user_name`; a real-display-name participant maps correctly; a tokenless join maps to `null` (skipped), never misclassified.
5. `VIDEO_PROVIDER=daily` selects the real adapter; `mock`/`stub` behavior unchanged; the `/dev/video/*` simulator still records joins via the mock's `verifyWebhook`.

---

## 2. The adapter — `daily.js` (against `api.daily.co/v1`, Bearer `DAILY_API_KEY`)

HTTP via `fetch` (mirrors `resend.js`/`payfast.js`); non-2xx → `AppError`. Base host + paths behind named constants.

**`createRoom(appointmentId, { notAfterIso } = {})`** → `{ roomName, roomUrl }`
- Idempotent: `GET /v1/rooms/appt_<id>` → 200 reuse (return its `url`); not-found → `POST /v1/rooms` with `{ name: 'appt_<id>', privacy: 'private', properties: { exp: <unix(notAfterIso) or now+24h>, eject_at_room_exp: true, enable_prejoin_ui: true } }`. On a create race returning 400, fall back to GET (no string-matching the undocumented body). `roomUrl` = the response `url` (`https://<DAILY_DOMAIN>.daily.co/appt_<id>`).

**`issueToken({ roomName, role, notBeforeIso, notAfterIso, displayName })`** → `{ token, expiresAt }`
- `POST /v1/meeting-tokens` body `{ properties: { room_name: roomName, is_owner: role === 'doctor', user_name: displayName, user_id: role, nbf: unix(notBeforeIso), exp: unix(notAfterIso) } }`. Returns `{ token: body.token, expiresAt: notAfterIso }`.
- `user_id: role` is the stable role anchor the webhook echoes back.

**`verifyWebhook(req)`** *(new)* → `NormalizedVideoEvent | null`
- Verify: `expected = base64(HMAC_SHA256(base64decode(DAILY_WEBHOOK_SECRET), req.headers['x-webhook-timestamp'] + '.' + req.rawBody))`, constant-time compare to `x-webhook-signature`; mismatch → `AppError('INVALID_SIGNATURE', …, 401)`.
- Handle the create-time test ping `{"test":"test"}` → return `null` (200).
- Normalize: only `participant.joined`/`participant.left`; `appointmentId = payload.room.replace(/^appt_/, '')`; `role = payload.user_id === 'doctor' ? 'doctor' : payload.user_id === 'patient' ? 'patient' : (payload.owner ? 'doctor' : null)`; `timestamp = payload.joined_at` (`.left` → its own ts); `eventId = id`. No `user_id` and not owner (tokenless/knocking) → `role=null` → return `null` (skip; never guess).

---

## 3. Contract changes (doc 14)

- `VideoProvider` typedef gains `verifyWebhook(req: Request) => NormalizedVideoEvent | null`; `createRoom(appointmentId, opts?: { notAfterIso?: string })`.
- New typedef: `NormalizedVideoEvent { type: 'participant.joined'|'participant.left', appointmentId: string, role: 'doctor'|'patient', timestamp: string, eventId: string }`.
- doc 14 §3: replace the simplified dev participant shape with Daily's current versioned envelope (`{version,type,id,payload,event_ts}`, `payload.owner` not `is_owner`, `room` = name). Keep the dev-simulator note (the mock still emits the simplified shape).

---

## 4. Controller / service refactor

- `modules/video/controller.js`:
  ```
  const evt = videoProvider.verifyWebhook(req);   // throws AppError(401) on bad signature
  if (evt) await videoService.recordJoinFromDailyEvent(evt);
  res.json({ ok: true });
  ```
  Bad signature → catch → `video.webhook_rejected` audit + 401 (mirrors the payment controller).
- `recordJoinFromDailyEvent(evt)` now takes the **normalized** event: drop the `appt_` stripping and the `user_name` role inference; keep first-join-wins per `doctorJoinedAt`/`patientJoinedAt` and the event-`timestamp` preference. (Production code no longer contains the ADR-24-flagged hack.)
- **`mock.verifyWebhook`** (dev-only): accept the unsigned `/dev/video/*` simulator shape `{ type, room, user_name, timestamp }`, normalize it (the role-from-`user_name` inference legitimately lives here, dev-only), return a `NormalizedVideoEvent`. **`stub.verifyWebhook`** throws `NOT_IMPLEMENTED`.
- **Raw-body capture:** the Daily webhook route uses `express.json({ verify: (req,_res,buf) => { req.rawBody = buf.toString('utf8'); } })` (scoped to that path) so HMAC runs over the exact received bytes. **Validate against a live delivery** (raw vs `JSON.stringify`) per §7/§8.

---

## 5. Config & provider selection

- `env.js` (Zod) + doc 15 §Daily.co: **add** `DAILY_WEBHOOK_SECRET` (string, optional). Retain `DAILY_API_KEY`, `DAILY_DOMAIN`, `VIDEO_MOCK_SECRET` (dev-only).
- `integrations/video/index.js`: `daily → dailyReal`, `mock → dailyMock`, else `dailyStub`. (`VIDEO_PROVIDER` enum already includes `daily`.)

---

## 6. Webhook registration (ops, not runtime)

One-time setup (documented in doc 10; a small helper script optional): `POST https://api.daily.co/v1/webhooks` with `{ url: '<APP_BASE_URL>/api/webhooks/daily', eventTypes: ['participant.joined','participant.left'], retryType: 'exponential' }`; capture the returned `hmac` → `DAILY_WEBHOOK_SECRET`. `exponential` avoids the `circuit-breaker` auto-disable-after-3-failures trap. Monitor webhook `state`/`failedCount`.

---

## 7. Testing

- **Adapter unit tests** (`daily.test.js`, `fetch` mocked): `createRoom` GET-reuse + POST-create (private, `exp`, `eject_at_room_exp`) + 400-race → GET fallback; `issueToken` body (`room_name`, `is_owner` by role, `user_id`, `nbf`/`exp`); `verifyWebhook` valid signature → normalized event, tampered → 401, test-ping → null, role from `user_id`, tokenless → null, `.left` mapping.
- **Service test:** `recordJoinFromDailyEvent` on normalized events (first-join-wins; doctor vs patient column).
- **Controller test:** 401 + `video.webhook_rejected` on bad signature.
- **Regression:** full `npm test` + client suite green; mock/simulator path verified through the new `mock.verifyWebhook`. No live network.

---

## 8. Daily setup checklist (launch gate — lighter than S1)

1. **Validate the HMAC signed-string against a live delivery** (raw body vs `JSON.stringify`) — the one real implementation risk; confirm before trusting verification.
2. Confirm `GET /v1/rooms/:name` not-found status for the idempotency branch.
3. Confirm room lifecycle after `exp` (auto-removed vs explicit `DELETE /v1/rooms/:name`).
4. Provide `DAILY_API_KEY` + `DAILY_DOMAIN`; register the webhook (`retryType: exponential`) and capture `DAILY_WEBHOOK_SECRET`.
5. Confirm tokenless/knocking handling matches the `role=null` skip (private rooms require a token, so the happy path is covered).

---

## 9. Spec-doc impact (tracked; applied at task end with approval)

| Doc | Change |
| --- | --- |
| 14 | `VideoProvider` +`verifyWebhook` + `createRoom` window arg; new `NormalizedVideoEvent`; §3 → Daily current versioned envelope (`payload.owner`, `room`=name) |
| 15 | §Daily.co +`DAILY_WEBHOOK_SECRET` |
| 05 | `POST /api/webhooks/daily` now signature-verified (401 path); raw-body note |
| 07 | Risks: signed-string byte-sensitivity; `circuit-breaker` auto-disable |
| 11 | New ADR — "Daily adapter: verify+normalize in adapter, role via token `user_id`, raw-body HMAC, webhook `retryType=exponential`" |
| 13 | Status tracker: Video adapter interface → Built (Daily); P-12/D-04 still pending (S3) |

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-13 | Initial creation | Slice H · S2 brainstorming output (approved) |

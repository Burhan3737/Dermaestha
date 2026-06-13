# Slice H · S3 — Video Consultation UI — Design

| Field      | Value |
| ---------- | ----- |
| Date       | 2026-06-13 |
| Status     | Approved (brainstorming output); plan + build pending |
| Slice      | H of 8 — sub-slice S3 of 7 |
| Depends on | Slice D (video backend + token route + evaluation worker) + Slice G (merged). Runs against the dev `mock` adapter; the real call path lights up once **S2** (Daily adapter) is wired. The `video_join_*` emits land in the `AnalyticsEvent` writer once **S6** ships `POST /api/analytics/events`. |
| Canon refs | F05 (video & lifecycle); doc 02 §3.3 video edges #22 + KPI #3; doc 06 P-11/P-12/D-02/D-04/D-06 screen specs + "Video slot timer and cutoff" + "Join Call activation"; doc 14 §6 analytics catalog (`video_join_attempt`, `video_join_success`); `mockups/patient-11-waiting-room.html`, `patient-12-video.html`, `doctor-04-video.html`, `doctor-02-today.html`, `doctor-06-cancel-modal.html` |

---

## 0. Decision provenance (read first)

The visuals for all five screens are **already designed and mocked** (the `mockups/*.html` set, ported verbatim like every prior slice). S3 is therefore **behavior + wiring**, not visual design — no visual companion, no layout decisions.

Reality vs. doc 13's claim: doc 13 lists "Video chrome (Daily SDK wrapper): Built (Slice D)." Reading `client/src/modules/video/views/VideoRoom/VideoRoom.jsx`, that is **overstated** — there is **no Daily SDK**: the stage is placeholder text, Mic/Cam are dead buttons, and the only "join" is a mock fire-and-forget POST to `/dev/video/join`. The single `/video/:id` view also collapses P-11/P-12/D-04 into one role-branched component. So S3 delivers the real video that Slice D deferred, and splits out the waiting room.

**Approved decisions (user, 2026-06-13):**
- **Render the live call with Daily Prebuilt** (`DailyIframe.createFrame`), themed to brand colors; Daily owns in-call tiles/controls/device pickers **and reconnection/3G adaptation** (the M2 "mobile-tested on 3G" success criterion). App owns everything around the frame + the P-11 waiting room. Visual trade-off (Daily's control tray vs the mockup's circular bar) accepted.
- **P-11 is a lightweight get-ready screen**; the camera/mic device check is **Daily Prebuilt's prejoin** (`enable_prejoin_ui`, set on the room in S2) — no app-managed `getUserMedia` (avoids device-contention on handoff). Accepted as a minor deviation from the mockup's live camera-preview pane.
- **One role-aware `VideoRoom`** for P-12/D-04 (not two components); doc 06 keeps the separate screen IDs.
- **S3 owns the shared client analytics helper** `client/src/lib/analytics/track.js`; **S6 owns** the server `POST /api/analytics/events` + `AnalyticsEvent` writer.

---

## 1. Scope & goals

**Goal:** a working, on-brand video consultation flow end-to-end — patient and doctor join a real Daily room from their dashboards, with the app's timer/cutoff chrome and the KPI #3 join telemetry.

**In scope**
1. **Real Daily Prebuilt integration** — `useDailyCall` hook (lazy-loads `@daily-co/daily-js`), themed `createFrame` + `join({ url, token })` from the existing `GET /appointments/:id/video-token`.
2. **P-11 waiting room** (`/video/:id/ready`) — context get-ready screen.
3. **P-12 / D-04** (`/video/:id`) — one role-aware `VideoRoom` with the iframe + app chrome (timer, doctor "5 min" warning, ended/late states).
4. **D-02 today's base view** — full doctor dashboard (today's list + Join activation + awaiting-prescription badge/action + History + D-06 cancel modal wired in).
5. **Analytics emits** — `video_join_attempt` / `video_join_success` via the new client `track.js`.
6. **P-08 update** — Join Call routes to P-11 + emits `video_join_attempt`.

**Out of scope**
- Daily/PayFast adapters (S2/S1); the analytics server endpoint + writer (S6).
- Recording/transcription; any server-proxied media (browser-only).
- New visual design; the dev `mock`/simulator path (retained for dev/CI).
- A bespoke custom-rendered control bar (Daily Prebuilt owns the in-call tray; not deferred-with-intent here, simply Daily's surface by the approved decision).

**Success criteria**
1. Existing client + server suites stay green; new behavior lands test-first.
2. Patient and doctor each join the same Daily room via Prebuilt using their role-scoped token; the call renders themed to brand.
3. P-08/D-02 "Join Call" is disabled until 10 min before slot start (doc 06) and routes through P-11.
4. The slot timer counts to slot-end; the doctor sees "5 minutes remaining"; at slot-end+5 min the session shows ended (and Daily ejects via S2's `eject_at_room_exp`).
5. `video_join_attempt` fires on Join click and `video_join_success` on Daily's `joined-meeting`, each with `{ appointmentId, role, networkType }`; both no-op cleanly if the S6 endpoint isn't deployed yet.
6. D-02 shows today's appointments, the awaiting-prescription badge, write-prescription action, History, and a working D-06 cancel modal.

---

## 2. Daily Prebuilt integration

- **`client/src/modules/video/useDailyCall.js`** — lazy `import('@daily-co/daily-js')` (separate bundle chunk, mirrors Slice F's `pdf-lib`); `DailyIframe.createFrame(containerEl, { showLeaveButton: true, theme: { colors: { accent, background: '#072018', … } } })`; `join({ url: roomUrl, token })`. Listens for `joined-meeting` (→ `video_join_success`), `left-meeting`/`error` (→ cleanup + navigate). `destroy()` on unmount.
- The token + room come from the existing `useVideo` query (`GET /appointments/:id/video-token` → `{ token, roomUrl, expiresAt, serverNow, joinSimUrl }`). In `mock` mode (`joinSimUrl` present) the existing simulator path is retained so dev/CI never needs real Daily; the Prebuilt path activates when `joinSimUrl` is null (real adapter).
- App chrome around the iframe replaces the placeholder stage; the dead Mic/Cam buttons are removed.

## 3. Screens

- **P-11 waiting room** — `/video/:id/ready`, patient+doctor gated. Mockup `patient-11-waiting-room.html` context: doctor info, slot time, lighting tip, "doctor will be with you shortly" status, **"Join call"** CTA → navigates to `/video/:id`. No app-managed camera preview (Daily prejoin on P-12 handles the device check). [Deviation from the mockup's preview pane — approved.]
- **P-12 / D-04** — `/video/:id`, one role-aware `VideoRoom`: Daily iframe + timer row + doctor "5 min remaining" warning (role-gated, already present) + ended/late states (slotEnd+5m). `is_owner` already differentiates doctor via the S2 token.
- **D-02 today's base view** — doctor dashboard (mockup `doctor-02-today.html`): today's appointments list, **Join Call** (enabled 10 min pre-slot, doc 06), awaiting-prescription badge + write-prescription action (Slice F pieces), History section, and the **D-06** `DoctorCancelModal` (existing component) wired to each cancellable row.
- **P-08** — Upcoming view: "Join Call" → P-11 + `video_join_attempt` emit.

## 4. Analytics emits (KPI #3) — cross-slice contract

- **`client/src/lib/analytics/track.js`** (NEW, owned by S3): `track(type, meta)` → fire-and-forget `api.post('/api/analytics/events', { type, networkType, meta })`, `.catch(() => {})`. No-ops cleanly until S6 deploys the endpoint.
- Call-sites: `video_join_attempt` on Join click (P-08 / D-02); `video_join_success` on Daily `joined-meeting`. `meta = { appointmentId, role }`; `networkType = navigator.connection?.effectiveType ?? 'unknown'` (matches doc 14 §6).
- **S6 contract:** S6 builds `POST /api/analytics/events` + the `AnalyticsEvent` writer; S4 reuses this same `track.js`. Documented so parallel plan-writers don't collide on the helper file (S3 creates it; S4/S6 consume).

## 5. Routing

`buildRoutes(session)`: add `/video/:id/ready` (P-11, patient+doctor); retain `/video/:id` (P-12/D-04). D-02 mounted as the doctor dashboard default. Join flows go ready → call.

## 6. Testing

- **`useDailyCall`** (mock `@daily-co/daily-js`): createFrame+join lifecycle; `joined-meeting` → one `video_join_success`; cleanup on unmount.
- **P-11**: renders doctor context + Join CTA + navigates.
- **`VideoRoom`**: timer countdown, doctor 5-min warning, ended state at cutoff; mock-path retained.
- **D-02**: today's list, Join activation window (disabled >10 min out), awaiting badge, D-06 cancel modal open/confirm.
- **`track.js`**: swallows a 404 (no throw).
- Existing `VideoRoom.test.jsx` + simulator path updated. Full client suite green; no live Daily network in tests.

## 7. Spec-doc impact (tracked; applied at task end with approval)

| Doc | Change |
| --- | --- |
| 02 | KPI #3 emit points (video_join_attempt/success locations) |
| 05 | Note: client posts to `POST /api/analytics/events` (route defined in S6) |
| 06 | P-11 camera-preview deviation (get-ready + Daily prejoin); one-shared-`VideoRoom` note for P-12/D-04 |
| 11 | New ADR — "Video UI: Daily Prebuilt iframe + app chrome; P-11 get-ready + Daily prejoin; one role-aware VideoRoom" |
| 13 | P-11/P-12/D-04/D-02(base)/D-06 → Built; correct the overstated "Video chrome (Daily SDK wrapper): Built" row to reflect real SDK integration in S3 |
| — | `client/package.json`: add `@daily-co/daily-js` (lazy-chunked) |

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-13 | Initial creation | Slice H · S3 brainstorming output (approved) |

# 14 — Future Considerations

How the v1 architecture deliberately accommodates what comes next — without building it prematurely.

---

## v1.1 Additions (2–4 weeks post-launch)

### Online Payments — Safepay

**What changes:** Add one new route file and one new service file. Nothing else touched.

```
server/src/
  services/payment.js       ← new: Safepay SDK wrapper
  routes/payments.js        ← new: POST /api/payments/initiate
                                    POST /api/payments/webhook
  app.js                    ← mount /api/payments (one line)
```

Payment flow: Patient clicks "Pay" → `POST /api/payments/initiate { appointmentId }` → server creates Safepay checkout → returns redirect URL → patient pays on Safepay → Safepay calls webhook → appointment status updated.

**Note:** Start Safepay merchant KYC in parallel with v1 development — approval takes 1–2 weeks.

---

### SMS / WhatsApp Notifications

**What changes:** Rename `services/email.js` → `services/notifications.js`. Add Twilio or WhatsApp Business API calls alongside existing Resend calls.

```js
// services/notifications.js (extends email.js)
export async function sendBookingConfirmation({ patient, doctor, appointment }) {
  await resend.send(...)             // existing email
  await twilio.messages.create(...)  // new: SMS to patient.phone
}
```

The scheduler and route handlers call `notifications.sendReminder24h(...)` — same function names, extended implementations. No other files change.

---

### Live Queue / Spot Booking

**What changes:** Add Socket.io to the existing Express server.

```js
// server.js
import { Server } from 'socket.io'
const io = new Server(httpServer, { cors: { origin: CLIENT_URL } })
io.on('connection', (socket) => { ... })
```

```jsx
// client: DoctorDashboard.jsx
import { io } from 'socket.io-client'
// Emit 'doctor:online' on mount, 'doctor:offline' on unmount
```

No DB schema changes — the `Appointment` model already supports the data. The queue UI is a new page/component on the client.

---

### Lapid COD Integration

**What changes:** Self-contained addition.

```
server/src/
  services/lapid.js         ← new: Lapid courier API wrapper
  routes/orders.js          ← new: POST /api/orders
```

No changes to prescriptions, appointments, or auth.

---

## v1.2+ Additions

### Pharmacy Price Calculation + Online Ordering

New `Pharmacy` and `Order` models in Prisma schema. New `services/pharmacy.js`. New routes. Requires pharmacy partnerships. Self-contained — no existing tables change.

### Raast P2M (State Bank near-zero-fee rail)

Add as an additional payment method in `services/payment.js`. Same webhook pattern as Safepay. No architecture change.

### Urdu Language Support

Add `react-i18next` to client. Extract all JSX string literals to `src/locales/en.json` and `src/locales/ur.json`. Zero backend changes — all content is stored in English in the DB; only UI strings need translation.

---

## v2 Additions

### React Native Mobile App (iOS / Android)

React Native can reuse:
- `client/src/api/` — all API client functions (same endpoints, same JWT auth)
- Business logic and state management patterns
- Daily.co has a React Native SDK: `@daily-co/react-native-daily-js`

The backend requires no changes.

### Proprietary Video Streaming

**What changes:** Replace `services/video.js` on the server and `VideoCall.jsx` on the client. All `VideoRoom.jsx` pages consume `VideoCall.jsx` — they don't change.

The interface contract (`{ token, url }` from `POST /appointments/:id/join`) remains identical. Backend changes are confined to `services/video.js`.

### Backend Scaling

When concurrent connections or query latency increases:

1. **PgBouncer** (Railway plugin) — connection pooling, no code changes
2. **Railway replica** — horizontal Express scaling, no code changes
3. **S3 migration** — change `services/pdf.js` (write to S3) and the PDF serve route (redirect to signed S3 URL). Two files.
4. **Read replica** — Prisma `$extends` for read/write splitting if DB read load spikes

None of these require architectural redesign. The v1 structure was chosen specifically to allow each as a one- or two-file change.

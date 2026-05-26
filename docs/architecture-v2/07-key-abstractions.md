# 07 — Key Abstractions

---

## Auth Middleware (`middleware/auth.js`)

Two composable Express middlewares applied to protected routes:

```js
verifyJWT(req, res, next)
// Extracts Authorization header, verifies JWT signature.
// Sets req.user = { id, role, patientId?, doctorId? } on success.
// Returns 401 if missing or invalid.

requireRole(...roles)(req, res, next)
// Checks req.user.role against the allowed roles array.
// Returns 403 if role is not permitted.
// Must be applied after verifyJWT.
```

Usage pattern:
```js
router.post('/appointments', verifyJWT, requireRole('PATIENT'), handler)
router.post('/prescriptions', verifyJWT, requireRole('DOCTOR'), handler)
router.get('/admin/doctors/pending', verifyJWT, requireRole('ADMIN'), handler)
```

---

## Slot Generation (`utils/slots.js`)

Pure function — no DB calls, no side effects.

```js
generateSlots(availabilityForDay, bookedDatetimes, requestedDate)
// availabilityForDay: { startTime: "09:00", endTime: "17:00" }
// bookedDatetimes:    ISO string[]  (already-confirmed appointments for this doctor/date)
// requestedDate:      "YYYY-MM-DD"
// → [{ datetime: ISO, available: bool }]

// Produces 30-minute intervals from startTime to endTime.
// Marks each slot available=false if its ISO datetime appears in bookedDatetimes.
// All datetimes are UTC; client converts to PKT (UTC+5) for display.
```

Edge cases: slot duration is fixed at 30 min for v1. Timezone stored as UTC — no server-side conversion.

---

## Video Service (`services/video.js`)

Wraps Daily.co REST API. Two functions, called from route handlers only.

```js
createRoom(appointmentId)
// POST https://api.daily.co/v1/rooms
// body: { name: "appt-<id>", privacy: "private" }
// → { url, name }
// Called during POST /appointments. Return value stored on Appointment record.

createToken(roomName, userId, isOwner)
// POST https://api.daily.co/v1/meeting-tokens
// body: { room_name: roomName, user_id: userId, is_owner: isOwner }
// → { token }
// Called during POST /appointments/:id/join.
// isOwner=true for DOCTOR (host controls), false for PATIENT.
```

---

## Email Service (`services/email.js`)

Four functions with consistent signature `{ patient, doctor?, appointment?, prescriptionId? }`. All send via Resend SDK.

```js
sendBookingConfirmation({ patient, doctor, appointment })
// Triggered: POST /appointments (after DB write + Daily.co room created)

sendReminder24h({ patient, doctor, appointment })
// Triggered: scheduler — 24h before scheduledAt

sendReminder1h({ patient, doctor, appointment })
// Triggered: scheduler — 1h before scheduledAt

sendPrescriptionReady({ patient, prescriptionId })
// Triggered: POST /prescriptions (after PDF written)
// Email contains link to patient dashboard
```

Email failure does not roll back the triggering operation — failures are logged and the request continues. Add retry logic in v1.1.

---

## PDF Service (`services/pdf.js`)

```js
generatePrescriptionPdf(prescriptionId)
// 1. Fetch Prescription + PrescriptionMedicine[] + Doctor + Patient from DB (Prisma)
// 2. Render with PDFKit:
//      - Clinic header (Dermestha branding)
//      - Doctor info (name, specialization)
//      - Patient info (name, age, gender)
//      - Medicines table: name | dosage | duration | instructions
//      - Free-text notes (Prescription.notes)
//      - Footer (date, doctor signature line)
// 3. Write buffer to process.env.UPLOADS_DIR + "/rx-<id>.pdf"
// 4. Return the file path string
// → "/uploads/rx-<id>.pdf"
```

The returned path is stored on `Prescription.pdfPath`. The PDF is served by Express via:
```
GET /api/prescriptions/:id/pdf
→ res.sendFile(prescription.pdfPath)   // streams with Content-Type: application/pdf
```

---

## Scheduler (`services/scheduler.js`)

Bootstrapped once in `server.js` at process startup. Fires every 5 minutes via `node-cron`.

```js
// Every 5 minutes:
cron.schedule('*/5 * * * *', async () => {
  const now = new Date()

  // 24h reminder window: [now+23h55m, now+24h5m]
  const appointments24h = await prisma.appointment.findMany({
    where: {
      scheduledAt: { gte: addMinutes(now, 23*60+55), lte: addMinutes(now, 24*60+5) },
      notified24h: false,
      status: 'CONFIRMED'
    },
    include: { patient: true, doctor: true }
  })
  for (const appt of appointments24h) {
    await email.sendReminder24h(appt)
    await prisma.appointment.update({ where: { id: appt.id }, data: { notified24h: true } })
  }

  // 1h reminder window: [now+55m, now+65m]
  // ... same pattern with notified1h
})
```

**Why ±5 min window?** Cron fires every 5 minutes. A window slightly wider than the tick interval guarantees no appointment falls between ticks. The boolean flag (`notified24h`, `notified1h`) prevents duplicate sends if an appointment falls within two consecutive windows (rare but possible at window boundaries).

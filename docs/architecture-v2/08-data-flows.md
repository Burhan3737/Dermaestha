# 08 — Data Flows

Step-by-step traces for all four critical scenarios.

---

## Scenario 1 — Patient Books an Appointment

```
Patient clicks "Confirm Booking" on BookSlot.jsx
  │
  │  POST /api/appointments  { doctorId, scheduledAt }
  │  Authorization: Bearer <patient-jwt>
  ▼
verifyJWT → requireRole('PATIENT')

Route handler (routes/appointments.js)
  │
  ├─ Zod: validate doctorId (string), scheduledAt (ISO datetime)
  │
  ├─ Check slot is free:
  │    prisma.appointment.findFirst({
  │      where: { doctorId, scheduledAt, status: { not: 'CANCELLED' } }
  │    })
  │    → conflict → 409 "Slot already booked"
  │
  ├─ Create Appointment record:
  │    prisma.appointment.create({
  │      data: { patientId, doctorId, scheduledAt, status: 'CONFIRMED' }
  │    })
  │
  ├─ Create Daily.co video room:
  │    video.createRoom(appointment.id)
  │    → POST https://api.daily.co/v1/rooms { name: "appt-<id>", privacy: "private" }
  │    → { url, name }
  │
  ├─ Persist room details:
  │    prisma.appointment.update({ data: { videoRoomUrl: url, videoRoomName: name } })
  │
  ├─ Send confirmation email:
  │    email.sendBookingConfirmation({ patient, doctor, appointment }) → Resend API
  │
  └─ Return 201 { appointment, videoRoomUrl }

Client → redirect patient to Dashboard.jsx showing confirmed booking
```

---

## Scenario 2 — Doctor Generates a Prescription

```
Doctor submits PrescriptionBuilder.jsx form after the video call
  │
  │  POST /api/prescriptions
  │  Body: {
  │    appointmentId,
  │    notes: "Apply twice daily",
  │    medicines: [
  │      { medicineId: "cld123", dosage: "2% cream", duration: "14 days", instructions: "Thin layer" },
  │      { customName: "Vitamin C serum", dosage: "Once daily", duration: "30 days" }
  │    ]
  │  }
  │  Authorization: Bearer <doctor-jwt>
  ▼
verifyJWT → requireRole('DOCTOR')

Route handler (routes/prescriptions.js)
  │
  ├─ Zod: validate body shape
  │
  ├─ Confirm appointment belongs to this doctor:
  │    prisma.appointment.findFirst({ where: { id: appointmentId, doctorId: req.user.doctorId } })
  │    → not found → 403
  │
  ├─ Create Prescription record
  │
  ├─ Create PrescriptionMedicine records (createMany)
  │
  ├─ Generate PDF:
  │    pdf.generatePrescriptionPdf(prescription.id)
  │      ├─ Fetch Prescription + medicines + Doctor + Patient from DB
  │      ├─ PDFKit renders: header / doctor info / patient info / medicines table / notes / footer
  │      ├─ Write buffer → /uploads/rx-<id>.pdf
  │      └─ Return "/uploads/rx-<id>.pdf"
  │
  ├─ Update Prescription.pdfPath
  │
  ├─ Update Appointment.status → 'COMPLETED'
  │
  ├─ Send prescription-ready email:
  │    email.sendPrescriptionReady({ patient, prescriptionId }) → Resend API
  │    → Email contains link to patient dashboard
  │
  └─ Return 201 { prescription, pdfUrl: "/api/prescriptions/<id>/pdf" }

Patient receives email → clicks link → Dashboard.jsx
  └─ GET /api/prescriptions/<id>/pdf → Express streams PDF file
```

---

## Scenario 3 — Reminder Emails (Cron)

```
node-cron fires every 5 minutes (started in server.js at boot)
  │
  ├─ now = new Date()
  │
  ├─ ── 24-HOUR REMINDER ──────────────────────────────────────────
  │    findMany where:
  │      scheduledAt ∈ [now+23h55m, now+24h5m]
  │      AND notified24h = false
  │      AND status = 'CONFIRMED'
  │    include: patient, doctor
  │
  │    For each:
  │      email.sendReminder24h({ patient, doctor, appointment }) → Resend
  │      prisma.appointment.update({ data: { notified24h: true } })
  │
  └─ ── 1-HOUR REMINDER ────────────────────────────────────────────
       findMany where:
         scheduledAt ∈ [now+55m, now+65m]
         AND notified1h = false
         AND status = 'CONFIRMED'
       include: patient, doctor

       For each:
         email.sendReminder1h({ patient, doctor, appointment }) → Resend
         prisma.appointment.update({ data: { notified1h: true } })
```

**Why ±5 minute window?** Cron ticks every 5 minutes. A ±5 minute window around the target time guarantees no appointment is missed between ticks. The `notified` boolean prevents duplicate sends if an appointment falls within two consecutive windows.

---

## Scenario 4 — Patient Joins a Video Call

```
Patient clicks "Join Call" on Dashboard.jsx at appointment time
  │
  │  POST /api/appointments/:id/join
  │  Authorization: Bearer <patient-jwt>
  ▼
verifyJWT → req.user = { id, role: 'PATIENT' }

Route handler
  ├─ Fetch appointment, confirm patient.id === appointment.patientId
  │    → mismatch → 403
  ├─ video.createToken(appointment.videoRoomName, patient.id, isOwner=false)
  │    → POST https://api.daily.co/v1/meeting-tokens { is_owner: false }
  │    → { token }
  └─ Return 200 { token, url: appointment.videoRoomUrl }

Client: VideoRoom.jsx
  └─ <DailyProvider url={url} token={token}>
       → WebRTC handshake via Daily.co CDN infrastructure
       → Adaptive bitrate adjusts to Pakistan 3G connection quality
```

Doctor uses the same endpoint — `isOwner=true` grants host controls (mute/remove participant, end meeting).

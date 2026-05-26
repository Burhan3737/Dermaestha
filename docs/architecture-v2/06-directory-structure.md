# 06 — Directory Structure

```
dermestha/
├── client/                         # React + Vite SPA (deployed to Vercel)
│   ├── src/
│   │   ├── api/                    # Axios wrappers — one file per resource
│   │   │   ├── auth.js
│   │   │   ├── appointments.js
│   │   │   ├── doctors.js
│   │   │   └── prescriptions.js
│   │   ├── components/             # Shared UI components
│   │   │   ├── Navbar.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── AppointmentCard.jsx
│   │   │   ├── DoctorCard.jsx
│   │   │   └── VideoCall.jsx       # DailyProvider wrapper — swappable video impl
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx     # Static marketing + booking CTA
│   │   │   ├── auth/
│   │   │   │   ├── Login.jsx
│   │   │   │   └── Register.jsx
│   │   │   ├── patient/
│   │   │   │   ├── Dashboard.jsx   # Upcoming appointments + prescription list
│   │   │   │   ├── DoctorList.jsx  # Browse + filter doctors
│   │   │   │   ├── BookSlot.jsx    # Date picker + slot grid + confirm
│   │   │   │   └── VideoRoom.jsx   # Wraps VideoCall.jsx with patient token
│   │   │   ├── doctor/
│   │   │   │   ├── Dashboard.jsx   # Today's queue + join-call button
│   │   │   │   ├── Availability.jsx # Day-of-week schedule editor
│   │   │   │   ├── PrescriptionBuilder.jsx  # Post-call prescription form
│   │   │   │   └── VideoRoom.jsx   # Wraps VideoCall.jsx with doctor token
│   │   │   └── admin/
│   │   │       ├── DoctorApprovals.jsx   # Approve pending doctor accounts
│   │   │       └── MedicineCatalog.jsx   # CRUD medicine list
│   │   ├── context/
│   │   │   └── AuthContext.jsx     # { user, token, login(), logout() }
│   │   ├── App.jsx                 # react-router-dom routes + role guards
│   │   └── main.jsx                # Vite entry point
│   ├── .env                        # VITE_API_URL, VITE_DAILY_DOMAIN
│   ├── index.html
│   └── package.json
│
└── server/                         # Node.js + Express (deployed to Railway)
    ├── src/
    │   ├── routes/
    │   │   ├── auth.js             # /api/auth/*
    │   │   ├── doctors.js          # /api/doctors/* + /api/doctors/:id/slots
    │   │   ├── appointments.js     # /api/appointments/* + /api/appointments/:id/join
    │   │   ├── prescriptions.js    # /api/prescriptions/* + /api/patients/me/prescriptions
    │   │   ├── medicines.js        # /api/medicines
    │   │   └── admin.js            # /api/admin/*
    │   ├── services/
    │   │   ├── video.js            # createRoom(), createToken() — Daily.co REST calls
    │   │   ├── email.js            # 4 functions: sendBookingConfirmation, sendReminder24h,
    │   │   │                       #   sendReminder1h, sendPrescriptionReady — Resend SDK
    │   │   ├── pdf.js              # generatePrescriptionPdf() — PDFKit, writes to /uploads
    │   │   └── scheduler.js        # node-cron job: 24h + 1h reminder loops
    │   ├── middleware/
    │   │   └── auth.js             # verifyJWT(), requireRole(...roles)
    │   ├── lib/
    │   │   ├── prisma.js           # singleton PrismaClient export
    │   │   └── jwt.js              # signToken(), verifyToken() helpers
    │   ├── utils/
    │   │   └── slots.js            # generateSlots(availability, bookedDatetimes, date)
    │   └── app.js                  # Express init, cors(), route mounts, error handler
    ├── server.js                   # createServer(app) + scheduler.start()
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    ├── uploads/                    # Railway volume mount — rx-<id>.pdf files live here
    ├── .env
    └── package.json
```

---

## Key File Notes

| File | Role |
|---|---|
| `client/src/components/VideoCall.jsx` | The only file that touches Daily.co React SDK. Swapping to a different video provider means changing this file only. |
| `server/src/services/video.js` | The only file that calls Daily.co REST API. Same swap boundary on the server side. |
| `server/src/services/pdf.js` | Owns all PDFKit rendering logic. If prescription layout changes, this is the only file to touch. |
| `server/src/services/scheduler.js` | Owns the cron job. Started once in `server.js` at boot. |
| `server/src/lib/prisma.js` | Exports a singleton `PrismaClient`. All routes import from here — prevents connection proliferation. |
| `server/src/utils/slots.js` | Pure function — no DB calls, no side effects. Easy to unit test in v1.1. |

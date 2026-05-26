# 05 — API Surface

Base URL: `https://api.dermestha.com/api`  
Auth header: `Authorization: Bearer <jwt>` on all authenticated routes.  
Content-Type: `application/json` unless noted.

---

## Auth

```
POST /auth/register
  body: { email, password, name, role }
  → 201 { user, token }

POST /auth/login
  body: { email, password }
  → 200 { user, token }

GET  /auth/me
  auth: JWT
  → 200 { user }
```

---

## Doctors

```
GET  /doctors
  public
  → 200 [{ id, name, photoUrl, bio, specialization, fee, languages }]

GET  /doctors/:id
  public
  → 200 { doctor, availability[] }

GET  /doctors/:id/slots?date=YYYY-MM-DD
  public
  → 200 [{ datetime: ISO, available: bool }]
  note: 30-minute slots between doctor's startTime and endTime for the requested date
        datetime is UTC; client converts to PKT (UTC+5)

PUT  /doctors/:id/availability
  auth: DOCTOR
  body: [{ dayOfWeek: 0–6, startTime: "HH:MM", endTime: "HH:MM" }]
  → 200 { availability[] }
  note: upsert — replaces existing schedule for each dayOfWeek
```

---

## Appointments

```
POST  /appointments
  auth: PATIENT
  body: { doctorId, scheduledAt }
  → 201 { appointment }
  → 409 if slot already booked

GET   /appointments
  auth: PATIENT | DOCTOR
  → 200 [appointment]
  note: filtered by role — patient sees their own, doctor sees their queue

PATCH /appointments/:id/status
  auth: PATIENT
  body: { status: "CANCELLED" }
  → 200 { appointment }

POST  /appointments/:id/join
  auth: PATIENT | DOCTOR
  → 200 { token, url }
  note: token is a Daily.co meeting token scoped to this room
        is_owner=true for DOCTOR (host controls), false for PATIENT
```

---

## Prescriptions

```
POST /prescriptions
  auth: DOCTOR
  body: {
    appointmentId,
    notes?,
    medicines: [{
      medicineId?,    ← from catalogue
      customName?,    ← free-text if no medicineId
      dosage,
      duration,
      instructions?
    }]
  }
  → 201 { prescription, pdfUrl: "/api/prescriptions/<id>/pdf" }
  → 403 if appointment does not belong to this doctor

GET  /prescriptions/:id
  auth: PATIENT | DOCTOR
  → 200 { prescription }

GET  /prescriptions/:id/pdf
  auth: PATIENT | DOCTOR
  → file stream (Content-Type: application/pdf)

GET  /patients/me/prescriptions
  auth: PATIENT
  → 200 [prescription]
```

---

## Medicines

```
GET /medicines?q=<search>
  auth: DOCTOR
  → 200 [{ id, name, category }]
  note: searches active medicines only (isActive=true)
```

---

## Admin

```
GET   /admin/doctors/pending
  auth: ADMIN
  → 200 [doctor]   ← where isApproved=false

PATCH /admin/doctors/:id/approve
  auth: ADMIN
  → 200 { doctor }   ← sets isApproved=true

GET   /admin/medicines
  auth: ADMIN
  → 200 [medicine]   ← all medicines including inactive

POST  /admin/medicines
  auth: ADMIN
  body: { name, category? }
  → 201 { medicine }

PATCH /admin/medicines/:id
  auth: ADMIN
  body: { name?, category?, isActive? }
  → 200 { medicine }
```

---

## Error Responses

All errors return:
```json
{ "error": "<human-readable message>" }
```

| Status | Meaning |
|---|---|
| 400 | Validation failure (Zod) |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but wrong role or wrong resource owner |
| 404 | Resource not found |
| 409 | Conflict (e.g., slot already booked) |
| 503 | External service failure (Daily.co, Resend) |

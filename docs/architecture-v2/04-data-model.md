# 04 — Data Model

Copy-paste ready for `prisma/schema.prisma`.

---

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  PATIENT
  DOCTOR
  ADMIN
}

enum AppointmentStatus {
  PENDING
  CONFIRMED
  COMPLETED
  CANCELLED
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role
  createdAt    DateTime @default(now())
  patient      Patient?
  doctor       Doctor?
}

model Patient {
  id            String        @id @default(cuid())
  userId        String        @unique
  user          User          @relation(fields: [userId], references: [id])
  name          String
  phone         String?
  age           Int?
  gender        String?
  city          String?
  appointments  Appointment[]
  prescriptions Prescription[]
}

model Doctor {
  id             String               @id @default(cuid())
  userId         String               @unique
  user           User                 @relation(fields: [userId], references: [id])
  name           String
  photoUrl       String?
  bio            String?
  specialization String?
  fee            Decimal
  languages      String[]
  isApproved     Boolean              @default(false)
  availability   DoctorAvailability[]
  appointments   Appointment[]
  prescriptions  Prescription[]
}

model DoctorAvailability {
  id        String @id @default(cuid())
  doctorId  String
  doctor    Doctor @relation(fields: [doctorId], references: [id])
  dayOfWeek Int    // 0 = Sunday … 6 = Saturday
  startTime String // "09:00"
  endTime   String // "17:00"

  @@unique([doctorId, dayOfWeek])
}

model Appointment {
  id            String            @id @default(cuid())
  patientId     String
  patient       Patient           @relation(fields: [patientId], references: [id])
  doctorId      String
  doctor        Doctor            @relation(fields: [doctorId], references: [id])
  scheduledAt   DateTime
  status        AppointmentStatus @default(CONFIRMED)
  videoRoomUrl  String?
  videoRoomName String?
  notified24h   Boolean           @default(false)
  notified1h    Boolean           @default(false)
  prescription  Prescription?
  createdAt     DateTime          @default(now())
}

model Prescription {
  id            String                 @id @default(cuid())
  appointmentId String                 @unique
  appointment   Appointment            @relation(fields: [appointmentId], references: [id])
  patientId     String
  patient       Patient                @relation(fields: [patientId], references: [id])
  doctorId      String
  doctor        Doctor                 @relation(fields: [doctorId], references: [id])
  notes         String?
  pdfPath       String?
  medicines     PrescriptionMedicine[]
  createdAt     DateTime               @default(now())
}

model PrescriptionMedicine {
  id             String       @id @default(cuid())
  prescriptionId String
  prescription   Prescription @relation(fields: [prescriptionId], references: [id])
  medicineId     String?
  medicine       Medicine?    @relation(fields: [medicineId], references: [id])
  customName     String?      // populated when medicineId is null (free-text entry)
  dosage         String
  duration       String
  instructions   String?
}

model Medicine {
  id                    String                 @id @default(cuid())
  name                  String                 @unique
  category              String?
  isActive              Boolean                @default(true)
  prescriptionMedicines PrescriptionMedicine[]
}
```

---

## Entity Relationships

```
User ──1:1── Patient ──1:N── Appointment ──1:1── Prescription ──1:N── PrescriptionMedicine
                                                                             │
User ──1:1── Doctor ──1:N── DoctorAvailability                              └──N:1── Medicine
                  └──1:N── Appointment
```

**Key constraints:**
- `Appointment.appointmentId` is unique on `Prescription` — one appointment, one prescription
- `DoctorAvailability` has a unique constraint on `[doctorId, dayOfWeek]` — one schedule row per day per doctor
- `Medicine.name` is unique — prevents duplicate catalogue entries
- A `PrescriptionMedicine` row has either `medicineId` (catalogue pick) or `customName` (free-text) — not both

// @ts-check
//
// seed-baseline.js — reset the local dev DB to a small, stable, human-resettable baseline.
//
// PURPOSE
//   The dev DB accumulates test clutter. This script wipes every domain table (FK-safe order),
//   ensures Settings(id=1), and seeds exactly one simple, predictable baseline so a human (or a
//   later fix-and-test session) can return to a known state at any time.
//
// USAGE
//   node --env-file=.env prisma/scripts/seed-baseline.js
//
// BASELINE (password for ALL accounts: Test123!)
//   admin      baseline.admin@dermestha.test
//   superadmin baseline.superadmin@dermestha.test  (functional admin clone)
//   patient1   baseline.patient1@dermestha.test   (ToS-accepted)
//   patient2  baseline.patient2@dermestha.test   (ToS-accepted)  ← slot-lock race partner
//   doctor    baseline.doctor@dermestha.test     (active; weekly availability; pre-seeded appts)
//   medicine  "Baseline Acne Cream" (active)
//
//   Pre-seeded appointments on the baseline doctor (patient1), reflecting the manual-payment
//   3-state model (pending → confirmed, plus cancelled):
//     - 1 confirmed in the join window  (slot ~now+5m → "Join Call" active)
//     - 1 confirmed (past) + a linked prescription  (patient view-prescription + PDF flow)
//     - 1 pending with a paymentReference     (admin review queue → accept/reject)
//     - 1 cancelled                           (history view)
//
// NOTES
//   * Money is fully offline (manual bank transfer): there is no Payment table. The fee snapshot
//     lives on Appointment.feeAtBooking; the patient-entered bank reference is paymentReference.
//   * There is no `completed` state and no completion cron: a confirmed appointment stays confirmed,
//     and the doctor may write a prescription against it any time. The join-window appt is
//     intentionally near-future so its video-token window is valid; re-run this seed right before
//     exercising the join flow for the freshest window.

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../server/src/lib/password/password.js';

const prisma = new PrismaClient();

const PASSWORD = 'Test123!';
const EMAILS = {
  admin: 'baseline.admin@dermestha.test',
  superadmin: 'baseline.superadmin@dermestha.test',
  patient1: 'baseline.patient1@dermestha.test',
  patient2: 'baseline.patient2@dermestha.test',
  doctor: 'baseline.doctor@dermestha.test',
};

const MIN = 60 * 1000;
const DOCTOR_FEE = 250000; // Rs 2,500 (paisa)

const rel = (ms) => new Date(Date.now() + ms);
const slot = (offsetMin) => {
  const slotStart = rel(offsetMin * MIN);
  return { slotStart, slotEnd: new Date(slotStart.getTime() + 30 * MIN) };
};

/** Delete every domain row in FK-safe (child → parent) order. Full wipe — not scoped to test emails. */
async function wipeAll() {
  await prisma.prescriptionItem.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.notificationJob.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.availabilityBlock.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.medicine.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.session.deleteMany();
}

async function main() {
  await wipeAll();

  // Settings singleton (A6) — normalize lead-time + bank instructions on BOTH create and update so
  // the baseline is deterministic even when a pre-existing dev Settings row holds other values.
  const SETTINGS_DEFAULTS = {
    minBookingLeadMinutes: 60,
    bankName: 'Baseline Bank',
    bankAccountName: 'Dermestha Clinic',
    bankAccountNumber: '0001234567890',
    bankInstructions: 'Transfer the consultation fee, then enter your bank transaction reference.',
  };
  await prisma.settings.upsert({
    where: { id: 1 },
    update: SETTINGS_DEFAULTS,
    create: { id: 1, ...SETTINGS_DEFAULTS },
  });

  const passwordHash = await hashPassword(PASSWORD);

  const admin = await prisma.user.create({
    data: { role: 'admin', email: EMAILS.admin, fullName: 'Baseline Admin', passwordHash },
  });
  const superadmin = await prisma.user.create({
    data: { role: 'superadmin', email: EMAILS.superadmin, fullName: 'Baseline Superadmin', passwordHash },
  });
  const patient1 = await prisma.user.create({
    data: {
      role: 'patient',
      email: EMAILS.patient1,
      fullName: 'Baseline Patient One',
      phone: '03001112221',
      passwordHash,
      tosAcceptedAt: new Date(),
    },
  });
  const patient2 = await prisma.user.create({
    data: {
      role: 'patient',
      email: EMAILS.patient2,
      fullName: 'Baseline Patient Two',
      phone: '03001112222',
      passwordHash,
      tosAcceptedAt: new Date(),
    },
  });

  const doctorUser = await prisma.user.create({
    data: {
      role: 'doctor',
      email: EMAILS.doctor,
      fullName: 'Dr Baseline Derm',
      phone: '03001110000',
      passwordHash,
      mustChangePassword: false,
    },
  });
  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      pmcNumber: 'BASE-DOC-1',
      specialization: 'Acne & Pigmentation',
      fee: DOCTOR_FEE,
      bio: 'Baseline dermatologist for the flow-audit baseline.',
      isActive: true,
      status: 'active',
    },
  });
  // Broad weekly availability (all 7 days, 09:00–21:00) so a future bookable slot always exists
  // today and on upcoming days regardless of the current Karachi time-of-day.
  await prisma.availabilityBlock.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      doctorId: doctor.id,
      weekday,
      startTime: '09:00',
      endTime: '21:00',
    })),
  });

  const medicine = await prisma.medicine.create({
    data: {
      name: 'Baseline Acne Cream',
      genericName: 'Adapalene',
      dosageForms: ['cream'],
      unitPrice: 30000, // Rs 300
      isActive: true,
    },
  });

  // 1) confirmed in the join window (~now+5m): "Join Call" active now; row stays confirmed.
  const joinWindow = await prisma.appointment.create({
    data: {
      doctorId: doctor.id,
      patientUserId: patient1.id,
      ...slot(5),
      state: 'confirmed',
      feeAtBooking: DOCTOR_FEE,
      forSelf: true,
    },
  });

  // 2) confirmed (past slot) + a linked prescription (patient view-prescription + PDF flow).
  const rxAppt = await prisma.appointment.create({
    data: {
      doctorId: doctor.id,
      patientUserId: patient1.id,
      ...slot(-180),
      state: 'confirmed',
      feeAtBooking: DOCTOR_FEE,
      forSelf: true,
    },
  });
  await prisma.prescription.create({
    data: {
      appointmentId: rxAppt.id,
      doctorSnapshot: {
        name: doctorUser.fullName,
        pmcNumber: doctor.pmcNumber,
        specialization: doctor.specialization,
      },
      patientIdSnapshot: { forSelf: true, name: patient1.fullName },
      notes: 'Baseline prescription for the view/download flow.',
      items: {
        create: [
          {
            medicineName: medicine.name,
            dosage: 'Apply a thin layer',
            duration: '4 weeks',
            instructions: 'Once daily at night, after washing the face.',
            price: medicine.unitPrice,
          },
        ],
      },
    },
  });

  // 3) pending with a submitted bank reference → admin review queue (accept/reject).
  const pendingReview = await prisma.appointment.create({
    data: {
      doctorId: doctor.id,
      patientUserId: patient1.id,
      ...slot(180),
      state: 'pending',
      feeAtBooking: DOCTOR_FEE,
      forSelf: true,
      paymentReference: 'BASELINE-TXN-001',
      paymentSubmittedAt: new Date(),
    },
  });

  // 4) cancelled (history view).
  const cancelled = await prisma.appointment.create({
    data: {
      doctorId: doctor.id,
      patientUserId: patient1.id,
      ...slot(-300),
      state: 'cancelled',
      feeAtBooking: DOCTOR_FEE,
      forSelf: true,
    },
  });

  console.log('Baseline seeded. Password for ALL accounts: ' + PASSWORD);
  console.log(
    JSON.stringify(
      {
        accounts: {
          admin: EMAILS.admin,
          superadmin: EMAILS.superadmin,
          patient1: EMAILS.patient1,
          patient2: EMAILS.patient2,
          doctor: EMAILS.doctor,
        },
        ids: {
          adminId: admin.id,
          superadminId: superadmin.id,
          patient1Id: patient1.id,
          patient2Id: patient2.id,
          doctorId: doctor.id,
          medicineId: medicine.id,
        },
        appts: {
          joinWindow: joinWindow.id,
          confirmedWithPrescription: rxAppt.id,
          pendingReview: pendingReview.id,
          cancelled: cancelled.id,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

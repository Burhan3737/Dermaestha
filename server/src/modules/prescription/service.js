// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { env } from '../../config/env/env.js';
import * as appointmentState from '../appointment/service.js';
import * as notification from '../notification/service.js';

/** Owner gate (404-no-leak, same answer as a missing appointment). */
async function ownedAppointment(appointmentId, doctorUserId) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: doctorUserId },
    select: { id: true, pmcNumber: true, specialization: true, user: { select: { fullName: true } } },
  });
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: { select: { email: true, fullName: true } } },
  });
  if (!doctor || !appt || appt.doctorId !== doctor.id) {
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  return { doctor, appt };
}

/**
 * Immutable submit (F08.02). One $transaction: create + items → first-issue transition →
 * prescription_ready outbox row (dedupeKey = prescription id, so corrections email too).
 * NO update/delete function exists in this module — immutability by absence (§3.3 #4).
 * @param {{ appointmentId: string, doctorUserId: string,
 *   items: Array<{ medicineId?: string, medicineName?: string, dosage: string,
 *     duration: string, instructions: string }>, notes?: string, followUpDate?: string }} args
 */
export async function submit({ appointmentId, doctorUserId, items, notes, followUpDate }) {
  const { doctor, appt } = await ownedAppointment(appointmentId, doctorUserId);
  // Completed-Gate Rule + Chronological Corrections Rule (policy #9).
  if (appt.state !== 'completed' && appt.state !== 'prescription_issued') {
    throw new AppError('INVALID_STATE', 'Prescription requires a completed consultation.', 409);
  }

  // Medicine Snapshot Rule (#5): name+price resolved server-side; client prices never trusted.
  // A deactivated medicine still resolves — deactivation only hides it from the dropdown.
  const ids = items.filter((i) => i.medicineId).map((i) => i.medicineId);
  const meds = ids.length ? await prisma.medicine.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(meds.map((m) => [m.id, m]));
  const itemRows = items.map((i) => {
    if (i.medicineId) {
      const m = byId.get(i.medicineId);
      if (!m) throw new AppError('VALIDATION', `Unknown medicine: ${i.medicineId}`, 400);
      return {
        medicineName: m.name,
        dosage: i.dosage,
        duration: i.duration,
        instructions: i.instructions,
        price: m.unitPrice,
      };
    }
    return {
      medicineName: i.medicineName,
      dosage: i.dosage,
      duration: i.duration,
      instructions: i.instructions,
      price: null,
    };
  });

  // Identity snapshots (#3 / Identity Snapshot Rule): durable copies at issue-time.
  const doctorSnapshot = {
    name: doctor.user.fullName,
    pmcNumber: doctor.pmcNumber,
    specialization: doctor.specialization,
  };
  const patientIdSnapshot = appt.forSelf
    ? { forSelf: true, name: appt.patient.fullName }
    : {
        forSelf: false,
        name: appt.subjectName,
        age: appt.subjectAge,
        relation: appt.subjectRelation,
      };

  return prisma.$transaction(async (tx) => {
    const created = await tx.prescription.create({
      data: {
        appointmentId,
        doctorSnapshot,
        patientIdSnapshot,
        notes: notes ?? null,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        items: { create: itemRows },
      },
      include: { items: true },
    });
    if (appt.state === 'completed') {
      await appointmentState.transition({
        appointmentId,
        to: 'prescription_issued',
        actorType: 'doctor',
        actorId: doctorUserId,
        client: tx,
      });
    }
    await notification.enqueue({
      type: 'prescription_ready',
      appointmentId,
      recipientEmail: appt.patient.email,
      scheduledFor: new Date(),
      dedupeKey: created.id,
      vars: {
        patientName: appt.patient.fullName,
        doctorName: doctor.user.fullName,
        prescriptionUrl: `${env.APP_BASE_URL}/appointments/${appointmentId}/prescriptions`,
      },
      client: tx,
    });
    return created;
  });
}

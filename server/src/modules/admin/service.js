// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import * as audit from '../../services/audit/audit.service.js';
import { karachiWallTimeToUtc } from '../../lib/tz/tz.js';

/** Doc-02 F13.01 record row. The settled money figures come from the SUCCESS payment row
 *  (PaymentStatus enum: pending|success|failed — there is no "paid"). */
const toRecordRow = (a) => {
  const paid = a.payments.find((p) => p.status === 'success');
  return {
    id: a.id,
    slotStart: a.slotStart,
    slotEnd: a.slotEnd,
    state: a.state,
    disputed: a.disputed,
    patientName: a.patient.fullName,
    patientEmail: a.patient.email,
    subjectName: a.forSelf ? null : a.subjectName,
    doctorName: a.doctor.user.fullName,
    amountPaid: paid?.amount ?? null,
    paymentRef: paid?.providerRef ?? null,
    refundRef: paid?.refundRef ?? null,
  };
};

/** F13.01: unified, filtered, paginated, newest-first. Read-only projection.
 *  `from`/`to` are "YYYY-MM-DD" Karachi calendar dates (inclusive both ends):
 *  from maps to start-of-day Karachi (gte), to maps to start-of-next-day Karachi (lt). */
export async function listRecords({
  page = 1,
  pageSize = 20,
  patient,
  doctorName,
  appointmentId,
  paymentRef,
  state,
  from,
  to,
} = {}) {
  const where = {
    ...(appointmentId ? { id: appointmentId } : {}),
    ...(state ? { state } : {}),
    ...(patient
      ? {
          patient: {
            OR: [
              { email: { contains: patient, mode: 'insensitive' } },
              { phone: { contains: patient } },
            ],
          },
        }
      : {}),
    ...(doctorName
      ? { doctor: { user: { fullName: { contains: doctorName, mode: 'insensitive' } } } }
      : {}),
    ...(paymentRef
      ? { payments: { some: { OR: [{ providerRef: paymentRef }, { refundRef: paymentRef }] } } }
      : {}),
    ...(from || to
      ? {
          slotStart: {
            ...(from ? { gte: karachiWallTimeToUtc(from, '00:00') } : {}),
            ...(to ? { lt: new Date(karachiWallTimeToUtc(to, '00:00').getTime() + 24 * 60 * 60 * 1000) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.appointment.findMany({
      where,
      orderBy: { slotStart: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { fullName: true, email: true } },
        doctor: { select: { user: { select: { fullName: true } } } },
        payments: {
          select: { status: true, amount: true, providerRef: true, refundRef: true, refundStatus: true },
        },
      },
    }),
    prisma.appointment.count({ where }),
  ]);
  return { data: rows.map(toRecordRow), page: { number: page, size: pageSize, total } };
}

/** F13.02: one appointment with its full transition history (audit), prescriptions, email jobs. */
export async function getRecordDetail(appointmentId) {
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { fullName: true, email: true } },
      doctor: { select: { user: { select: { fullName: true } } } },
      payments: true,
      prescriptions: { include: { items: true }, orderBy: { issuedAt: 'asc' } },
      notificationJobs: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!a) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  const history = await prisma.auditLog.findMany({
    where: { targetRef: appointmentId },
    orderBy: { at: 'asc' },
  });
  const { prescriptions, notificationJobs, ...appointment } = a;
  return { appointment: { ...appointment, ...toRecordRow(a) }, history, prescriptions, notificationJobs };
}

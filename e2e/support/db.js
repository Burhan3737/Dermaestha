// @ts-check
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../server/src/lib/password/password.js';

export const prisma = new PrismaClient();

export const PASSWORD = 'E2ePassw0rd!';
export const EMAILS = {
  admin: 'e2e.admin@dermestha.test',
  patient: 'e2e.patient@dermestha.test',
  patient2: 'e2e.patient2@dermestha.test',
  doctor: 'e2e.doctor@dermestha.test',
  cancelDoctor: 'e2e.cancel@dermestha.test',
  da3doctor: 'e2e.da3doctor@dermestha.test',
};
const MEDICINE = 'E2E Acne Cream';

const MIN = 60 * 1000;
const rel = (ms) => new Date(Date.now() + ms);

/** Karachi weekday (0=Sun..6=Sat) + a today availability window guaranteeing a future bookable slot. */
function todayWindow() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[parts.weekday];
  // Start ~45m ahead, rounded up to the next :00/:30 boundary.
  let h = Number(parts.hour);
  let m = Number(parts.minute) + 45;
  h += Math.floor(m / 60);
  m %= 60;
  if (m === 0) {
    // already on the hour
  } else if (m <= 30) {
    m = 30;
  } else {
    m = 0;
    h += 1;
  }
  const startTime = `${String(Math.min(h, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { weekday, startTime, endTime: '23:30' };
}

/** Delete every row owned by an `*@dermestha.test` user, in FK-safe order. Idempotent. */
export async function resetE2eData() {
  const users = await prisma.user.findMany({
    where: { email: { contains: '@dermestha.test' } },
    select: { id: true, doctor: { select: { id: true } } },
  });
  const userIds = users.map((u) => u.id);
  const doctorIds = users.map((u) => u.doctor?.id).filter(Boolean);
  if (userIds.length === 0 && doctorIds.length === 0) return;

  const appts = await prisma.appointment.findMany({
    where: { OR: [{ patientUserId: { in: userIds } }, { doctorId: { in: doctorIds } }] },
    select: { id: true },
  });
  const apptIds = appts.map((a) => a.id);
  const prescriptions = await prisma.prescription.findMany({
    where: { appointmentId: { in: apptIds } },
    select: { id: true },
  });
  const presIds = prescriptions.map((p) => p.id);

  await prisma.prescriptionItem.deleteMany({ where: { prescriptionId: { in: presIds } } });
  await prisma.prescription.deleteMany({ where: { id: { in: presIds } } });
  await prisma.notificationJob.deleteMany({ where: { appointmentId: { in: apptIds } } });
  await prisma.payment.deleteMany({ where: { appointmentId: { in: apptIds } } });
  await prisma.appointment.deleteMany({ where: { id: { in: apptIds } } });
  await prisma.availabilityBlock.deleteMany({ where: { doctorId: { in: doctorIds } } });
  await prisma.doctor.deleteMany({ where: { id: { in: doctorIds } } });
  await prisma.medicine.deleteMany({ where: { name: MEDICINE } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function makeDoctor({ email, pmc, fee, fullName, spec, active, mustChange = false, blocks = [] }) {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      role: 'doctor',
      email,
      fullName,
      phone: '03001110000',
      passwordHash,
      mustChangePassword: mustChange,
    },
  });
  const doctor = await prisma.doctor.create({
    data: {
      userId: user.id,
      pmcNumber: pmc,
      specialization: spec,
      fee,
      bio: `${fullName} bio.`,
      isActive: active,
      status: active ? 'active' : 'pending',
    },
  });
  if (blocks.length) {
    await prisma.availabilityBlock.createMany({
      data: blocks.map((b) => ({ doctorId: doctor.id, ...b })),
    });
  }
  return { user, doctor };
}

async function seedAppointment({ doctorId, patientUserId, startMs, state, fee, docJoin, patJoin }) {
  const slotStart = rel(startMs);
  const slotEnd = new Date(slotStart.getTime() + 30 * MIN);
  return prisma.appointment.create({
    data: {
      doctorId,
      patientUserId,
      slotStart,
      slotEnd,
      state,
      feeAtBooking: fee,
      forSelf: true,
      doctorJoinedAt: docJoin ? new Date(slotStart.getTime() + MIN) : null,
      patientJoinedAt: patJoin ? new Date(slotStart.getTime() + MIN) : null,
    },
  });
}

/** Seed all deterministic data. Returns the id map persisted to .seed-ids.json. */
export async function seedAll() {
  const passwordHash = await hashPassword(PASSWORD);
  const admin = await prisma.user.create({
    data: {
      role: 'admin',
      email: EMAILS.admin,
      fullName: 'E2E Admin',
      passwordHash,
      mustChangePassword: false,
    },
  });
  const patient = await prisma.user.create({
    data: {
      role: 'patient',
      email: EMAILS.patient,
      fullName: 'E2E Patient',
      phone: '03002220000',
      passwordHash,
      mustChangePassword: false,
      tosAcceptedAt: new Date(),
    },
  });
  const patient2 = await prisma.user.create({
    data: {
      role: 'patient',
      email: EMAILS.patient2,
      fullName: 'E2E Patient Two',
      phone: '03002220001',
      passwordHash,
      mustChangePassword: false,
      tosAcceptedAt: new Date(),
    },
  });

  const D = await makeDoctor({
    email: EMAILS.doctor,
    pmc: 'E2E-DOC-1',
    fee: 250000,
    fullName: 'Dr E2E Primary',
    spec: 'E2E Dermatology',
    active: true,
    blocks: [todayWindow()],
  });
  const Dc = await makeDoctor({
    email: EMAILS.cancelDoctor,
    pmc: 'E2E-DOC-2',
    fee: 500000,
    fullName: 'Dr E2E Cancel',
    spec: 'E2E Refunds',
    active: true,
  });
  await makeDoctor({
    email: EMAILS.da3doctor,
    pmc: 'E2E-DOC-3',
    fee: 250000,
    fullName: 'Dr E2E DA3',
    spec: 'E2E Onboarding',
    active: true,
    mustChange: true,
  });
  await prisma.medicine.create({
    data: {
      name: MEDICINE,
      genericName: 'E2E Generic',
      dosageForms: ['cream'],
      unitPrice: 30000,
      isActive: true,
    },
  });

  const did = D.doctor.id;
  const pid = patient.id;

  const inprogress = await seedAppointment({ doctorId: did, patientUserId: pid, startMs: -2 * MIN, state: 'confirmed', fee: 250000 });
  const completed = await seedAppointment({ doctorId: did, patientUserId: pid, startMs: -45 * MIN, state: 'confirmed', fee: 250000, docJoin: true, patJoin: true });
  const docNoShow = await seedAppointment({ doctorId: did, patientUserId: pid, startMs: -50 * MIN, state: 'confirmed', fee: 250000 });
  const patNoShow = await seedAppointment({ doctorId: did, patientUserId: pid, startMs: -55 * MIN, state: 'confirmed', fee: 250000, docJoin: true });
  const liveJoin = await seedAppointment({ doctorId: did, patientUserId: pid, startMs: -1 * MIN, state: 'confirmed', fee: 250000 });
  const presAppt = await seedAppointment({ doctorId: did, patientUserId: pid, startMs: -180 * MIN, state: 'completed', fee: 250000, docJoin: true, patJoin: true });

  const free = await seedAppointment({ doctorId: Dc.doctor.id, patientUserId: pid, startMs: 180 * MIN, state: 'confirmed', fee: 500000 });
  await prisma.payment.create({
    data: {
      appointmentId: free.id,
      patientUserId: pid,
      slotStart: free.slotStart,
      amount: 500000,
      gatewayFee: 12500,
      status: 'success',
      providerRef: `e2e_free_${free.id}`,
    },
  });
  const late = await seedAppointment({ doctorId: Dc.doctor.id, patientUserId: pid, startMs: 60 * MIN, state: 'confirmed', fee: 600000 });
  await prisma.payment.create({
    data: {
      appointmentId: late.id,
      patientUserId: pid,
      slotStart: late.slotStart,
      amount: 600000,
      gatewayFee: 15000,
      status: 'success',
      providerRef: `e2e_late_${late.id}`,
    },
  });

  return {
    doctorId: did,
    doctorEmail: EMAILS.doctor,
    patientId: pid,
    patient2Id: patient2.id,
    adminId: admin.id,
    appts: {
      inprogress: inprogress.id,
      completed: completed.id,
      docNoShow: docNoShow.id,
      patNoShow: patNoShow.id,
      liveJoin: liveJoin.id,
      prescription: presAppt.id,
      free: free.id,
      late: late.id,
    },
  };
}

export async function readAppointmentState(id) {
  return prisma.appointment.findUnique({
    where: { id },
    select: { state: true, doctorJoinedAt: true, patientJoinedAt: true },
  });
}

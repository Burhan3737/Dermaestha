// @ts-check
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import * as state from './appointmentState.service.js';
import { safeRefund } from './refundSideEffects.js';
import * as audit from './audit.service.js';
import { emailProvider } from '../integrations/email/index.js';
import { NO_SHOW_GRACE_MIN, VIDEO_TOKEN_POST_MIN } from '../config/constants.js';

/** Pure-ish, clock-injected, catch-up-safe. The ONLY transitions are via state.transition. */
export async function evaluateDueAppointments(now = new Date()) {
  await activateDue(now);
  await resolveInProgress(now);
}

async function activateDue(now) {
  const due = await prisma.appointment.findMany({
    where: { state: 'confirmed', slotStart: { lte: now } },
  });
  for (const a of due) {
    await state.transition({ appointmentId: a.id, to: 'in_progress', actorType: 'system' });
  }
}

async function resolveInProgress(now) {
  const open = await prisma.appointment.findMany({ where: { state: 'in_progress' } });
  for (const a of open) {
    const graceEnd = a.slotStart.getTime() + NO_SHOW_GRACE_MIN * 60000;
    const hardCutoff = a.slotEnd.getTime() + VIDEO_TOKEN_POST_MIN * 60000;
    const both = a.doctorJoinedAt && a.patientJoinedAt;
    const t = now.getTime();
    if (t >= hardCutoff) {
      if (both) {
        await state.transition({ appointmentId: a.id, to: 'completed', actorType: 'system' });
      } else {
        await resolveNoShow(a, true);
      }
    } else if (t >= graceEnd && !both) {
      await resolveNoShow(a, false);
    }
  }
}

async function resolveNoShow(a, atCutoff) {
  // ADR-12 precedence: doctor never joined → doctor_no_show (whether or not patient joined).
  const to = !a.doctorJoinedAt ? 'doctor_no_show' : 'patient_no_show';
  await state.transition({ appointmentId: a.id, to, actorType: 'system' });
  if (to === 'doctor_no_show') {
    await safeRefund(a.id);
    await sendApology(a.patientUserId, a.id).catch(() => {});
    if (atCutoff && !a.doctorJoinedAt && !a.patientJoinedAt) {
      await audit
        .record({
          eventType: 'appointment.evaluation_data_gap', actorType: 'system',
          targetRef: a.id, reason: 'no join data at slot-end+5m; resolved non-penalizing',
        })
        .catch(() => {});
    }
  }
}

async function sendApology(patientUserId, appointmentId) {
  const patient = await prisma.user.findUnique({
    where: { id: patientUserId }, select: { email: true, fullName: true },
  });
  if (!patient) return;
  try {
    await emailProvider.send({
      template: 'cancellation_apology', to: patient.email,
      vars: { patientName: patient.fullName, appointmentRef: appointmentId },
    });
  } catch {
    logger.warn('no-show apology email not sent', { appointmentId });
  }
}

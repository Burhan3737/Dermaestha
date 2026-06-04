// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import * as audit from './audit.service.js';

/** Legal transitions (doc 05 §5). Slice C: slot_locked/confirmed entries. Slice D: added in_progress. */
const LEGAL = {
  slot_locked: new Set(['confirmed']),
  confirmed: new Set(['cancelled_refunded', 'cancelled_no_refund', 'doctor_cancelled', 'in_progress']),
  in_progress: new Set(['completed', 'patient_no_show', 'doctor_no_show']),
};

/**
 * The ONLY writer of Appointment.state. Validates from→to, applies extra column data,
 * and appends the audit entry (using the same client, so it is atomic inside a $transaction).
 * @param {{ appointmentId: string, to: string,
 *   actorType: 'patient'|'doctor'|'system', actorId?: string|null, reason?: string|null,
 *   data?: object, client?: any }} args
 */
export async function transition({
  appointmentId,
  to,
  actorType,
  actorId = null,
  reason = null,
  data = {},
  client = prisma,
}) {
  const appt = await client.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  const allowed = LEGAL[appt.state];
  if (!allowed || !allowed.has(to)) {
    throw new AppError('INVALID_TRANSITION', `Cannot move ${appt.state} → ${to}.`, 409);
  }
  const updated = await client.appointment.update({
    where: { id: appointmentId },
    data: { state: to, ...data },
  });
  await audit.record(
    { eventType: `appointment.${to}`, actorType, actorId, targetRef: appointmentId, reason },
    client,
  );
  return updated;
}

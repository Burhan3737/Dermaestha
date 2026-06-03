import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { appointment: { findUnique: vi.fn() }, doctor: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } },
}));
vi.mock('./appointmentState.service.js', () => ({ transition: vi.fn().mockResolvedValue({}) }));
vi.mock('./refund.service.js', () => ({ initiateRefund: vi.fn().mockResolvedValue({ refundRef: 'r', status: 'settled' }) }));
vi.mock('../integrations/email/index.js', () => ({ emailProvider: { send: vi.fn().mockResolvedValue({ providerId: 'x' }) } }));

import { prisma } from '../lib/prisma.js';
import * as state from './appointmentState.service.js';
import * as refund from './refund.service.js';
import { cancel } from './cancellation.service.js';

const future = (mins) => new Date(Date.now() + mins * 60000);
beforeEach(() => vi.clearAllMocks());

describe('cancellation.cancel', () => {
  it('patient ≥2h before → cancelled_refunded + refund', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', patientUserId: 'u1', slotStart: future(180) });
    const out = await cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' });
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ to: 'cancelled_refunded' }));
    expect(refund.initiateRefund).toHaveBeenCalledWith({ appointmentId: 'a1' });
    expect(out.state).toBe('cancelled_refunded');
  });

  it('patient <2h before → cancelled_no_refund, no refund', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', patientUserId: 'u1', slotStart: future(60) });
    const out = await cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' });
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ to: 'cancelled_no_refund' }));
    expect(refund.initiateRefund).not.toHaveBeenCalled();
    expect(out.state).toBe('cancelled_no_refund');
  });

  it('doctor cancel → doctor_cancelled + refund (reason required)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', doctorId: 'd1', patientUserId: 'u1', slotStart: future(30) });
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    const out = await cancel({ appointmentId: 'a1', actorType: 'doctor', actorId: 'docUser', reason: 'sick' });
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ to: 'doctor_cancelled', reason: 'sick' }));
    expect(refund.initiateRefund).toHaveBeenCalled();
    expect(out.state).toBe('doctor_cancelled');
  });

  it('doctor cancel without a reason → 400', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', doctorId: 'd1', slotStart: future(30) });
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    await expect(cancel({ appointmentId: 'a1', actorType: 'doctor', actorId: 'docUser' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('patient cancelling someone else\'s appointment → 404', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', patientUserId: 'other', slotStart: future(180) });
    await expect(cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('cancelling a non-confirmed appointment → 409', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'slot_locked', patientUserId: 'u1', slotStart: future(180) });
    await expect(cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' }))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });
});

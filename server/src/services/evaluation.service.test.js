import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    appointment: { findMany: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ email: 'p@x', fullName: 'Pat' }) },
  },
}));
vi.mock('./appointmentState.service.js', () => ({ transition: vi.fn().mockResolvedValue({}) }));
vi.mock('./refundSideEffects.js', () => ({ safeRefund: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));
vi.mock('../integrations/email/index.js', () => ({
  emailProvider: { send: vi.fn().mockResolvedValue({}) },
}));

import { prisma } from '../lib/prisma.js';
import * as state from './appointmentState.service.js';
import { safeRefund } from './refundSideEffects.js';
import * as audit from './audit.service.js';
import { emailProvider } from '../integrations/email/index.js';
import { evaluateDueAppointments } from './evaluation.service.js';

const start = new Date('2026-06-04T10:00:00.000Z');
const end = new Date('2026-06-04T10:30:00.000Z');
function mockQueues({ confirmed = [], inProgress = [] }) {
  prisma.appointment.findMany.mockImplementation(({ where }) =>
    Promise.resolve(where.state === 'confirmed' ? confirmed : inProgress),
  );
}
beforeEach(() => vi.clearAllMocks());

describe('evaluateDueAppointments', () => {
  it('activates confirmed appts whose slot has started', async () => {
    mockQueues({ confirmed: [{ id: 'a1', slotStart: start, slotEnd: end }] });
    await evaluateDueAppointments(new Date('2026-06-04T10:00:30.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'in_progress', actorType: 'system' }),
    );
  });

  it('marks doctor_no_show at grace when doctor never joined', async () => {
    mockQueues({
      inProgress: [
        {
          id: 'a1',
          slotStart: start,
          slotEnd: end,
          doctorJoinedAt: null,
          patientJoinedAt: start,
          patientUserId: 'p1',
        },
      ],
    });
    await evaluateDueAppointments(new Date('2026-06-04T10:16:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'doctor_no_show' }),
    );
    expect(safeRefund).toHaveBeenCalledWith('a1');
  });

  it('marks patient_no_show at grace when doctor joined but patient did not', async () => {
    mockQueues({
      inProgress: [
        {
          id: 'a1',
          slotStart: start,
          slotEnd: end,
          doctorJoinedAt: start,
          patientJoinedAt: null,
          patientUserId: 'p1',
        },
      ],
    });
    await evaluateDueAppointments(new Date('2026-06-04T10:16:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'patient_no_show' }),
    );
    expect(safeRefund).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('completes at slot-end+5 when both joined', async () => {
    mockQueues({
      inProgress: [
        {
          id: 'a1',
          slotStart: start,
          slotEnd: end,
          doctorJoinedAt: start,
          patientJoinedAt: start,
          patientUserId: 'p1',
        },
      ],
    });
    await evaluateDueAppointments(new Date('2026-06-04T10:36:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'completed' }),
    );
  });

  it('at the hard cutoff resolves a never-joined appt to doctor_no_show + a data-gap alert', async () => {
    mockQueues({
      inProgress: [
        {
          id: 'a1',
          slotStart: start,
          slotEnd: end,
          doctorJoinedAt: null,
          patientJoinedAt: null,
          patientUserId: 'p1',
        },
      ],
    });
    await evaluateDueAppointments(new Date('2026-06-04T10:36:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'doctor_no_show' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'appointment.evaluation_data_gap' }),
    );
  });

  it('does nothing before the grace window', async () => {
    mockQueues({
      inProgress: [
        { id: 'a1', slotStart: start, slotEnd: end, doctorJoinedAt: null, patientJoinedAt: null },
      ],
    });
    await evaluateDueAppointments(new Date('2026-06-04T10:05:00.000Z'));
    expect(state.transition).not.toHaveBeenCalled();
  });
});

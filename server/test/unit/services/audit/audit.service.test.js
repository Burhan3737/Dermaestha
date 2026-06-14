import { describe, it, expect, afterAll, vi } from 'vitest';
import { prisma } from '#src/lib/prisma/prisma.js';
import * as audit from '#src/services/audit/audit.service.js';
import { record } from '#src/services/audit/audit.service.js';

describe('audit.service', () => {
  it('appends an event row', async () => {
    const before = await prisma.auditLog.count();
    await audit.record({
      eventType: 'test_event',
      actorType: 'system',
      targetRef: 'ref-1',
      reason: 'unit test',
    });
    expect(await prisma.auditLog.count()).toBe(before + 1);
  });
  it('exposes no update or delete function (append-only, §3.6)', () => {
    expect(/** @type {any} */ (audit).update).toBeUndefined();
    expect(/** @type {any} */ (audit).remove).toBeUndefined();
    expect(/** @type {any} */ (audit).delete).toBeUndefined();
  });
  it('record uses the provided client when given (tx support)', async () => {
    const fakeClient = { auditLog: { create: vi.fn().mockResolvedValue({ id: 'a1' }) } };
    await record(
      { eventType: 'appointment.confirmed', actorType: 'system', targetRef: 'appt1' },
      fakeClient,
    );
    expect(fakeClient.auditLog.create).toHaveBeenCalledOnce();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
});

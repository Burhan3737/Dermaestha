import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import * as audit from './audit.service.js';

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
  afterAll(async () => {
    await prisma.$disconnect();
  });
});

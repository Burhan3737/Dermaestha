// @ts-check
import { prisma } from '../lib/prisma.js';

/**
 * The single append-only audit writer (§3.6). No update/delete is exported — by convention,
 * there is no path to mutate the log at the service or route layer.
 * @param {{ eventType: string, actorType: 'patient'|'doctor'|'admin'|'system',
 *           actorId?: string|null, targetRef?: string|null, reason?: string|null, meta?: object }} e
 */
export function record(e) {
  return prisma.auditLog.create({
    data: {
      eventType: e.eventType,
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      targetRef: e.targetRef ?? null,
      reason: e.reason ?? null,
      meta: e.meta ?? undefined,
    },
  });
}

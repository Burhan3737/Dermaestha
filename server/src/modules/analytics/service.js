// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { logger } from '../../lib/logger/logger.js';

/**
 * Best-effort analytics writer (doc 14 §6). NEVER throws into a request/worker path.
 * @param {{ type: string, networkType?: string|null, meta?: object|null }} e
 */
export async function record({ type, networkType, meta }) {
  try {
    await prisma.analyticsEvent.create({
      data: { type, networkType: networkType ?? null, meta: meta ?? undefined },
    });
  } catch (err) {
    logger.error('analytics.record failed', { type, err: String(err) });
  }
}

// @ts-check
import { prisma } from '../prisma/prisma.js';

/**
 * Idempotent Settings(id=1) bootstrap (doc 10 §3). Runs at boot so a fresh DB serves
 * GET/PUT /api/admin/settings without the null/throw trap. Schema defaults fill the row.
 * @param {{ settings: { upsert: Function } }} [client]
 */
export function ensureSettings(client = prisma) {
  return client.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

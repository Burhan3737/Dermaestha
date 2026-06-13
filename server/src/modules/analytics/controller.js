// @ts-check
import * as analytics from './service.js';

/** POST /api/analytics/events — body is already Zod-validated to the closed catalog. */
export async function ingest(req, res) {
  const { type, networkType, meta } = req.body;
  const userId = req.session?.userId;
  const fullMeta = userId ? { ...(meta ?? {}), userId } : meta;
  await analytics.record({ type, networkType, meta: fullMeta });
  res.status(202).json({ ok: true });
}

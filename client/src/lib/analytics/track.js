// @ts-check
import { api } from '../apiClient/apiClient.js';

/**
 * Fire-and-forget analytics emit (KPI #3). Owned by S3; reused by S4/S6.
 * No-ops cleanly until S6 ships `POST /api/analytics/events`.
 * NOTE: apiClient prepends `/api`, so the path here is `/analytics/events`.
 * @param {string} type  doc 14 §6 catalog type
 * @param {Record<string, unknown>} [meta]
 */
export function track(type, meta = {}) {
  const networkType = navigator.connection?.effectiveType ?? 'unknown';
  api.post('/analytics/events', { type, networkType, meta }).catch(() => {});
}

// @ts-check
import { logger } from '../lib/logger.js';
import * as refund from './refund.service.js';
import * as audit from './audit.service.js';

/** Best-effort refund: never throws; logs + audits failures for reconciliation. */
export async function safeRefund(appointmentId) {
  try {
    await refund.initiateRefund({ appointmentId });
  } catch (e) {
    logger.warn('refund initiation failed (will be reconciled)', { appointmentId, err: String(e) });
    await audit
      .record({
        eventType: 'payment.refund_failed',
        actorType: 'system',
        targetRef: appointmentId,
        reason: String(e?.message ?? e),
      })
      .catch(() => {});
  }
}

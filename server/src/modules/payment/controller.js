// @ts-check
import { paymentProvider } from '../../integrations/payment/index.js';
import * as paymentService from './service.js';
import * as audit from '../../services/audit/audit.service.js';
import { AppError } from '../../http/AppError.js';
import { logger } from '../../lib/logger/logger.js';

export async function payfast(req, res, next) {
  let result;
  try {
    result = paymentProvider.verifyWebhook(req); // throws AppError(INVALID_SIGNATURE, 401) on bad sig
  } catch (e) {
    logger.warn('payfast webhook signature rejected');
    await audit
      .record({
        eventType: 'payment.webhook_rejected',
        actorType: 'system',
        reason: 'bad signature',
      })
      .catch(() => {});
    return next(
      e instanceof AppError ? e : new AppError('INVALID_SIGNATURE', 'Webhook rejected.', 401),
    );
  }
  try {
    await paymentService.processWebhook(result);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function verifyReturn(req, res, next) {
  let result;
  try {
    result = paymentProvider.verifyReturn(req); // throws AppError(INVALID_SIGNATURE, 401) on bad sig
  } catch (e) {
    logger.warn('payfast return signature rejected');
    await audit
      .record({
        eventType: 'payment.webhook_rejected',
        actorType: 'system',
        reason: 'bad signature (return)',
      })
      .catch(() => {});
    return next(
      e instanceof AppError ? e : new AppError('INVALID_SIGNATURE', 'Return rejected.', 401),
    );
  }
  try {
    await paymentService.processWebhook(result);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

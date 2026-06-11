// @ts-check
import cron from 'node-cron';
import { evaluateDueAppointments, retryDueRefunds } from '../modules/appointment/service.js';
import { dispatchDueNotifications } from '../modules/notification/service.js';
import { reconcileUnconfirmed } from '../modules/payment/service.js';
import { logger } from '../lib/logger/logger.js';

const tick = (name, fn) => async () => {
  try {
    await fn(new Date());
  } catch (e) {
    logger.error(`${name} tick failed`, { err: String(e) });
  }
};

/** Start in-process workers (ADR-08). Single-instance; no leader election (doc 15 §3). */
export function startWorkers() {
  cron.schedule('* * * * *', tick('appointment-evaluation', evaluateDueAppointments));
  cron.schedule('* * * * *', tick('notification-dispatch', dispatchDueNotifications));
  cron.schedule('* * * * *', tick('refund-retry', retryDueRefunds));
  cron.schedule('0 * * * *', tick('payment-reconciliation', reconcileUnconfirmed));
  logger.info(
    'workers started: appointment-evaluation, notification-dispatch, refund-retry (* * * * *); payment-reconciliation (0 * * * *)',
  );
}

// @ts-check
import cron from 'node-cron';
import { dispatchDueNotifications } from '../modules/notification/service.js';
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
  cron.schedule('* * * * *', tick('notification-dispatch', dispatchDueNotifications));
  logger.info('workers started: notification-dispatch (* * * * *)');
}

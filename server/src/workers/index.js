// @ts-check
import cron from 'node-cron';
import { evaluateDueAppointments } from '../modules/appointment/service.js';
import { logger } from '../lib/logger/logger.js';

/**
 * Start in-process workers (ADR-08). Single-instance; no leader election (doc 15 §3).
 * The deferred notification + reconciliation workers register here later.
 */
export function startWorkers() {
  cron.schedule('* * * * *', async () => {
    try {
      await evaluateDueAppointments(new Date());
    } catch (e) {
      logger.error('appointment-evaluation tick failed', { err: String(e) });
    }
  });
  logger.info('workers started: appointment-evaluation (* * * * *)');
}

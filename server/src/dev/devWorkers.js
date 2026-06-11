// @ts-check
import { Router } from 'express';
import { dispatchDueNotifications } from '../modules/notification/service.js';
import { retryDueRefunds } from '../modules/appointment/service.js';
import { reconcileUnconfirmed } from '../modules/payment/service.js';

/** Dev-only on-demand worker passes (no waiting for cron). NEVER mounted in production. */
export const devWorkersRouter = Router();

const trigger = (fn) => async (_req, res, next) => {
  try {
    await fn(new Date());
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

devWorkersRouter.post('/worker/notifications', trigger(dispatchDueNotifications));
devWorkersRouter.post('/worker/refund-retry', trigger(retryDueRefunds));
devWorkersRouter.post('/worker/reconcile', trigger(reconcileUnconfirmed));

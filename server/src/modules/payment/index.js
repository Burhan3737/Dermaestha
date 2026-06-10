// @ts-check
import { Router } from 'express';
import * as c from './controller.js';

export const paymentWebhookRouter = Router();
// Public (no session): authenticity comes from the signature, not a cookie.
paymentWebhookRouter.post('/payfast', c.payfast);

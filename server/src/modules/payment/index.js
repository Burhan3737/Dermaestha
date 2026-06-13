// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';

export const paymentWebhookRouter = Router();
// Public (no session): authenticity comes from the signature, not a cookie.
paymentWebhookRouter.post('/payfast', c.payfast);

export const paymentReturnRouter = Router();
// Patient-session browser-return verification (design §3). Signature is the integrity guard;
// funnels into the same idempotent processWebhook as the webhook.
paymentReturnRouter.post('/verify-return', requireRole('patient'), c.verifyReturn);

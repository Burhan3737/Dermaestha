// @ts-check
import { Router } from 'express';
import express from 'express';
import { prisma } from '../lib/prisma/prisma.js';
import { env } from '../config/env/env.js';
import { paymentProvider } from '../integrations/payment/index.js';
import { buildSignedIpn } from '../integrations/payment/payfast.mock.js';
import * as paymentService from '../modules/payment/service.js';

/**
 * Dev-only simulated PayFast hosted checkout. Mounted ONLY when PAYMENT_PROVIDER=mock.
 * The "Pay"/"Fail" actions build a REAL signed IPN and run it through the same
 * verifyWebhook + processWebhook path as production.
 */
export const devCheckoutRouter = Router();

devCheckoutRouter.get('/checkout', (req, res) => {
  const ref = String(req.query.ref ?? '');
  res.set('Content-Type', 'text/html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Dev Checkout</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:64px auto">
  <h1>Mock PayFast checkout</h1>
  <p>Simulated hosted page — not the real gateway.</p>
  <form method="POST" action="/dev/payment/complete">
    <input type="hidden" name="ref" value="${ref}" />
    <button name="outcome" value="success">Pay</button>
    <button name="outcome" value="failed">Fail</button>
  </form>
</body></html>`);
});

devCheckoutRouter.post(
  '/payment/complete',
  express.urlencoded({ extended: false }),
  async (req, res, next) => {
    try {
      const { ref, outcome } = req.body;
      const payment = await prisma.payment.findFirst({ where: { providerRef: ref } });
      if (!payment) return res.status(404).send('Unknown payment ref');
      const slotStartIso =
        payment.slotStart instanceof Date
          ? payment.slotStart.toISOString()
          : new Date(payment.slotStart).toISOString();
      // Mock gateway reports a 2.5% fee on success.
      const gatewayFee = outcome === 'success' ? Math.round(payment.amount * 0.025) : null;
      const ipn = buildSignedIpn({
        event: outcome === 'success' ? 'payment.success' : 'payment.failed',
        providerRef: ref,
        intentKey: `${payment.patientUserId}:${slotStartIso}`,
        amount: payment.amount,
        gatewayFee,
      });
      const result = paymentProvider.verifyWebhook({ body: ipn }); // real signature verification
      await paymentService.processWebhook(result);
      res.redirect(`${env.APP_BASE_URL}/pay/return?appt=${payment.appointmentId}`);
    } catch (e) {
      next(e);
    }
  },
);

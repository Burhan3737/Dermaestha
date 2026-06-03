// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { paymentProvider } from '../integrations/payment/index.js';

function fallbackFee(amount, s) {
  const pct = Math.round((amount * (s?.fallbackFeePctBps ?? 0)) / 10000);
  return pct + (s?.fallbackFeeFixed ?? 0);
}

/** Pure-ish quote so the cancel modal and dashboard show the identical number (policy #5). */
export async function quoteRefund(appointmentId) {
  const payment = await prisma.payment.findFirst({ where: { appointmentId, status: 'success' } });
  if (!payment) throw new AppError('NOT_FOUND', 'No payment to refund.', 404);
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const gatewayFee = payment.gatewayFee ?? fallbackFee(payment.amount, settings);
  return {
    amountPaid: payment.amount,
    gatewayFee,
    refund: Math.max(0, payment.amount - gatewayFee),
  };
}

/** Idempotency-keyed refund (#10). Best-effort caller fires the email post-commit. */
export async function initiateRefund({ appointmentId }) {
  const payment = await prisma.payment.findFirst({ where: { appointmentId, status: 'success' } });
  if (!payment) return null;
  const { refund } = await quoteRefund(appointmentId);
  const key = payment.refundIdempotencyKey ?? `rf_${appointmentId}`;
  const result = await paymentProvider.refund({
    providerRef: payment.providerRef,
    amount: refund,
    idempotencyKey: key,
  });
  await prisma.payment.update({
    where: { id: payment.id },
    data: { refundIdempotencyKey: key, refundRef: result.refundRef, refundStatus: result.status },
  });
  return result;
}

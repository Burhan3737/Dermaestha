// @ts-check
import { AppError } from '../../http/AppError.js';
const ni = (m) => async () => {
  throw new AppError('NOT_IMPLEMENTED', `payfast.${m} is M2`, 501);
};

/** @type {import('./index.js').PaymentProvider} */
export const payfastStub = {
  createCheckout: ni('createCheckout'),
  verifyWebhook: () => {
    throw new AppError('NOT_IMPLEMENTED', 'payfast.verifyWebhook is M2', 501);
  },
  refund: ni('refund'),
  listUnconfirmed: ni('listUnconfirmed'),
  queryPaymentStatus: ni('queryPaymentStatus'),
};

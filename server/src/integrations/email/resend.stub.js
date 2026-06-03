// @ts-check
import { AppError } from '../../http/AppError.js';
const ni = (m) => async () => {
  throw new AppError('NOT_IMPLEMENTED', `resend.${m} is M1/M4`, 501);
};
/** @type {import('./index.js').EmailProvider} */
export const resendStub = {
  send: ni('send'),
  parseWebhook: () => {
    throw new AppError('NOT_IMPLEMENTED', 'resend.parseWebhook is M4', 501);
  },
};

// @ts-check
import { AppError } from '../../http/AppError.js';
const ni = (m) => async () => {
  throw new AppError('NOT_IMPLEMENTED', `daily.${m} is M2`, 501);
};
/** @type {import('./index.js').VideoProvider} */
export const dailyStub = {
  createRoom: ni('createRoom'),
  issueToken: ni('issueToken'),
  verifyWebhook() {
    throw new AppError('NOT_IMPLEMENTED', 'daily.verifyWebhook is M2', 501);
  },
};

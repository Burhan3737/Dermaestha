// @ts-check
import { logger } from '../../lib/logger.js';

/** Dev email adapter: logs instead of sending. Selected when EMAIL_PROVIDER=console. */
/** @type {import('./index.js').EmailProvider} */
export const consoleEmail = {
  async send({ template, to, vars }) {
    logger.info('DEV email', { template, to, vars });
    return { providerId: `dev_${Date.now()}` };
  },
  parseWebhook() {
    throw new Error('console.dev parseWebhook not supported');
  },
};

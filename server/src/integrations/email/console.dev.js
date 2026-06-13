// @ts-check
import { logger } from '../../lib/logger/logger.js';
import { render } from './templates.js';

/** Dev email adapter: logs the rendered email instead of sending. Selected when EMAIL_PROVIDER=console. */
/** @type {import('./index.js').EmailProvider} */
export const consoleEmail = {
  async send({ template, to, vars }) {
    const { subject, text } = render(template, vars);
    logger.info('DEV email', { to, subject, text });
    return { providerId: `dev_${Date.now()}` };
  },
  parseWebhook() {
    throw new Error('console.dev parseWebhook not supported');
  },
};

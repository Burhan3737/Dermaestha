// @ts-check
import { env } from '../../config/env/env.js';
import { AppError } from '../../http/AppError.js';
import { render } from './templates.js';

/** Real Resend adapter. Selected when RESEND_API_KEY is configured. */
/** @type {import('./index.js').EmailProvider} */
export const resendEmail = {
  async send({ template, to, vars }) {
    const { subject, text } = render(template, vars);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM ?? 'onboarding@resend.dev',
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      throw new AppError('EMAIL_SEND_FAILED', `Resend responded ${res.status}`, 502);
    }
    const body = await res.json();
    return { providerId: body.id };
  },
  parseWebhook() {
    throw new AppError('NOT_IMPLEMENTED', 'resend.parseWebhook is M4', 501);
  },
};

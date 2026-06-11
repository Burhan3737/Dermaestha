// @ts-check
import { env } from '../../config/env/env.js';
import { AppError } from '../../http/AppError.js';

/** Subject lines per template. Final marketing copy is M4 (doc 14 §5); vars are the contract. */
const SUBJECTS = {
  booking_confirmation: 'Your Dermestha appointment is confirmed',
  reminder_24h: 'Reminder: your Dermestha appointment is tomorrow',
  reminder_1h: 'Reminder: your Dermestha appointment starts in 1 hour',
  prescription_ready: 'Your Dermestha prescription is ready',
  refund_confirmation: 'Your Dermestha refund has been initiated',
  cancellation_apology: 'Your Dermestha appointment was cancelled',
  refund_delayed: 'Your Dermestha refund is taking longer than expected',
  password_reset: 'Reset your Dermestha password',
};

const renderText = (vars) =>
  Object.entries(vars ?? {})
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

/** Real Resend adapter. Selected when RESEND_API_KEY is configured. */
/** @type {import('./index.js').EmailProvider} */
export const resendEmail = {
  async send({ template, to, vars }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM ?? 'onboarding@resend.dev',
        to: [to],
        subject: SUBJECTS[template] ?? 'Dermestha notification',
        text: renderText(vars),
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

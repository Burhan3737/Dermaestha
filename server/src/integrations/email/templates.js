// @ts-check

/**
 * Plain-text transactional email copy for the 8 notification templates (doc 14 §5).
 * One `render(template, vars)` is consumed by both the Resend adapter and the dev console
 * adapter. Merge-vars are the fixed data contract; this module owns the prose + money/footer
 * formatting only. Amounts arrive as integer paisa and render as rupees via formatPKR.
 */

/** Pre-launch placeholder; confirm the real support inbox before go-live (design spec §5). */
export const SUPPORT_EMAIL = 'support@dermestha.example';

/** Appended once to every email body. */
export const FOOTER = `— Dermestha · Online dermatology consultations · Need help? ${SUPPORT_EMAIL}`;

/** Render integer-paisa money as grouped rupees, e.g. 250000 → "PKR 2,500" (en-PK). */
export function formatPKR(paisa) {
  return `PKR ${Math.round(paisa / 100).toLocaleString('en-PK')}`;
}

/** Drop null/undefined sub-lines, join with newlines; null if nothing remains. */
const lines = (arr) => {
  const kept = arr.filter((l) => l != null);
  return kept.length ? kept.join('\n') : null;
};

/** Join non-empty blocks with a blank line, then append the footer exactly once. */
const compose = (blocks) =>
  `${blocks.filter((b) => b != null && b !== '').join('\n\n')}\n\n${FOOTER}`;

/** Each template: subject string + body(vars) => string (footer appended by compose). */
export const templates = {
  booking_confirmation: {
    subject: 'Your Dermestha appointment is confirmed',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null ? `Your consultation with ${v.doctorName} is confirmed.` : null,
        lines([
          v.slotStartLocal != null ? `When: ${v.slotStartLocal} (Pakistan time)` : null,
          v.fee != null ? `Fee paid: ${formatPKR(v.fee)}` : null,
        ]),
        `Join from your appointments dashboard a few minutes before the start time:\n${v.dashboardUrl}`,
        'See you soon.',
      ]),
  },

  reminder_24h: {
    subject: 'Reminder: your Dermestha appointment is tomorrow',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null ? `A reminder of your consultation with ${v.doctorName}.` : null,
        lines([
          v.slotStartLocal != null ? `When: ${v.slotStartLocal} (Pakistan time)` : null,
          `Join here when it's time: ${v.joinUrl}`,
        ]),
        'Tip: find a well-lit, quiet spot so your doctor can see your skin clearly.',
      ]),
  },

  reminder_1h: {
    subject: 'Reminder: your Dermestha appointment starts in 1 hour',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null
          ? `Your consultation with ${v.doctorName} starts in about an hour.`
          : null,
        lines([
          v.slotStartLocal != null ? `When: ${v.slotStartLocal} (Pakistan time)` : null,
          `Join here: ${v.joinUrl}`,
        ]),
        'You can join a few minutes early to check your camera and microphone.',
      ]),
  },

  prescription_ready: {
    subject: 'Your Dermestha prescription is ready',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null ? `${v.doctorName} has issued your prescription.` : null,
        `View and download it here:\n${v.prescriptionUrl}`,
        'This link stays available in your appointments dashboard.',
      ]),
  },

  refund_confirmation: {
    subject: 'Your Dermestha refund has been initiated',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        `We've initiated a refund for your appointment (${v.appointmentRef}).`,
        lines([
          v.amount != null ? `Refund amount: ${formatPKR(v.amount)}` : null,
          v.refundRef != null ? `Reference: ${v.refundRef}` : null,
        ]),
        'It may take a few business days to appear, depending on your bank or card provider.',
      ]),
  },

  cancellation_apology: {
    subject: 'Your Dermestha appointment was cancelled',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null && v.slotStartLocal != null
          ? `We're sorry — your consultation with ${v.doctorName} on ${v.slotStartLocal} (Pakistan time) has been cancelled.`
          : `We're sorry — your consultation has been cancelled.`,
        v.refundAmount != null
          ? `A refund of ${formatPKR(v.refundAmount)} has been initiated and may take a few business days to appear.`
          : null,
        "You're welcome to book another appointment whenever suits you.",
      ]),
  },

  refund_delayed: {
    subject: 'Your Dermestha refund is taking longer than expected',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        `The refund for your appointment (${v.appointmentRef}) is taking longer than usual to process.`,
        "We're on it — you don't need to do anything, and we'll confirm as soon as it's complete.",
        'Thank you for your patience.',
      ]),
  },

  password_reset: {
    subject: 'Reset your Dermestha password',
    body: (v) =>
      compose([
        'Hi,',
        'We received a request to reset your Dermestha password.',
        `Reset it here (link expires in ${v.expiresInMinutes} minutes):\n${v.resetUrl}`,
        "If you didn't request this, you can safely ignore this email — your password won't change.",
      ]),
  },
};

/** Single entry point used by both adapters. Unknown types degrade to a generic subject. */
export function render(template, vars = {}) {
  const t = templates[template];
  if (!t) return { subject: 'Dermestha notification', text: FOOTER };
  return { subject: t.subject, text: t.body(vars) };
}

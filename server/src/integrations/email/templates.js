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

  payment_submitted_admin: {
    subject: 'A patient submitted a payment reference for review',
    body: (v) =>
      compose([
        'Hi admin,',
        `A patient submitted a bank transaction reference for appointment ${v.appointmentRef}.`,
        lines([
          v.reference != null ? `Reference: ${v.reference}` : null,
          v.reviewUrl != null ? `Review it here: ${v.reviewUrl}` : null,
        ]),
        'Match it against the bank, then accept or reject the booking.',
      ]),
  },

  payment_not_received: {
    subject: 'We could not confirm your Dermestha payment',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.slotStartLocal != null
          ? `We could not match a payment for your booking on ${v.slotStartLocal} (Pakistan time), so it has been cancelled.`
          : `We could not match a payment for your booking (${v.appointmentRef}), so it has been cancelled.`,
        "If you believe this is a mistake, please reply with your bank transaction details, or book again whenever suits you.",
      ]),
  },

  cancellation: {
    subject: 'Your Dermestha appointment was cancelled',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null && v.slotStartLocal != null
          ? `Your consultation with ${v.doctorName} on ${v.slotStartLocal} (Pakistan time) has been cancelled.`
          : `Your consultation has been cancelled.`,
        "You're welcome to book another appointment whenever suits you.",
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

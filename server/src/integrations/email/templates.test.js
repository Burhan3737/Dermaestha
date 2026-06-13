import { describe, it, expect } from 'vitest';
import { formatPKR, FOOTER, SUPPORT_EMAIL, render } from './templates.js';

describe('formatPKR', () => {
  it('formats paisa as grouped integer rupees', () => {
    expect(formatPKR(250000)).toBe('PKR 2,500');
  });
  it('formats a large amount with en-PK grouping', () => {
    expect(formatPKR(150000000)).toBe('PKR 1,500,000');
  });
});

describe('FOOTER', () => {
  it('is a single line referencing the support email placeholder', () => {
    expect(FOOTER).toContain('Dermestha');
    expect(FOOTER).toContain(SUPPORT_EMAIL);
  });
});

const ALL = [
  'booking_confirmation',
  'reminder_24h',
  'reminder_1h',
  'prescription_ready',
  'refund_confirmation',
  'cancellation_apology',
  'refund_delayed',
  'password_reset',
];

const sampleVars = {
  patientName: 'Ayesha',
  doctorName: 'Dr. Khan',
  slotStartLocal: 'Mon, 16 Jun 2026 14:00',
  fee: 250000,
  dashboardUrl: 'https://app/appointments',
  joinUrl: 'https://app/appointments',
  prescriptionUrl: 'https://app/rx',
  amount: 250000,
  refundAmount: 250000,
  refundRef: 'rf_1',
  appointmentRef: 'ap_1',
  resetUrl: 'https://app/reset',
  expiresInMinutes: 30,
};

describe('render', () => {
  it('renders every template with a non-empty subject and plain-text body', () => {
    for (const t of ALL) {
      const { subject, text } = render(t, sampleVars);
      expect(subject, t).toBeTruthy();
      expect(text, t).toBeTruthy();
      expect(text, t).not.toMatch(/\bnull\b|\bundefined\b/);
      // no leftover "key: value" debug-dump lines (the old renderText behavior)
      expect(text, t).not.toMatch(/^patientName:\s/m);
    }
  });

  it('formats money as rupees, never raw paisa', () => {
    const { text } = render('booking_confirmation', sampleVars);
    expect(text).toContain('PKR 2,500');
    expect(text).not.toContain('250000');
  });

  it('appends the footer exactly once', () => {
    const { text } = render('refund_delayed', sampleVars);
    expect(text.split('— Dermestha').length - 1).toBe(1);
  });

  it('omits the refund-amount line when refundAmount is null (cancellation_apology)', () => {
    const { text } = render('cancellation_apology', { ...sampleVars, refundAmount: null });
    expect(text).not.toMatch(/A refund of/);
    expect(text).not.toContain('null');
  });

  it('omits the doctor-name line when doctorName is null (prescription_ready)', () => {
    const { text } = render('prescription_ready', { ...sampleVars, doctorName: null });
    expect(text).not.toContain('null');
    expect(text).toContain('View and download it here'); // body still renders
  });

  it('password_reset interpolates the expiry and reset link', () => {
    const { subject, text } = render('password_reset', sampleVars);
    expect(subject).toMatch(/reset/i);
    expect(text).toContain('30 minutes');
    expect(text).toContain('https://app/reset');
  });
});

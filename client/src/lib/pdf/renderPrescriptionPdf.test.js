import { describe, it, expect } from 'vitest';
import { renderPrescriptionPdf } from './renderPrescriptionPdf.js';

const PRESCRIPTION = {
  id: 'rx1',
  issuedAt: '2099-01-04T09:00:00.000Z',
  doctorSnapshot: { name: 'Dr A', pmcNumber: 'PMC-1001', specialization: 'Acne' },
  patientIdSnapshot: { forSelf: false, name: 'Ali', age: 9, relation: 'son' },
  notes: 'Avoid sun exposure.',
  followUpDate: '2099-01-18T00:00:00.000Z',
  items: [
    {
      medicineName: 'Adapalene Gel',
      dosage: '1x daily',
      duration: '7 days',
      instructions: 'at night',
      price: 30000,
    },
    { medicineName: 'Custom Balm', dosage: '2x', duration: '5 days', instructions: 'morning', price: null },
  ],
};

describe('renderPrescriptionPdf (§3.5 Client-Render Rule)', () => {
  it('renders prescription JSON to PDF bytes', async () => {
    const bytes = await renderPrescriptionPdf(PRESCRIPTION);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);
  });
});

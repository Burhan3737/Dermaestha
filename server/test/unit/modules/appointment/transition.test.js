import { describe, it, expect } from 'vitest';
import { LEGAL } from '#src/modules/appointment/service.js';

describe('LEGAL transitions (manual-payment, 3-state)', () => {
  it('pending → confirmed and cancelled only', () => {
    expect([...LEGAL.pending].sort()).toEqual(['cancelled', 'confirmed']);
    expect(LEGAL.pending.has('completed')).toBe(false);
  });
  it('confirmed → cancelled only (no completed state)', () => {
    expect([...LEGAL.confirmed]).toEqual(['cancelled']);
    expect(LEGAL.confirmed.has('completed')).toBe(false);
  });
  it('cancelled is terminal; there is no completed state', () => {
    expect(LEGAL.cancelled).toBeUndefined();
    expect(LEGAL.completed).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { LEGAL } from '#src/modules/appointment/service.js';

describe('LEGAL transitions (manual-payment)', () => {
  it('pending → confirmed and cancelled only', () => {
    expect([...LEGAL.pending]).toEqual(expect.arrayContaining(['confirmed', 'cancelled']));
    expect(LEGAL.pending.has('completed')).toBe(false);
  });
  it('confirmed → completed and cancelled only', () => {
    expect([...LEGAL.confirmed].sort()).toEqual(['cancelled', 'completed']);
  });
  it('completed and cancelled are terminal', () => {
    expect(LEGAL.completed).toBeUndefined();
    expect(LEGAL.cancelled).toBeUndefined();
  });
});

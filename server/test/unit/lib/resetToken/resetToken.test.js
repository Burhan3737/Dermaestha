import { describe, it, expect } from 'vitest';
import { generateResetToken, hashResetToken } from '#src/lib/resetToken/resetToken.js';

describe('resetToken', () => {
  it('generates a 64-char hex token', () => {
    const t = generateResetToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });
  it('hashes deterministically and differs from the raw token', () => {
    const raw = generateResetToken();
    expect(hashResetToken(raw)).toBe(hashResetToken(raw));
    expect(hashResetToken(raw)).not.toBe(raw);
    expect(hashResetToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});

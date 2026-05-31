import { describe, it, expect } from 'vitest';
import { paymentProvider } from './payment/index.js';
import { videoProvider } from './video/index.js';
import { emailProvider } from './email/index.js';

describe('integration seams', () => {
  it('payment provider exposes the contract methods and stubs throw NOT_IMPLEMENTED', async () => {
    expect(typeof paymentProvider.createCheckout).toBe('function');
    await expect(paymentProvider.createCheckout({})).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
  it('video provider exposes createRoom/issueToken', () => {
    expect(typeof videoProvider.createRoom).toBe('function');
    expect(typeof videoProvider.issueToken).toBe('function');
  });
  it('email provider exposes send', () => {
    expect(typeof emailProvider.send).toBe('function');
  });
});

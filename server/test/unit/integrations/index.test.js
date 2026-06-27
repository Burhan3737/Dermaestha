import { describe, it, expect } from 'vitest';
import { videoProvider } from '#src/integrations/video/index.js';
import { emailProvider } from '#src/integrations/email/index.js';

describe('integration seams', () => {
  it('video provider exposes createRoom/issueToken', () => {
    expect(typeof videoProvider.createRoom).toBe('function');
    expect(typeof videoProvider.issueToken).toBe('function');
  });
  it('email provider exposes send', () => {
    expect(typeof emailProvider.send).toBe('function');
  });
});

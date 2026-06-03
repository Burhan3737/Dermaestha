import { describe, it, expect } from 'vitest';
import { consoleEmail } from './console.dev.js';

describe('consoleEmail dev adapter', () => {
  it('send resolves with a providerId and never throws', async () => {
    const out = await consoleEmail.send({ template: 'booking_confirmation', to: 'p@t.test', vars: { x: 1 } });
    expect(out.providerId).toMatch(/^dev_/);
  });
});

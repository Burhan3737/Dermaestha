import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validate } from './validate.js';

const schema = z.object({ email: z.string().email() });

function ctx(body) {
  let nextArg;
  const req = { body };
  const next = (e) => {
    nextArg = e;
  };
  return { req, next, getNext: () => nextArg };
}

describe('validate middleware', () => {
  it('passes valid body through and replaces req.body with parsed data', () => {
    const { req, next, getNext } = ctx({ email: 'a@b.com', extra: 'x' });
    validate(schema)(req, {}, next);
    expect(getNext()).toBeUndefined();
    expect(req.body).toEqual({ email: 'a@b.com' }); // stripped unknown key
  });
  it('forwards a ZodError to next() on invalid body', () => {
    const { req, next, getNext } = ctx({ email: 'nope' });
    validate(schema)(req, {}, next);
    expect(getNext()?.name).toBe('ZodError');
  });
});

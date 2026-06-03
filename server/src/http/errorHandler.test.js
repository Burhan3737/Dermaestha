import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AppError } from './AppError.js';
import { errorHandler } from './errorHandler.js';

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

describe('errorHandler', () => {
  it('maps an AppError to its status + envelope', () => {
    const res = mockRes();
    errorHandler(new AppError('SLOT_TAKEN', 'Slot just taken.', 409), {}, res, () => {});
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'SLOT_TAKEN', message: 'Slot just taken.', details: undefined },
    });
  });
  it('maps a ZodError to 400 VALIDATION_FAILED with field details', () => {
    const res = mockRes();
    const err = z.object({ a: z.string() }).safeParse({}).error;
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
  it('maps an unknown error to 500 INTERNAL without leaking the message', () => {
    const res = mockRes();
    errorHandler(new Error('db exploded'), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.message).not.toMatch(/db exploded/);
  });
});

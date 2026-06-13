import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z, ZodError } from 'zod';
import { AppError } from '../AppError.js';
import { errorHandler } from './errorHandler.js';
import { medicineCreateSchema } from '../../../../shared/schemas/index.js';

vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));
import * as audit from '../../services/audit/audit.service.js';

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
  beforeEach(() => vi.clearAllMocks());

  it('maps an AppError to its status + envelope', () => {
    const res = mockRes();
    errorHandler(new AppError('SLOT_TAKEN', 'Slot just taken.', 409), {}, res, () => {});
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'SLOT_TAKEN', message: 'Slot just taken.', details: undefined },
    });
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('maps a ZodError to 400 VALIDATION_FAILED with field details', () => {
    const res = mockRes();
    const err = z.object({ a: z.string() }).safeParse({}).error;
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('maps an unknown error to 500 INTERNAL without leaking the message', () => {
    const res = mockRes();
    errorHandler(new Error('db exploded'), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.message).not.toMatch(/db exploded/);
  });
  it('a shared-schema ZodError is an instanceof the server zod ZodError (single-copy proof)', () => {
    const err = medicineCreateSchema.safeParse({}).error;
    expect(err).toBeInstanceOf(ZodError);
  });
  it('maps a shared-schema ZodError to 400 VALIDATION_FAILED via instanceof', () => {
    const res = mockRes();
    const err = medicineCreateSchema.safeParse({ name: '', dosageForms: [] }).error;
    errorHandler(err, { path: '/api/admin/medicines', method: 'POST' }, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('writes a system.unhandled_exception audit row for non-AppError 500s (F12.01 bridge)', () => {
    const res = mockRes();
    errorHandler(new Error('kaboom'), { path: '/api/payments/x', method: 'POST' }, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'system.unhandled_exception',
        actorType: 'system',
        targetRef: '/api/payments/x',
        reason: 'kaboom',
        meta: { method: 'POST' },
      }),
    );
  });
});

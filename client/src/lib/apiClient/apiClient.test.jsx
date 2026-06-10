import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiError } from './apiClient.js';

afterEach(() => vi.restoreAllMocks());

describe('apiClient', () => {
  it('GET returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'u1' }) })),
    );
    expect(await api.get('/auth/me')).toEqual({ id: 'u1' });
  });
  it('throws ApiError carrying the envelope code on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHENTICATED', message: 'x' } }),
      })),
    );
    const err = await api.get('/auth/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('UNAUTHENTICATED');
    expect(err.status).toBe(401);
  });
  it('returns null for 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error('no body');
        },
      })),
    );
    expect(await api.post('/auth/logout')).toBeNull();
  });
});

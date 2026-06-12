import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiError } from './apiClient.js';

afterEach(() => vi.restoreAllMocks());

describe('api.patch / api.upload (Slice G)', () => {
  it('patch sends a JSON PATCH and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'm1', isActive: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await api.patch('/admin/medicines/m1', { isActive: false });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/medicines/m1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    expect(out).toEqual({ id: 'm1', isActive: false });
  });

  it('upload POSTs FormData without a JSON content-type and surfaces the error envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'INVALID_FILE', message: 'Photo must be a JPEG, PNG, or WebP image.' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const fd = new FormData();
    await expect(api.upload('/doctors/d1/photo', fd)).rejects.toMatchObject({
      code: 'INVALID_FILE',
      status: 400,
    });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/doctors/d1/photo');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe(fd);
    expect(opts.headers).toBeUndefined(); // browser sets the multipart boundary itself
  });

  it('upload returns the parsed body on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ photoUrl: '/uploads/doctors/d1.jpg' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const fd = new FormData();
    const out = await api.upload('/doctors/d1/photo', fd);
    expect(out).toEqual({ photoUrl: '/uploads/doctors/d1.jpg' });
  });
});

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

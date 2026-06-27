import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useBooking } from '#src/modules/booking/useBooking.js';
import { api } from '#src/lib/apiClient/apiClient.js';
import { track } from '#src/lib/analytics/track.js';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('#src/lib/analytics/track.js', () => ({ track: vi.fn() }));

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useBooking.confirmBooking (manual-payment)', () => {
  it('locks the slot and resolves the new appointment id without a gateway redirect', async () => {
    api.post.mockResolvedValueOnce({ id: 'a1' }); // lock only — no /pay call
    const { result } = renderHook(() => useBooking({ doctorId: 'd1' }), { wrapper });

    let id;
    await waitFor(async () => {
      id = await result.current.confirmBooking({
        doctorId: 'd1',
        slotStart: '2099-01-04T13:00:00.000Z',
        forSelf: true,
      });
    });

    expect(id).toBe('a1');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/appointments/lock', {
      doctorId: 'd1',
      slotStart: '2099-01-04T13:00:00.000Z',
      forSelf: true,
    });
    expect(api.post).not.toHaveBeenCalledWith('/appointments/a1/pay');
    expect(track).toHaveBeenCalledWith('booking_started', { doctorId: 'd1' });
  });

  it('includes the subject when booking for someone else', async () => {
    api.post.mockResolvedValueOnce({ id: 'a2' });
    const { result } = renderHook(() => useBooking({ doctorId: 'd1' }), { wrapper });
    await waitFor(async () => {
      await result.current.confirmBooking({
        doctorId: 'd1',
        slotStart: '2099-01-04T13:00:00.000Z',
        forSelf: false,
        subject: { name: 'Ali', age: '7', relation: 'son' },
      });
    });
    expect(api.post).toHaveBeenCalledWith('/appointments/lock', {
      doctorId: 'd1',
      slotStart: '2099-01-04T13:00:00.000Z',
      forSelf: false,
      subject: { name: 'Ali', age: 7, relation: 'son' },
    });
  });
});

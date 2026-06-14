import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentReturn } from '#src/modules/booking/views/PaymentReturn/PaymentReturn.jsx';
import { api } from '#src/lib/apiClient/apiClient.js';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn() } }));
vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/pay/return?appt=a1']}>
        <Routes>
          <Route path="/pay/return" element={<PaymentReturn />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-07 PaymentReturn', () => {
  it('shows Confirmed when the appointment is confirmed', async () => {
    api.get.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    setup();
    await waitFor(() => expect(screen.getByText(/confirmed/i)).toBeTruthy());
  });

  it('shows a failure message when the appointment is gone (404)', async () => {
    api.get.mockRejectedValue({ status: 404 });
    setup();
    await waitFor(() => expect(screen.getByText(/payment did not complete/i)).toBeTruthy());
  });

  it('shows a terminal failure state (not an infinite poll) when the lock is released after a failed payment (ISSUE-3)', async () => {
    // payment.failed → state stays slot_locked but the lock is force-expired (lockExpiresAt ≤ serverNow).
    api.get.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      lockExpiresAt: '2020-01-01T00:00:00.000Z',
      serverNow: '2020-01-01T00:10:00.000Z',
    });
    setup();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Payment not completed' })).toBeTruthy(),
    );
    // The old infinite-poll copy must NOT be shown.
    expect(screen.queryByText(/awaiting payment confirmation/i)).toBeNull();
  });
});

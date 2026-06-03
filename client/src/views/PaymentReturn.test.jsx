import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentReturn } from './PaymentReturn.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: { role: 'patient' } }) }));

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
});

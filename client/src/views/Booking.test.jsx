import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Booking } from './Booking.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: { role: 'patient' } }) }));

const slot = '2099-01-04T13:00:00.000Z';
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/book/d1?slot=${encodeURIComponent(slot)}`]}>
        <Routes>
          <Route path="/book/:id" element={<Booking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, bio: 'b', photoUrl: null });
  delete window.location;
  window.location = { href: '' };
});

describe('P-06 Booking', () => {
  it('locks then pays and redirects to the checkout URL on confirm', async () => {
    api.post
      .mockResolvedValueOnce({ id: 'a1' }) // lock
      .mockResolvedValueOnce({ redirectUrl: '/dev/checkout?ref=mock_1' }); // pay
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /confirm & pay/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/lock', { doctorId: 'd1', slotStart: slot, forSelf: true }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/a1/pay'));
    await waitFor(() => expect(window.location.href).toBe('/dev/checkout?ref=mock_1'));
  });

  it('requires subject fields when booking for someone else', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/someone else/i));
    expect(screen.getByLabelText(/patient name/i)).toBeTruthy();
  });
});

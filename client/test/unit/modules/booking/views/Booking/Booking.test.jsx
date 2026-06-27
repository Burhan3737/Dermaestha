import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Booking } from '#src/modules/booking/views/Booking/Booking.jsx';
import { api } from '#src/lib/apiClient/apiClient.js';
import { track } from '#src/lib/analytics/track.js';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));
vi.mock('#src/lib/analytics/track.js', () => ({ track: vi.fn() }));

const slot = '2099-01-04T13:00:00.000Z';
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/book/d1?slot=${encodeURIComponent(slot)}`]}>
        <Routes>
          <Route path="/book/:id" element={<Booking />} />
          <Route path="/book/pay/:id" element={<div>PAY SCREEN for a1</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({
    id: 'd1',
    fullName: 'Dr A',
    specialization: 'Acne',
    fee: 250000,
    bio: 'b',
    photoUrl: null,
  });
});

describe('P-06 Booking', () => {
  it('locks the slot then navigates to the payment-instructions screen (no gateway redirect)', async () => {
    api.post.mockResolvedValueOnce({ id: 'a1' }); // lock only
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/appointments/lock', {
        doctorId: 'd1',
        slotStart: slot,
        forSelf: true,
      }),
    );
    expect(api.post).not.toHaveBeenCalledWith('/appointments/a1/pay');
    await waitFor(() => expect(screen.getByText('PAY SCREEN for a1')).toBeTruthy());
  });

  it('emits booking_started once when the slot lock succeeds', async () => {
    api.post.mockResolvedValueOnce({ id: 'a1' });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }));
    await waitFor(() => expect(track).toHaveBeenCalledWith('booking_started', { doctorId: 'd1' }));
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('requires subject fields when booking for someone else', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/someone else/i));
    expect(screen.getByLabelText(/patient name/i)).toBeTruthy();
  });

  it('shows a "Go to your pending booking" link when an active lock blocks a new booking', async () => {
    api.post.mockRejectedValueOnce({
      code: 'ACTIVE_LOCK_EXISTS',
      message: 'Finish your current booking first.',
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }));
    await waitFor(() =>
      expect(screen.getByText('Finish your current booking first.')).toBeTruthy(),
    );
    const link = screen.getByRole('link', { name: /go to your pending booking/i });
    expect(link.getAttribute('href')).toBe('/appointments');
  });
});

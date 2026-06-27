import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Upcoming } from '#src/modules/appointment/views/Upcoming/Upcoming.jsx';
import { api } from '#src/lib/apiClient/apiClient.js';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));
vi.mock('#src/lib/analytics/track.js', () => ({ track: vi.fn() }));
import { track } from '#src/lib/analytics/track.js';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Upcoming />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const confirmedRow = (extra = {}) => ({
  id: 'a1',
  slotStart: '2099-01-04T13:00:00.000Z',
  slotEnd: '2099-01-04T13:30:00.000Z',
  state: 'confirmed',
  feeAtBooking: 250000,
  forSelf: true,
  subjectName: null,
  doctorName: 'Dr A',
  specialization: 'Acne',
  doctorPhotoUrl: null,
  paymentReference: null,
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe('P-08 Upcoming', () => {
  it('renders the empty state when there are no appointments', async () => {
    api.get.mockResolvedValue({ data: [] });
    setup();
    await waitFor(() => expect(screen.getByText(/no upcoming appointments/i)).toBeTruthy());
  });

  it('a pending row (no reference yet) shows "Payment pending" and an Enter-payment-reference link', async () => {
    api.get.mockResolvedValue({
      data: [confirmedRow({ id: 'p1', state: 'pending', paymentReference: null })],
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByText('Payment pending')).toBeTruthy();
    const link = screen.getByRole('link', { name: /enter payment reference/i });
    expect(link.getAttribute('href')).toBe('/book/pay/p1');
    expect(screen.queryByText(/complete payment/i)).toBeNull();
    expect(screen.queryByText(/hold expires/i)).toBeNull();
  });

  it('a pending row with a submitted reference shows "Awaiting confirmation"', async () => {
    api.get.mockResolvedValue({
      data: [confirmedRow({ id: 'p2', state: 'pending', paymentReference: 'TXN-1' })],
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByText(/awaiting confirmation/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /view payment details/i }).getAttribute('href')).toBe(
      '/book/pay/p2',
    );
  });

  it('lists a confirmed appointment with a Cancel control', async () => {
    api.get.mockResolvedValue({ data: [confirmedRow()] });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('enables Join Call within 10 min of slot start linking to the video room', async () => {
    const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    api.get.mockResolvedValue({ data: [confirmedRow({ slotStart: soon, slotEnd: soon })] });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    const join = screen.getByRole('link', { name: /join call/i });
    expect(join.getAttribute('href')).toContain('/video/a1');
  });

  it('routes Join Call through the waiting room and emits video_join_attempt', async () => {
    const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    api.get.mockResolvedValue({ data: [confirmedRow({ slotStart: soon, slotEnd: soon })] });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    const join = screen.getByRole('link', { name: /join call/i });
    expect(join.getAttribute('href')).toBe('/video/a1/ready');
    join.click();
    expect(track).toHaveBeenCalledWith('video_join_attempt', {
      appointmentId: 'a1',
      role: 'patient',
    });
  });

  it('opens the cancel modal and posts the cancel on confirm (no refund copy)', async () => {
    api.get.mockResolvedValue({ data: [confirmedRow()] });
    api.post.mockResolvedValue({ state: 'cancelled' });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.getByText(/this cannot be undone/i)).toBeTruthy());
    expect(screen.queryByText(/refund/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /cancel appointment/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/a1/cancel', {}));
  });
});

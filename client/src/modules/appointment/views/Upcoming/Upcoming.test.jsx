import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Upcoming } from './Upcoming.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../../context/session/session.jsx', () => ({ useSession: () => ({ session: { role: 'patient' } }) }));
vi.mock('../../../../lib/analytics/track.js', () => ({ track: vi.fn() }));
import { track } from '../../../../lib/analytics/track.js';

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

beforeEach(() => vi.clearAllMocks());

describe('P-08 Upcoming', () => {
  it('renders the empty state when there are no appointments', async () => {
    api.get.mockResolvedValue({ data: [] });
    setup();
    await waitFor(() => expect(screen.getByText(/no upcoming appointments/i)).toBeTruthy());
  });

  it('lists a confirmed appointment with a Cancel control', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/appointments')
        return Promise.resolve({
          data: [
            {
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
            },
          ],
        });
      return Promise.resolve({
        id: 'a1',
        state: 'confirmed',
        refundQuote: { amountPaid: 250000, gatewayFee: 6000, refund: 244000 },
      });
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('shows the no-refund warning for a <2h cancellation', async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    api.get.mockImplementation((path) => {
      if (path === '/appointments')
        return Promise.resolve({
          data: [
            {
              id: 'a1',
              slotStart: soon,
              slotEnd: soon,
              state: 'confirmed',
              feeAtBooking: 250000,
              forSelf: true,
              subjectName: null,
              doctorName: 'Dr A',
              specialization: 'Acne',
              doctorPhotoUrl: null,
            },
          ],
        });
      return Promise.resolve({
        id: 'a1',
        state: 'confirmed',
        refundQuote: { amountPaid: 250000, gatewayFee: 6000, refund: 244000 },
      });
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.getByText(/no refund/i)).toBeTruthy());
    expect(screen.queryByText('Rs 2,440')).toBeNull();
  });

  it('enables Join Call within 10 min of slot start linking to the video room', async () => {
    const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    api.get.mockResolvedValue({
      data: [
        {
          id: 'a1',
          slotStart: soon,
          slotEnd: soon,
          state: 'confirmed',
          feeAtBooking: 250000,
          forSelf: true,
          subjectName: null,
          doctorName: 'Dr A',
          specialization: 'Acne',
          doctorPhotoUrl: null,
        },
      ],
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    const join = screen.getByRole('link', { name: /join call/i });
    expect(join.getAttribute('href')).toContain('/video/a1');
  });

  it('routes Join Call through the waiting room and emits video_join_attempt', async () => {
    const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    api.get.mockResolvedValue({
      data: [{ id: 'a1', slotStart: soon, slotEnd: soon, state: 'confirmed', feeAtBooking: 250000,
        forSelf: true, subjectName: null, doctorName: 'Dr A', specialization: 'Acne', doctorPhotoUrl: null }],
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    const join = screen.getByRole('link', { name: /join call/i });
    expect(join.getAttribute('href')).toBe('/video/a1/ready');
    join.click();
    expect(track).toHaveBeenCalledWith('video_join_attempt', { appointmentId: 'a1', role: 'patient' });
  });

  it('opens the cancel modal and posts the cancel on confirm', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/appointments')
        return Promise.resolve({
          data: [
            {
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
            },
          ],
        });
      return Promise.resolve({
        id: 'a1',
        state: 'confirmed',
        refundQuote: { amountPaid: 250000, gatewayFee: 6000, refund: 244000 },
      });
    });
    api.post.mockResolvedValue({ state: 'cancelled_refunded' });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.getByText('Rs 2,440')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /cancel & refund/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/a1/cancel', {}));
  });
});

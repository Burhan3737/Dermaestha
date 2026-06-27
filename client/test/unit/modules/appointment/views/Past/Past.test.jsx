import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Past } from '#src/modules/appointment/views/Past/Past.jsx';
import { api } from '#src/lib/apiClient/apiClient.js';
import { stateLabel } from '#src/modules/appointment/stateLabel.js';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn() } }));
vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Past />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

const row = (state, extra = {}) => ({
  id: `a-${state}`,
  slotStart: '2099-01-04T13:00:00.000Z',
  slotEnd: '2099-01-04T13:30:00.000Z',
  state,
  feeAtBooking: 250000,
  forSelf: true,
  subjectName: null,
  doctorName: 'Dr A',
  specialization: 'Acne',
  doctorPhotoUrl: null,
  hasPrescription: false,
  ...extra,
});

describe('stateLabel (4-state manual-payment mapping)', () => {
  it.each([
    ['pending', 'Payment pending'],
    ['confirmed', 'Confirmed'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
  ])('%s → %s', (state, label) => {
    expect(stateLabel(state)).toBe(label);
  });
});

describe('P-09 Past appointments', () => {
  it('fetches scope=history and renders labelled rows', async () => {
    api.get.mockResolvedValue({ data: [row('cancelled')] });
    setup();
    await waitFor(() => expect(screen.getByText('Cancelled')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/appointments?scope=history');
  });

  it('shows Download Prescription only for completed rows that have a prescription', async () => {
    api.get.mockResolvedValue({
      data: [
        row('completed', { id: 'a-rx', hasPrescription: true }),
        row('completed', { id: 'a-norx', hasPrescription: false }),
      ],
    });
    setup();
    await waitFor(() => expect(screen.getAllByText('Completed')).toHaveLength(2));
    const links = screen.getAllByRole('link', { name: /download prescription/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toContain('/appointments/a-rx/prescriptions');
  });
});

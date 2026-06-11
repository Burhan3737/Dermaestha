import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Past } from './Past.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';
import { stateLabel } from '../../stateLabel.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn() } }));
vi.mock('../../../../context/session/session.jsx', () => ({
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

describe('stateLabel (F08.01 exact mapping)', () => {
  it.each([
    ['completed', 'Completed'],
    ['prescription_issued', 'Completed'],
    ['patient_no_show', 'Missed (no-show)'],
    ['doctor_no_show', 'Cancelled by doctor — refund issued'],
    ['doctor_cancelled', 'Cancelled by doctor — refund issued'],
    ['cancelled_refunded', 'Cancelled — refunded'],
    ['cancelled_no_refund', 'Cancelled — no refund'],
  ])('%s → %s', (state, label) => {
    expect(stateLabel(state)).toBe(label);
  });
});

describe('P-09 Past appointments', () => {
  it('fetches scope=history and renders labelled rows', async () => {
    api.get.mockResolvedValue({ data: [row('cancelled_refunded')] });
    setup();
    await waitFor(() => expect(screen.getByText('Cancelled — refunded')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/appointments?scope=history');
  });

  it('shows Download Prescription only for prescription_issued', async () => {
    api.get.mockResolvedValue({
      data: [row('prescription_issued', { hasPrescription: true }), row('completed')],
    });
    setup();
    await waitFor(() => expect(screen.getAllByText('Completed')).toHaveLength(2));
    const links = screen.getAllByRole('link', { name: /download prescription/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toContain('/appointments/a-prescription_issued/prescriptions');
  });
});

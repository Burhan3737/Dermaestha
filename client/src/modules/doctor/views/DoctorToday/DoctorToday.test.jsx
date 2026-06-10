import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorToday } from './DoctorToday.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../../context/session/session.jsx', () => ({ useSession: () => ({ session: { role: 'doctor' }, logout: vi.fn() }) }));

/**
 * Returns an ISO string for HH:MM on the current Karachi calendar day, offset
 * by `plusMs` milliseconds. Using noon (12:00 PKT) as the anchor keeps the
 * slot safely within the same calendar day regardless of when the test runs.
 */
function karachiNoonMs() {
  const todayKarachi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  // todayKarachi is "YYYY-MM-DD"; noon PKT = UTC+5, so noon PKT = 07:00 UTC
  return new Date(`${todayKarachi}T07:00:00.000Z`).getTime();
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><DoctorToday /></MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe('D-02 DoctorToday', () => {
  it('lists today appointments with the patient name', async () => {
    const noon = karachiNoonMs();
    api.get.mockResolvedValue({ data: [{ id: 'a1',
      slotStart: new Date(noon).toISOString(),
      slotEnd: new Date(noon + 18e5).toISOString(),
      state: 'confirmed', forSelf: false,
      subjectName: 'Child', patientName: 'Parent P' }] });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    expect(screen.getByText(/for: Child/i)).toBeTruthy();
  });

  it('opens the doctor cancel modal and posts a reason', async () => {
    const noon = karachiNoonMs();
    api.get.mockResolvedValue({ data: [{ id: 'a1',
      slotStart: new Date(noon).toISOString(),
      slotEnd: new Date(noon + 18e5).toISOString(),
      state: 'confirmed', forSelf: true, subjectName: null, patientName: 'Parent P' }] });
    api.post.mockResolvedValue({ state: 'doctor_cancelled' });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Unwell' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel & refund/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/a1/cancel', { reason: 'Unwell' }));
  });

  it('switches to the History tab and requests the history scope', async () => {
    api.get.mockImplementation((path) =>
      path.includes('scope=history')
        ? Promise.resolve({ data: [{ id: 'h1', slotStart: new Date(Date.now() - 9e7).toISOString(),
            slotEnd: new Date(Date.now() - 9e7).toISOString(), state: 'completed', forSelf: true, subjectName: null, patientName: 'Past P' }] })
        : Promise.resolve({ data: [] }),
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => expect(screen.getByText('Past P')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/appointments?scope=history');
  });
});

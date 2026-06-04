import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorToday } from './DoctorToday.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({
  useSession: () => ({ session: { role: 'doctor' }, logout: vi.fn() }),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DoctorToday />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe('D-02 DoctorToday', () => {
  it('lists today appointments with the patient name', async () => {
    api.get.mockResolvedValue({
      data: [
        {
          id: 'a1',
          slotStart: new Date(Date.now() + 3e5).toISOString(),
          slotEnd: new Date(Date.now() + 21e5).toISOString(),
          state: 'confirmed',
          forSelf: false,
          subjectName: 'Child',
          patientName: 'Parent P',
        },
      ],
    });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    expect(screen.getByText(/for: Child/i)).toBeTruthy();
  });

  it('opens the doctor cancel modal and posts a reason', async () => {
    api.get.mockResolvedValue({
      data: [
        {
          id: 'a1',
          slotStart: new Date(Date.now() + 1e7).toISOString(),
          slotEnd: new Date(Date.now() + 1e7).toISOString(),
          state: 'confirmed',
          forSelf: true,
          subjectName: null,
          patientName: 'Parent P',
        },
      ],
    });
    api.post.mockResolvedValue({ state: 'doctor_cancelled' });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Unwell' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel & refund/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/appointments/a1/cancel', { reason: 'Unwell' }),
    );
  });
});

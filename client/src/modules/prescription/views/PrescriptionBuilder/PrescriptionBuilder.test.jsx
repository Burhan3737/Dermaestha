import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrescriptionBuilder } from './PrescriptionBuilder.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../../../context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'doctor' } }),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/doctor/appointments/a1/prescribe']}>
        <Routes>
          <Route path="/doctor/appointments/:id/prescribe" element={<PrescriptionBuilder />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/appointments/a1')
      return Promise.resolve({
        id: 'a1',
        state: 'completed',
        forSelf: false,
        subjectName: 'Ali',
        subjectAge: 9,
        subjectRelation: 'son',
        patientName: 'Parent P',
        slotStart: '2099-01-04T13:00:00.000Z',
        slotEnd: '2099-01-04T13:30:00.000Z',
      });
    if (path === '/appointments/a1/prescriptions') return Promise.resolve({ data: [] });
    if (path.startsWith('/medicines'))
      return Promise.resolve({
        data: [{ id: 'm1', name: 'Adapalene Gel', genericName: 'Adapalene', unitPrice: 30000 }],
      });
    return Promise.resolve({ data: [] });
  });
});

describe('D-05 prescription builder', () => {
  it('shows the read-only patient-ID header (third-party identity, never typed)', async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/Ali/)).toBeTruthy());
    expect(screen.getByText(/age 9/)).toBeTruthy();
    expect(screen.getByText(/son/)).toBeTruthy();
  });

  it('catalogue pick shows price + running total; free-text shows "not priced"', async () => {
    setup();
    await waitFor(() => expect(screen.getByPlaceholderText(/search medicine/i)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/search medicine/i), {
      target: { value: 'ada' },
    });
    await waitFor(() => expect(screen.getByRole('option', { name: /adapalene gel/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /adapalene gel/i }));
    expect(screen.getByText(/total/i).textContent).toContain('Rs 300');

    fireEvent.change(screen.getByPlaceholderText(/search medicine/i), {
      target: { value: 'Custom Balm' },
    });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /add "Custom Balm" as free text/i })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('option', { name: /add "Custom Balm" as free text/i }));
    expect(screen.getByText(/1 item\(s\) not priced/i)).toBeTruthy();
  });

  it('submit requires the immutability confirm, then POSTs the right body', async () => {
    api.post.mockResolvedValue({ id: 'rx1' });
    setup();
    await waitFor(() => expect(screen.getByPlaceholderText(/search medicine/i)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/search medicine/i), { target: { value: 'ada' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /adapalene gel/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /adapalene gel/i }));

    fireEvent.change(screen.getByLabelText(/dosage/i), { target: { value: '1x daily' } });
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '7 days' } });
    fireEvent.change(screen.getByLabelText(/instructions/i), { target: { value: 'after meals' } });

    fireEvent.click(screen.getByRole('button', { name: /submit prescription/i }));
    // Immutability confirmation step (doc 06 D-05 interaction):
    await waitFor(() => expect(screen.getByText(/cannot be edited/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /confirm & issue/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/appointments/a1/prescriptions', {
        items: [
          { medicineId: 'm1', dosage: '1x daily', duration: '7 days', instructions: 'after meals' },
        ],
      }),
    );
  });
});

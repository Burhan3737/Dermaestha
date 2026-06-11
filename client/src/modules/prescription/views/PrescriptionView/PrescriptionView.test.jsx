import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrescriptionView } from './PrescriptionView.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn() } }));
vi.mock('../../../../context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));
vi.mock('../../../../lib/pdf/renderPrescriptionPdf.js', () => ({
  renderPrescriptionPdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/appointments/a1/prescriptions']}>
        <Routes>
          <Route path="/appointments/:id/prescriptions" element={<PrescriptionView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

const RX = (over = {}) => ({
  id: 'rx1',
  issuedAt: '2099-01-04T09:00:00.000Z',
  doctorSnapshot: { name: 'Dr A', pmcNumber: 'PMC-1001', specialization: 'Acne' },
  patientIdSnapshot: { forSelf: false, name: 'Ali', age: 9, relation: 'son' },
  notes: null,
  followUpDate: null,
  items: [
    { id: 'i1', medicineName: 'Adapalene Gel', dosage: '1x', duration: '7d', instructions: 'pm', price: 30000 },
    { id: 'i2', medicineName: 'Custom Balm', dosage: '2x', duration: '5d', instructions: 'am', price: null },
  ],
  ...over,
});

describe('P-13 prescription view', () => {
  it('renders items with price, "not priced", computed total and the not-priced note', async () => {
    api.get.mockResolvedValue({ data: [RX()] });
    setup();
    await waitFor(() => expect(screen.getByText('Adapalene Gel')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/appointments/a1/prescriptions');
    expect(screen.getByText(/not priced$/i)).toBeTruthy();
    expect(screen.getByText(/total/i).textContent).toContain('Rs 300');
    expect(screen.getByText(/1 item\(s\) not priced/i)).toBeTruthy();
  });

  it('renders corrections chronologically, each with its own Download button', async () => {
    api.get.mockResolvedValue({
      data: [RX(), RX({ id: 'rx2', issuedAt: '2099-01-05T09:00:00.000Z' })],
    });
    setup();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /download pdf/i })).toHaveLength(2),
    );
  });
});

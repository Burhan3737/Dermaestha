import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '#src/lib/apiClient/apiClient.js';
import { AdminReview } from '#src/modules/admin/views/AdminReview/AdminReview.jsx';

const PENDING_ROW = {
  id: 'a1',
  slotStart: '2099-01-02T13:00:00Z',
  slotEnd: '2099-01-02T13:30:00Z',
  state: 'pending',
  patientName: 'Parent P',
  patientEmail: 'p@t.test',
  subjectName: 'Ali',
  doctorName: 'Dr A',
  amountDue: 250000,
  paymentReference: 'bank_txn_77',
  paymentSubmittedAt: '2099-01-02T12:00:00Z',
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminReview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('AdminReview (A-06)', () => {
  it('lists pending rows with patient/doctor/slot/amount/reference and queries state=pending', async () => {
    api.get.mockResolvedValue({ data: [PENDING_ROW] });
    renderView();
    expect(await screen.findByText('Parent P')).toBeTruthy();
    expect(screen.getByText(/for: Ali/)).toBeTruthy();
    expect(screen.getByText('Dr A')).toBeTruthy();
    expect(screen.getByText('Rs 2,500')).toBeTruthy();
    expect(screen.getByText('bank_txn_77')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/admin/records?state=pending');
  });

  it('Accept posts to the accept endpoint and the row drops off after refetch', async () => {
    api.get
      .mockResolvedValueOnce({ data: [PENDING_ROW] })
      .mockResolvedValueOnce({ data: [] });
    api.post.mockResolvedValue({ state: 'confirmed' });
    renderView();
    await screen.findByText('Parent P');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/appointments/a1/accept'),
    );
    await waitFor(() => expect(screen.getByText(/no payments awaiting review/i)).toBeTruthy());
  });

  it('Reject posts to the reject endpoint', async () => {
    api.get.mockResolvedValue({ data: [PENDING_ROW] });
    api.post.mockResolvedValue({ state: 'cancelled' });
    renderView();
    await screen.findByText('Parent P');
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/appointments/a1/reject'),
    );
  });

  it('shows the empty state when nothing is awaiting review', async () => {
    api.get.mockResolvedValue({ data: [] });
    renderView();
    expect(await screen.findByText(/no payments awaiting review/i)).toBeTruthy();
  });
});

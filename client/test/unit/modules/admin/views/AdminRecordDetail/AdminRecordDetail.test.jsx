import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '#src/lib/apiClient/apiClient.js';
import { AdminRecordDetail } from '#src/modules/admin/views/AdminRecordDetail/AdminRecordDetail.jsx';

const DETAIL = {
  appointment: {
    id: 'a1',
    slotStart: '2099-01-02T13:00:00Z',
    slotEnd: '2099-01-02T13:30:00Z',
    state: 'completed',
    patientName: 'Parent P',
    patientEmail: 'p@t.test',
    subjectName: 'Ali',
    doctorName: 'Dr A',
    amountDue: 250000,
    paymentReference: 'bank_txn_77',
    paymentSubmittedAt: '2099-01-02T12:00:00Z',
  },
  history: [
    {
      id: 'e1',
      at: '2099-01-02T12:00:00Z',
      eventType: 'appointment.confirmed',
      actorType: 'system',
      reason: null,
    },
    {
      id: 'e2',
      at: '2099-01-02T14:00:00Z',
      eventType: 'prescription.issued',
      actorType: 'doctor',
      reason: null,
    },
  ],
  prescriptions: [
    {
      id: 'rx1',
      issuedAt: '2099-01-02T14:00:00Z',
      items: [{ id: 'i1', medicineName: 'Adapalene Gel' }],
    },
  ],
  notificationJobs: [
    { id: 'n1', type: 'booking_confirmation', status: 'sent', lastError: null },
    { id: 'n2', type: 'prescription_ready', status: 'failed', lastError: 'SMTP boom' },
  ],
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/records/a1']}>
        <Routes>
          <Route path="/admin/records/:id" element={<AdminRecordDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(DETAIL);
});

describe('AdminRecordDetail (A-04 detail)', () => {
  it('shows the transition history and linked prescriptions', async () => {
    renderView();
    expect(await screen.findByText('appointment.confirmed')).toBeTruthy();
    expect(screen.getByText('prescription.issued')).toBeTruthy();
    expect(screen.getByText('Adapalene Gel')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/admin/records/a1');
  });

  it('renders state via the shared label + amount + payment ref, with no refund/dispute UI', async () => {
    renderView();
    await screen.findByText('appointment.confirmed');
    expect(screen.getByText('Completed')).toBeTruthy(); // shared stateLabel, not raw enum
    expect(screen.getByText(/Rs 2,500/)).toBeTruthy();
    expect(screen.getByText(/bank_txn_77/)).toBeTruthy();
    expect(screen.queryByText(/Refund ref/i)).toBeNull();
    expect(screen.queryByText('Disputed')).toBeNull();
    expect(screen.queryByRole('button', { name: /disputed/i })).toBeNull();
  });

  it('resend is offered ONLY on failed jobs and confirms before POSTing', async () => {
    api.post.mockResolvedValue({ id: 'n2', status: 'pending' });
    renderView();
    await screen.findByText('appointment.confirmed');
    const resendButtons = screen.getAllByRole('button', { name: 'Resend' });
    expect(resendButtons).toHaveLength(1); // only the failed prescription_ready job
    fireEvent.click(resendButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Resend email' })); // confirm modal
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/emails/n2/resend'));
  });

  it('resend failure keeps the modal open with the error and the Resend button intact', async () => {
    api.post.mockRejectedValue(
      Object.assign(new Error('Email job is no longer in failed state.'), {
        code: 'INVALID_STATE',
        status: 409,
      }),
    );
    renderView();
    await screen.findByText('appointment.confirmed');
    fireEvent.click(screen.getAllByRole('button', { name: 'Resend' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    expect(await screen.findByText('Email job is no longer in failed state.')).toBeTruthy();
    // modal still open (confirm button still there) and table Resend still present
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Resend' })).toHaveLength(1);
  });
});

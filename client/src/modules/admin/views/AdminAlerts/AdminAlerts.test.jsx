import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '../../../../lib/apiClient/apiClient.js';
import { AdminAlerts } from './AdminAlerts.jsx';

const ALERTS = {
  data: [
    {
      id: 'e1', kind: 'email.send_failed_final', at: '2099-01-10T11:00:00Z', targetRef: 'a1',
      reason: 'prescription_ready: boom',
      failedJobs: [{ id: 'n9', appointmentId: 'a1', type: 'prescription_ready', status: 'failed' }],
    },
    { id: 'awaiting_a3', kind: 'awaiting_prescription', at: '2099-01-09T18:00:00Z', targetRef: 'a3', reason: 'No prescription 12h after the consultation with Dr A.' },
    { id: 'e2', kind: 'payment.refund_exhausted', at: '2099-01-09T10:00:00Z', targetRef: 'a2', reason: 'gateway 500' },
  ],
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminAlerts />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(ALERTS);
});

describe('AdminAlerts (A-03)', () => {
  it('renders alert cards with kind badges and record links', async () => {
    renderView();
    expect(await screen.findByText('gateway 500')).toBeTruthy();
    expect(screen.getByText('Awaiting prescription')).toBeTruthy();
    const links = screen.getAllByRole('link', { name: 'View record' });
    expect(links[0].getAttribute('href')).toBe('/admin/records/a1');
  });

  it('resend appears only on email-failure alerts and POSTs the failed job (F12.02)', async () => {
    api.post.mockResolvedValue({ id: 'n9', status: 'pending' });
    renderView();
    await screen.findByText('gateway 500');
    const resend = screen.getAllByRole('button', { name: /Resend prescription_ready/ });
    expect(resend).toHaveLength(1);
    fireEvent.click(resend[0]);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/emails/n9/resend'));
  });
});

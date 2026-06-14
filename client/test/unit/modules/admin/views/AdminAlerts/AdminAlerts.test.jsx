import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '#src/lib/apiClient/apiClient.js';
import { AdminAlerts } from '#src/modules/admin/views/AdminAlerts/AdminAlerts.jsx';

const ALERTS = {
  data: [
    {
      id: 'e1',
      kind: 'email.send_failed_final',
      at: '2099-01-10T11:00:00Z',
      targetRef: 'a1',
      reason: 'prescription_ready: boom',
      failedJobs: [{ id: 'n9', appointmentId: 'a1', type: 'prescription_ready', status: 'failed' }],
    },
    {
      id: 'awaiting_a3',
      kind: 'awaiting_prescription',
      at: '2099-01-09T18:00:00Z',
      targetRef: 'a3',
      reason: 'No prescription 12h after the consultation with Dr A.',
    },
    {
      id: 'e2',
      kind: 'payment.refund_exhausted',
      at: '2099-01-09T10:00:00Z',
      targetRef: 'a2',
      reason: 'gateway 500',
    },
    {
      id: 'e3',
      kind: 'system.unhandled_exception',
      at: '2099-01-08T09:00:00Z',
      targetRef: '/api/payments/x',
      reason: 'kaboom',
    },
  ],
};

const TWO_EMAIL_ALERTS = {
  data: [
    {
      id: 'e10',
      kind: 'email.send_failed_final',
      at: '2099-01-10T11:00:00Z',
      reason: 'first failure',
      failedJobs: [{ id: 'n1', appointmentId: 'a1', type: 'prescription_ready', status: 'failed' }],
    },
    {
      id: 'e20',
      kind: 'email.send_failed_final',
      at: '2099-01-10T10:00:00Z',
      reason: 'second failure',
      failedJobs: [
        { id: 'n2', appointmentId: 'a2', type: 'appointment_confirmed', status: 'failed' },
      ],
    },
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

  it('exception alerts show no record link (targetRef is a route path)', async () => {
    renderView();
    // Wait for cards to render
    expect(await screen.findByText('kaboom')).toBeTruthy();
    // The exception card must have no "View record" link
    const exceptionCard = screen.getByTestId('e3');
    expect(within(exceptionCard).queryByRole('link', { name: 'View record' })).toBeNull();
    // The other three cards (e1, awaiting_a3, e2) each have a targetRef and are not exceptions
    const links = screen.getAllByRole('link', { name: 'View record' });
    expect(links).toHaveLength(3);
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

  it('only the clicked resend button spins', async () => {
    api.get.mockResolvedValue(TWO_EMAIL_ALERTS);
    api.post.mockImplementation(() => new Promise(() => {}));
    renderView();
    await screen.findByText('first failure');
    const buttons = screen.getAllByRole('button', { name: /Resend/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(buttons[0].disabled).toBe(true));
    expect(buttons[1].disabled).toBe(false);
  });

  it('resend failure shows the error inside the affected card', async () => {
    api.get.mockResolvedValue(TWO_EMAIL_ALERTS);
    api.post.mockRejectedValue(
      Object.assign(new Error('No longer failed'), { code: 'INVALID_STATE', status: 409 }),
    );
    renderView();
    await screen.findByText('first failure');
    const buttons = screen.getAllByRole('button', { name: /Resend/ });
    fireEvent.click(buttons[0]);
    const errorMsg = await screen.findByText('No longer failed');
    const firstCard = screen.getByTestId('e10');
    const secondCard = screen.getByTestId('e20');
    expect(firstCard.contains(errorMsg)).toBe(true);
    expect(within(secondCard).queryByText('No longer failed')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '../../../../lib/apiClient/apiClient.js';
import { AdminDoctors } from './AdminDoctors.jsx';

const DOCTORS = {
  data: [
    {
      id: 'd1', fullName: 'Dr Ayesha Khan', email: 'a@x.dev', phone: '0300', pmcNumber: 'PMC-1001',
      specialization: 'Acne', fee: 250000, bio: 'b', photoUrl: null,
      isActive: true, status: 'active', upcomingConfirmedCount: 3,
    },
    {
      id: 'd2', fullName: 'Dr Pending', email: 'p@x.dev', phone: '0301', pmcNumber: 'PMC-2002',
      specialization: 'Eczema', fee: 300000, bio: 'b', photoUrl: null,
      isActive: false, status: 'pending', upcomingConfirmedCount: 0,
    },
  ],
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminDoctors />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(DOCTORS);
});

describe('AdminDoctors (A-01)', () => {
  it('lists every doctor with status badges via includeInactive', async () => {
    renderView();
    expect(await screen.findByText('Dr Ayesha Khan')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/doctors?includeInactive=true');
  });

  it('deactivation goes through a warning modal that shows the upcoming-confirmed count (#9)', async () => {
    api.post.mockResolvedValue({ id: 'd1', isActive: false });
    renderView();
    await screen.findByText('Dr Ayesha Khan');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(api.post).not.toHaveBeenCalled(); // nothing happens before confirm
    expect(screen.getByText(/3 upcoming confirmed appointment/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate doctor' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/doctors/d1/deactivate'));
  });

  it('reset-password modal posts the admin-set password (DA5)', async () => {
    api.post.mockResolvedValue({ ok: true });
    renderView();
    await screen.findByText('Dr Ayesha Khan');
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset password' })[0]);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/doctors/d1/reset-password', { newPassword: 'NewPass123' }),
    );
  });

  it('activate posts reactivate for an inactive doctor', async () => {
    api.post.mockResolvedValue({ id: 'd2', isActive: true });
    renderView();
    await screen.findByText('Dr Pending');
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/doctors/d2/reactivate'));
  });

  it('cancelling the reset modal clears the typed password and stale error', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('Too weak'), { code: 'VALIDATION', status: 400 }));
    renderView();
    await screen.findByText('Dr Ayesha Khan');
    // open reset modal on d1, type a password, submit to trigger error
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset password' })[0]);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'weak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() => expect(screen.getByText('Too weak')).toBeTruthy());
    // cancel — should clear password state and mutation error
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // re-open reset modal (d1's button)
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset password' })[0]);
    await waitFor(() => {
      expect(screen.getByLabelText('New password').value).toBe('');
      expect(screen.queryByText('Too weak')).toBeNull();
    });
  });

  it('deactivation modal surfaces the API error', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('Server down'), { code: 'INTERNAL', status: 500 }));
    renderView();
    await screen.findByText('Dr Ayesha Khan');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate doctor' }));
    await waitFor(() => expect(screen.getByText('Server down')).toBeTruthy());
    // modal is still open (onSuccess never fired)
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '#src/lib/apiClient/apiClient.js';
import { AdminSettings } from '#src/modules/admin/views/AdminSettings/AdminSettings.jsx';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({
    id: 1,
    minBookingLeadMinutes: 60,
    fallbackFeePctBps: 250,
    fallbackFeeFixed: 5000,
  });
});

describe('AdminSettings (A-05)', () => {
  it('pre-fills current values (fee fixed shown in PKR)', async () => {
    renderView();
    expect(await screen.findByLabelText('Minimum booking lead time (minutes)')).toHaveProperty(
      'value',
      '60',
    );
    expect(screen.getByLabelText('Fallback fee — percentage (basis points)')).toHaveProperty(
      'value',
      '250',
    );
    expect(screen.getByLabelText('Fallback fee — fixed (PKR)')).toHaveProperty('value', '50');
  });

  it('save confirms, then PUTs the bounded payload with paisa conversion', async () => {
    api.put.mockResolvedValue({ id: 1 });
    renderView();
    const lead = await screen.findByLabelText('Minimum booking lead time (minutes)');
    fireEvent.change(lead, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(api.put).not.toHaveBeenCalled(); // confirm gate first — these values steer money math
    fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin/settings', {
        minBookingLeadMinutes: 30,
        fallbackFeePctBps: 250,
        fallbackFeeFixed: 5000,
      }),
    );
  });

  it('PUT failure closes the modal and surfaces the error', async () => {
    api.put.mockRejectedValue(
      Object.assign(new Error('Validation failed'), { code: 'VALIDATION_FAILED', status: 400 }),
    );
    renderView();
    await screen.findByLabelText('Minimum booking lead time (minutes)');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
    expect(await screen.findByText('Validation failed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm save' })).toBeNull(); // modal closed
  });

  it('unseeded settings shows the empty state', async () => {
    api.get.mockResolvedValue(null);
    renderView();
    expect(await screen.findByText(/No settings record found/)).toBeTruthy();
  });
});

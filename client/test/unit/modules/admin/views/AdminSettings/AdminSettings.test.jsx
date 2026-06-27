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
    bankName: 'Meezan Bank',
    bankAccountName: 'Dermestha Clinic',
    bankAccountNumber: '0123456789',
    bankInstructions: 'Add your name in the transfer note.',
  });
});

describe('AdminSettings (A-05)', () => {
  it('pre-fills current values incl. bank details and has no fallback-fee fields', async () => {
    renderView();
    expect(await screen.findByLabelText('Minimum booking lead time (minutes)')).toHaveProperty(
      'value',
      '60',
    );
    expect(screen.getByLabelText('Bank name')).toHaveProperty('value', 'Meezan Bank');
    expect(screen.getByLabelText('Account name')).toHaveProperty('value', 'Dermestha Clinic');
    expect(screen.getByLabelText('Account number')).toHaveProperty('value', '0123456789');
    expect(screen.getByLabelText('Bank instructions')).toHaveProperty(
      'value',
      'Add your name in the transfer note.',
    );
    expect(screen.queryByLabelText(/fallback fee/i)).toBeNull();
  });

  it('save confirms, then PUTs the lead time + bank details', async () => {
    api.put.mockResolvedValue({ id: 1 });
    renderView();
    const lead = await screen.findByLabelText('Minimum booking lead time (minutes)');
    fireEvent.change(lead, { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Account number'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(api.put).not.toHaveBeenCalled(); // confirm gate first
    fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin/settings', {
        minBookingLeadMinutes: 30,
        bankName: 'Meezan Bank',
        bankAccountName: 'Dermestha Clinic',
        bankAccountNumber: '999',
        bankInstructions: 'Add your name in the transfer note.',
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
    expect(screen.queryByRole('button', { name: 'Confirm save' })).toBeNull();
  });

  it('unseeded settings shows the empty state', async () => {
    api.get.mockResolvedValue(null);
    renderView();
    expect(await screen.findByText(/No settings record found/)).toBeTruthy();
  });
});

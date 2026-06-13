import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '../../../../lib/apiClient/apiClient.js';
import { AdminMedicines } from './AdminMedicines.jsx';

const MEDS = {
  data: [
    { id: 'm1', name: 'Adapalene Gel', genericName: 'Adapalene', dosageForms: ['gel'], unitPrice: 30000, isActive: true },
    { id: 'm2', name: 'Old Balm', genericName: null, dosageForms: ['cream'], unitPrice: 10000, isActive: false },
  ],
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminMedicines />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(MEDS);
});

describe('AdminMedicines (A-02)', () => {
  it('lists all medicines incl. deactivated, with PKR prices and status badges', async () => {
    renderView();
    expect(await screen.findByText('Adapalene Gel')).toBeTruthy();
    expect(screen.getByText('Old Balm')).toBeTruthy();
    expect(screen.getByText('Rs 300')).toBeTruthy(); // 30000 paisa
    expect(screen.getByText('Deactivated')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/medicines?includeInactive=true');
  });

  it('deactivate button PATCHes isActive=false', async () => {
    api.patch.mockResolvedValue({ id: 'm1', isActive: false });
    renderView();
    await screen.findByText('Adapalene Gel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]);
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/admin/medicines/m1', { isActive: false }),
    );
  });

  it('add form POSTs name, dosage forms and paisa price', async () => {
    api.post.mockResolvedValue({ id: 'm3' });
    renderView();
    await screen.findByText('Adapalene Gel');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tretinoin' } });
    fireEvent.change(screen.getByLabelText('Dosage forms (comma-separated)'), {
      target: { value: 'cream, gel' },
    });
    fireEvent.change(screen.getByLabelText('Unit price (PKR)'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add medicine' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/medicines', {
        name: 'Tretinoin',
        dosageForms: ['cream', 'gel'],
        unitPrice: 20000,
      }),
    );
  });
});

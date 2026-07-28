import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'admin' } }),
}));

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '#src/lib/apiClient/apiClient.js';
import { AdminMedicines } from '#src/modules/admin/views/AdminMedicines/AdminMedicines.jsx';

const MEDS = {
  data: [
    {
      id: 'm1',
      name: 'Adapalene Gel',
      genericName: 'Adapalene',
      dosageForms: ['gel'],
      unitPrice: 30000,
      isActive: true,
    },
    {
      id: 'm2',
      name: 'Old Balm',
      genericName: null,
      dosageForms: ['cream'],
      unitPrice: 10000,
      isActive: false,
    },
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
    const { container } = renderView();
    await screen.findByText('Adapalene Gel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]); // opens confirm
    // deactivation is destructive → danger accent
    expect(container.querySelector('.modal .modal__accent--danger')).toBeTruthy();
    expect(api.patch).not.toHaveBeenCalled(); // gated until confirm
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate medicine' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/admin/medicines/m1', { isActive: false }),
    );
  });

  it('Edit prefills the form and PATCHes the changed fields (ISSUE-7 / F11.03)', async () => {
    api.patch.mockResolvedValue({ id: 'm1' });
    renderView();
    await screen.findByText('Adapalene Gel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    // form prefilled from the row
    expect(screen.getByLabelText('Name').value).toBe('Adapalene Gel');
    expect(screen.getByLabelText('Unit price (PKR)').value).toBe('300');
    fireEvent.change(screen.getByLabelText('Unit price (PKR)'), { target: { value: '350' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/admin/medicines/m1',
        expect.objectContaining({ name: 'Adapalene Gel', unitPrice: 35000 }),
      ),
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

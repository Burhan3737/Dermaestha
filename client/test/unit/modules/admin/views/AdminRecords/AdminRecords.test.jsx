import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), upload: vi.fn() },
}));

import { api } from '#src/lib/apiClient/apiClient.js';
import { AdminRecords } from '#src/modules/admin/views/AdminRecords/AdminRecords.jsx';

const RECORDS = {
  data: [
    {
      id: 'a1',
      slotStart: '2099-01-02T13:00:00Z',
      slotEnd: '2099-01-02T13:30:00Z',
      state: 'confirmed',
      patientName: 'Parent P',
      patientEmail: 'p@t.test',
      subjectName: 'Ali',
      doctorName: 'Dr A',
      amountDue: 250000,
      paymentReference: 'bank_txn_77',
      paymentSubmittedAt: '2099-01-02T12:00:00Z',
    },
  ],
  page: { number: 1, size: 20, total: 45 },
};
const AUDIT = {
  data: [
    {
      id: 'e1',
      at: '2099-01-02T13:05:00Z',
      eventType: 'appointment.confirmed',
      actorType: 'system',
      actorId: null,
      targetRef: 'a1',
      reason: null,
    },
  ],
  page: { number: 1, size: 50, total: 1 },
};

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminRecords />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) =>
    Promise.resolve(path.startsWith('/admin/audit') ? AUDIT : RECORDS),
  );
});

describe('AdminRecords (A-04)', () => {
  it('renders record rows with who-for, amount + payment ref and the shared state label', async () => {
    renderView();
    expect(await screen.findByText('Parent P')).toBeTruthy();
    expect(screen.getByText(/for: Ali/)).toBeTruthy();
    expect(screen.getByText('Rs 2,500')).toBeTruthy();
    expect(screen.getByText('bank_txn_77')).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy(); // shared stateLabel, not the raw enum
    expect(screen.queryByText('confirmed')).toBeNull();
    expect(screen.queryByText('Disputed')).toBeNull();
    expect(screen.queryByText('Refund ref')).toBeNull();
    expect(screen.getByText(/Page 1 of 3/)).toBeTruthy(); // 45 / 20
  });

  it('filter submit re-queries with the filter querystring', async () => {
    renderView();
    await screen.findByText('Parent P');
    fireEvent.change(screen.getByLabelText('Patient email / phone'), {
      target: { value: 'p@t.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('patient=p%40t.test')),
    );
  });

  it('audit tab lists audit entries from /admin/audit', async () => {
    renderView();
    await screen.findByText('Parent P');
    fireEvent.click(screen.getByRole('button', { name: 'Audit log' }));
    expect(await screen.findByText('appointment.confirmed')).toBeTruthy();
  });
});

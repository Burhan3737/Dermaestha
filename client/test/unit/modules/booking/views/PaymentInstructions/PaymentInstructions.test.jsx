import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentInstructions } from '#src/modules/booking/views/PaymentInstructions/PaymentInstructions.jsx';
import { api } from '#src/lib/apiClient/apiClient.js';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));

const PENDING = {
  id: 'a1',
  state: 'pending',
  slotStart: '2099-01-04T13:00:00.000Z',
  slotEnd: '2099-01-04T13:30:00.000Z',
  doctorName: 'Dr A',
  paymentReference: null,
  paymentInstructions: {
    amountDue: 250000,
    bankName: 'Meezan Bank',
    bankAccountName: 'Dermestha Clinic',
    bankAccountNumber: '0123456789',
    bankInstructions: 'Add your name in the transfer note.',
  },
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/book/pay/a1']}>
        <Routes>
          <Route path="/book/pay/:id" element={<PaymentInstructions />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-07 PaymentInstructions (manual payment)', () => {
  it('renders the bank details and amount due', async () => {
    api.get.mockResolvedValue(PENDING);
    setup();
    expect(await screen.findByText('Meezan Bank')).toBeTruthy();
    expect(screen.getByText('Dermestha Clinic')).toBeTruthy();
    expect(screen.getByText('0123456789')).toBeTruthy();
    expect(screen.getByText(/Rs 2,500/)).toBeTruthy();
    expect(screen.getByText(/Add your name in the transfer note/)).toBeTruthy();
  });

  it('submits the bank reference to POST /appointments/:id/pay', async () => {
    api.get.mockResolvedValue(PENDING);
    api.post.mockResolvedValue({ ok: true });
    setup();
    await screen.findByText('Meezan Bank');
    fireEvent.change(screen.getByLabelText(/bank transaction reference/i), {
      target: { value: 'TXN-789' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit reference/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/appointments/a1/pay', { reference: 'TXN-789' }),
    );
  });

  it('shows the awaiting-confirmation state once a reference has been submitted', async () => {
    api.get.mockResolvedValue({ ...PENDING, paymentReference: 'TXN-789' });
    setup();
    expect(await screen.findByText(/awaiting confirmation/i)).toBeTruthy();
    expect(screen.queryByLabelText(/bank transaction reference/i)).toBeNull();
  });

  it('disables submit until the reference is at least 3 characters', async () => {
    api.get.mockResolvedValue(PENDING);
    setup();
    await screen.findByText('Meezan Bank');
    const btn = screen.getByRole('button', { name: /submit reference/i });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/bank transaction reference/i), {
      target: { value: 'ab' },
    });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/bank transaction reference/i), {
      target: { value: 'abc' },
    });
    expect(btn.disabled).toBe(false);
  });
});

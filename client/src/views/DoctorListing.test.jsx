import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorListing } from './DoctorListing.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: null }) }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><DoctorListing /></MemoryRouter></QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-02 Doctor listing', () => {
  it('renders a card per active doctor', async () => {
    api.get.mockResolvedValue({ data: [
      { id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, photoUrl: null, nextAvailableSlot: null },
      { id: 'd2', fullName: 'Dr B', specialization: 'Eczema', fee: 300000, photoUrl: null, nextAvailableSlot: null },
    ], page: { number: 1, size: 20, total: 2 } });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByText('Dr B')).toBeTruthy();
  });
  it('shows an empty state when there are no doctors', async () => {
    api.get.mockResolvedValue({ data: [], page: { number: 1, size: 20, total: 0 } });
    setup();
    await waitFor(() => expect(screen.getByText(/no doctors/i)).toBeTruthy());
  });
});

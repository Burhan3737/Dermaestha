import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorProfile } from './DoctorProfile.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../../context/session/session.jsx', () => ({ useSession: () => ({ session: null }) }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/doctors/d1']}>
        <Routes>
          <Route path="/doctors/:id" element={<DoctorProfile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-03 Doctor profile', () => {
  it('renders the profile and available slots', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/doctors/d1')
        return Promise.resolve({
          id: 'd1',
          fullName: 'Dr A',
          specialization: 'Acne',
          fee: 250000,
          bio: 'Bio',
          photoUrl: null,
        });
      return Promise.resolve({
        data: [{ slotStart: '2026-06-15T13:00:00.000Z', slotEnd: '2026-06-15T13:30:00.000Z' }],
      });
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByText('Rs 2,500')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('exposes day navigation and fetches a future day’s slots (ISSUE-1)', async () => {
    const todayYMD = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

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
      // slots path: /doctors/d1/slots?date=YYYY-MM-DD — echo a slot stamped for the requested day.
      const date = path.split('date=')[1];
      return Promise.resolve({ data: [{ slotStart: `${date}T09:00:00.000Z`, slotEnd: `${date}T09:30:00.000Z` }] });
    });

    const { container } = setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());

    // P-03 must offer day navigation (doc 06 §3 "Slots are grouped under day tabs"), not just today.
    const dayTabs = container.querySelectorAll('.day-tab');
    expect(dayTabs.length).toBeGreaterThan(1);

    // Selecting a different day must fetch THAT day's slots (F03.01 future-slots-only).
    fireEvent.click(dayTabs[dayTabs.length - 1]);
    await waitFor(() => {
      const slotsCalls = api.get.mock.calls
        .map((c) => c[0])
        .filter((p) => typeof p === 'string' && p.includes('/slots?date='));
      const dates = slotsCalls.map((p) => p.split('date=')[1]);
      expect(dates.some((d) => d !== todayYMD)).toBe(true);
    });
  });
});

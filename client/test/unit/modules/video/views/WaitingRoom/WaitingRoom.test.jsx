// client/src/modules/video/views/WaitingRoom/WaitingRoom.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WaitingRoom } from '#src/modules/video/views/WaitingRoom/WaitingRoom.jsx';
import { api } from '#src/lib/apiClient/apiClient.js';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));

function detail({ startOffsetMs }) {
  const start = new Date(Date.now() + startOffsetMs);
  return {
    id: 'a1',
    state: 'confirmed',
    doctorName: 'Dr A',
    specialization: 'Acne',
    slotStart: start.toISOString(),
    slotEnd: new Date(start.getTime() + 18e5).toISOString(),
    forSelf: true,
    subjectName: null,
  };
}
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/video/a1/ready']}>
        <Routes>
          <Route path="/video/:id/ready" element={<WaitingRoom />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe('P-11 WaitingRoom', () => {
  it('shows the doctor context and the lighting tip', async () => {
    api.get.mockImplementation((p) =>
      p.includes('video-token')
        ? Promise.resolve({ joinSimUrl: null })
        : Promise.resolve(detail({ startOffsetMs: 60 * 60 * 1000 })),
    );
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByText(/well-lit/i)).toBeTruthy();
    expect(screen.getByText(/with you shortly/i)).toBeTruthy();
  });

  it('disables Join more than 10 minutes before the slot', async () => {
    api.get.mockImplementation((p) =>
      p.includes('video-token')
        ? Promise.resolve({ joinSimUrl: null })
        : Promise.resolve(detail({ startOffsetMs: 60 * 60 * 1000 })),
    );
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByRole('button', { name: /join call/i })).toHaveProperty('disabled', true);
  });

  it('enables Join inside the 10-minute window, linking to the call', async () => {
    api.get.mockImplementation((p) =>
      p.includes('video-token')
        ? Promise.resolve({ joinSimUrl: null })
        : Promise.resolve(detail({ startOffsetMs: 5 * 60 * 1000 })),
    );
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    const join = screen.getByRole('link', { name: /join call/i });
    expect(join.getAttribute('href')).toBe('/video/a1');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VideoRoom } from './VideoRoom.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: { role: 'patient' } }) }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/video/a1']}>
        <Routes>
          <Route path="/video/:id" element={<VideoRoom />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe('VideoRoom', () => {
  it('shows the waiting room until the peer joins', async () => {
    api.get.mockImplementation((path) =>
      path.includes('video-token')
        ? Promise.resolve({
            token: 't',
            roomName: 'appt_a1',
            roomUrl: 'u',
            serverNow: new Date().toISOString(),
            joinSimUrl: null,
          })
        : Promise.resolve({
            id: 'a1',
            state: 'in_progress',
            peerJoined: false,
            slotStart: new Date().toISOString(),
            slotEnd: new Date(Date.now() + 18e5).toISOString(),
            serverNow: new Date().toISOString(),
          }),
    );
    setup();
    await waitFor(() => expect(screen.getByText(/will be with you shortly/i)).toBeTruthy());
  });

  it('shows the live stage once the peer has joined', async () => {
    api.get.mockImplementation((path) =>
      path.includes('video-token')
        ? Promise.resolve({
            token: 't',
            roomName: 'appt_a1',
            roomUrl: 'u',
            serverNow: new Date().toISOString(),
            joinSimUrl: null,
          })
        : Promise.resolve({
            id: 'a1',
            state: 'in_progress',
            peerJoined: true,
            slotStart: new Date().toISOString(),
            slotEnd: new Date(Date.now() + 18e5).toISOString(),
            serverNow: new Date().toISOString(),
          }),
    );
    setup();
    await waitFor(() => expect(screen.getByText(/live|in call|connected/i)).toBeTruthy());
  });
});

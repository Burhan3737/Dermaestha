import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VideoRoom } from './VideoRoom.jsx';
import { api } from '../lib/apiClient.js';

const h = vi.hoisted(() => ({ role: 'patient' }));
vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: { role: h.role } }) }));

function tokenResp() {
  return { token: 't', roomName: 'appt_a1', roomUrl: 'u', serverNow: new Date().toISOString(), joinSimUrl: null };
}
function detailResp({ peerJoined = false, endOffsetMs = 18e5 } = {}) {
  return {
    id: 'a1', state: 'in_progress', peerJoined,
    slotStart: new Date().toISOString(),
    slotEnd: new Date(Date.now() + endOffsetMs).toISOString(),
    serverNow: new Date().toISOString(),
  };
}
function mock({ peerJoined, endOffsetMs } = {}) {
  api.get.mockImplementation((path) =>
    path.includes('video-token') ? Promise.resolve(tokenResp()) : Promise.resolve(detailResp({ peerJoined, endOffsetMs })),
  );
}
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/video/a1']}>
        <Routes><Route path="/video/:id" element={<VideoRoom />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => { vi.clearAllMocks(); h.role = 'patient'; });

describe('VideoRoom', () => {
  it('shows the waiting room until the peer joins', async () => {
    mock({ peerJoined: false });
    setup();
    await waitFor(() => expect(screen.getByText(/will be with you shortly/i)).toBeTruthy());
  });

  it('shows the live stage once the peer has joined', async () => {
    mock({ peerJoined: true });
    setup();
    await waitFor(() => expect(screen.getByText(/live|in call|connected/i)).toBeTruthy());
  });

  it('shows a countdown timer during the call', async () => {
    mock({ peerJoined: true, endOffsetMs: 6e5 });
    setup();
    await waitFor(() => expect(screen.getByText(/time remaining/i)).toBeTruthy());
  });

  it('shows the ended state after the hard cutoff', async () => {
    mock({ peerJoined: true, endOffsetMs: -6e5 }); // slot ended 10 min ago → past slotEnd+5m
    setup();
    await waitFor(() => expect(screen.getByText(/session has ended/i)).toBeTruthy());
  });

  it('shows the doctor 5-minute soft warning near slot end', async () => {
    h.role = 'doctor';
    mock({ peerJoined: true, endOffsetMs: 3 * 60 * 1000 }); // 3 min to slot end
    setup();
    await waitFor(() => expect(screen.getByText(/5 minutes remaining/i)).toBeTruthy());
  });
});

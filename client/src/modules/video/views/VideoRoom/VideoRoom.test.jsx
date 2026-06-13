import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VideoRoom } from './VideoRoom.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

// The Daily mock fns live in vi.hoisted (not the vi.mock factory) so they exist even when
// `@daily-co/daily-js` is never imported — i.e. in mock mode, where the factory never runs.
const h = vi.hoisted(() => {
  const state = { role: 'patient', handlers: {}, frame: null, createFrame: null };
  state.frame = {
    on: vi.fn((evt, cb) => { state.handlers[evt] = cb; return state.frame; }),
    join: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  state.createFrame = vi.fn(() => state.frame);
  return state;
});
vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../../context/session/session.jsx', () => ({ useSession: () => ({ session: { role: h.role } }) }));
vi.mock('@daily-co/daily-js', () => ({ default: { createFrame: h.createFrame } }));

function tokenResp({ mock = false } = {}) {
  return { token: 't', roomName: 'appt_a1', roomUrl: 'u', serverNow: new Date().toISOString(),
    joinSimUrl: mock ? '/dev/video/join' : null };
}
function detailResp({ peerJoined = false, endOffsetMs = 18e5 } = {}) {
  return { id: 'a1', state: 'in_progress', peerJoined,
    slotStart: new Date().toISOString(),
    slotEnd: new Date(Date.now() + endOffsetMs).toISOString(),
    serverNow: new Date().toISOString() };
}
function mock({ peerJoined, endOffsetMs, mockMode = false } = {}) {
  api.get.mockImplementation((path) =>
    path.includes('video-token') ? Promise.resolve(tokenResp({ mock: mockMode }))
      : Promise.resolve(detailResp({ peerJoined, endOffsetMs })));
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
beforeEach(() => { vi.clearAllMocks(); h.role = 'patient'; h.handlers = {}; api.post.mockResolvedValue(undefined); });

describe('VideoRoom', () => {
  // --- mock/simulator path (dev/CI): placeholder stage retained ---
  it('mock mode: shows the waiting placeholder until the peer joins', async () => {
    mock({ peerJoined: false, mockMode: true });
    setup();
    await waitFor(() => expect(screen.getByText(/will be with you shortly/i)).toBeTruthy());
    expect(h.createFrame).not.toHaveBeenCalled();
  });

  it('mock mode: shows the live stage once the peer has joined', async () => {
    mock({ peerJoined: true, mockMode: true });
    setup();
    await waitFor(() => expect(screen.getByText(/live|connected/i)).toBeTruthy());
  });

  it('mock mode: records this participant join via the sim URL', async () => {
    mock({ peerJoined: false, mockMode: true });
    setup();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dev/video/join', { appointmentId: 'a1' }));
  });

  // --- real Daily path (joinSimUrl null): iframe mounts, chrome around it ---
  it('real mode: mounts the Daily Prebuilt frame', async () => {
    mock({ peerJoined: false });
    setup();
    await waitFor(() => expect(h.createFrame).toHaveBeenCalledTimes(1));
    expect(h.frame.join).toHaveBeenCalledWith({ url: 'u', token: 't' });
  });

  // --- app chrome (both modes) ---
  it('shows a countdown timer during the call', async () => {
    mock({ peerJoined: true, endOffsetMs: 6e5 });
    setup();
    await waitFor(() => expect(screen.getByText(/time remaining/i)).toBeTruthy());
  });

  it('shows the ended state after the hard cutoff (and does not mount Daily)', async () => {
    mock({ peerJoined: true, endOffsetMs: -6e5 });
    setup();
    await waitFor(() => expect(screen.getByText(/session has ended/i)).toBeTruthy());
    expect(h.createFrame).not.toHaveBeenCalled();
  });

  it('shows the doctor 5-minute soft warning near slot end', async () => {
    h.role = 'doctor';
    mock({ peerJoined: true, endOffsetMs: 3 * 60 * 1000 });
    setup();
    await waitFor(() => expect(screen.getByText(/5 minutes remaining/i)).toBeTruthy());
  });
});

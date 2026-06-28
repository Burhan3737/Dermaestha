import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VideoRoom } from '#src/modules/video/views/VideoRoom/VideoRoom.jsx';
import { api } from '#src/lib/apiClient/apiClient.js';

// The Daily mock fns live in vi.hoisted so they stay stable regardless of when useDailyCall
// lazy-imports `@daily-co/daily-js`.
const h = vi.hoisted(() => {
  const state = { role: 'patient', handlers: {}, frame: null, createFrame: null };
  state.frame = {
    on: vi.fn((evt, cb) => {
      state.handlers[evt] = cb;
      return state.frame;
    }),
    join: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  state.createFrame = vi.fn(() => state.frame);
  state.getCallInstance = vi.fn(() => null);
  return state;
});
vi.mock('#src/lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: h.role } }),
}));
vi.mock('@daily-co/daily-js', () => ({
  default: { createFrame: h.createFrame, getCallInstance: h.getCallInstance },
}));

function tokenResp() {
  return {
    token: 't',
    roomName: 'appt_a1',
    roomUrl: 'https://x.daily.co/appt_a1',
    serverNow: new Date().toISOString(),
  };
}
function detailResp({ endOffsetMs = 18e5 } = {}) {
  return {
    id: 'a1',
    state: 'in_progress',
    slotStart: new Date().toISOString(),
    slotEnd: new Date(Date.now() + endOffsetMs).toISOString(),
    serverNow: new Date().toISOString(),
  };
}
function mock({ endOffsetMs } = {}) {
  api.get.mockImplementation((path) =>
    path.includes('video-token')
      ? Promise.resolve(tokenResp())
      : Promise.resolve(detailResp({ endOffsetMs })),
  );
}
// Probe renders the current pathname so tests can assert where leave navigated to.
function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/video/a1']}>
        <Routes>
          <Route path="/video/:id" element={<VideoRoom />} />
          <Route path="/video/:id/ready" element={<div>waiting room</div>} />
          <Route path="/doctor" element={<div>doctor dashboard</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  h.role = 'patient';
  h.handlers = {};
  api.post.mockResolvedValue(undefined);
});

describe('VideoRoom', () => {
  // --- real Daily path: iframe mounts, app chrome around it ---
  it('mounts the Daily Prebuilt frame', async () => {
    mock();
    setup();
    await waitFor(() => expect(h.createFrame).toHaveBeenCalledTimes(1));
    expect(h.frame.join).toHaveBeenCalledWith({ url: 'https://x.daily.co/appt_a1', token: 't' });
  });

  it('shows a countdown timer during the call', async () => {
    mock({ endOffsetMs: 6e5 });
    setup();
    await waitFor(() => expect(screen.getByText(/time remaining/i)).toBeTruthy());
  });

  it('shows the ended state after the hard cutoff (and does not mount Daily)', async () => {
    mock({ endOffsetMs: -6e5 });
    setup();
    await waitFor(() => expect(screen.getByText(/session has ended/i)).toBeTruthy());
    expect(h.createFrame).not.toHaveBeenCalled();
  });

  it('shows the doctor 5-minute soft warning near slot end', async () => {
    h.role = 'doctor';
    mock({ endOffsetMs: 3 * 60 * 1000 });
    setup();
    await waitFor(() => expect(screen.getByText(/5 minutes remaining/i)).toBeTruthy());
  });

  // --- role-aware leave navigation (driven by Daily's left-meeting event) ---
  it('patient leave returns to the waiting room (/video/:id/ready)', async () => {
    h.role = 'patient';
    mock();
    setup();
    await waitFor(() => expect(h.handlers['left-meeting']).toBeTypeOf('function'));
    act(() => h.handlers['left-meeting']());
    expect(screen.getByTestId('location').textContent).toBe('/video/a1/ready');
  });

  it('doctor leave returns to the dashboard (/doctor)', async () => {
    h.role = 'doctor';
    mock();
    setup();
    await waitFor(() => expect(h.handlers['left-meeting']).toBeTypeOf('function'));
    act(() => h.handlers['left-meeting']());
    expect(screen.getByTestId('location').textContent).toBe('/doctor');
  });
});

# Slice H · S3 — Video Consultation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, on-brand video-consultation flow — patient and doctor join a real Daily Prebuilt room from their dashboards, wrapped in the app's timer/cutoff chrome, with KPI #3 join telemetry — while keeping the dev `mock`/simulator path green.

**Architecture:** A new `useDailyCall` hook lazy-imports `@daily-co/daily-js` (separate Rollup chunk, mirroring `renderPrescriptionPdf`'s `pdf-lib` dynamic import) and mounts a brand-themed `DailyIframe.createFrame` into a container ref. The single role-aware `VideoRoom` (P-12/D-04) renders the app chrome around that iframe in the real path, and retains the existing placeholder + `/dev/video/join` simulator when `joinSimUrl` is present (dev/CI). A lightweight `WaitingRoom` (P-11) is added at `/video/:id/ready`. A shared fire-and-forget `track.js` helper posts `video_join_*` events to `POST /api/analytics/events` (route lands in S6; calls no-op until then). P-08 and the already-built D-02 dashboard route their Join buttons through P-11 and emit `video_join_attempt`.

**Tech Stack:** React 19, react-router-dom v6, @tanstack/react-query v5, Vitest + @testing-library/react, `@daily-co/daily-js` ^0.91.0 (lazy-chunked).

---

## Context the implementer must know (read before starting)

- **`apiClient` prepends `/api`.** `client/src/lib/apiClient/apiClient.js` does `fetch('/api' + path)`. So to hit `POST /api/analytics/events` the helper MUST call `api.post('/analytics/events', …)`. The design spec's prose shows `api.post('/api/analytics/events', …)` literally; that would double-prefix to `/api/api/...`. We follow the apiClient contract: path is `'/analytics/events'`. (Tracked as a spec clarification for doc 05/14.)
- **`@daily-co/daily-js` default export.** `import DailyIframe from '@daily-co/daily-js'` → `DailyIframe.createFrame(...)`. Via dynamic import: `const DailyIframe = (await import('@daily-co/daily-js')).default`.
- **Only a *dynamic* import keeps it out of the main bundle.** Never add a static `import … from '@daily-co/daily-js'` anywhere — that would bundle it into the entry chunk and break the 3G budget.
- **Brand theme hex** (from `client/src/styles/tokens.css`): background `#072018` (`--color-dark-deep`), surface `#0A2C20` / `#0E3328`, border `#1F5440`, base text `#DCE9E2`, supportive `#AFC6BA`, accent `#B5852F` (`--color-accent`).
- **`GET /appointments/:id` (used by `useVideo`) returns**: `doctorName`, `specialization`, `slotStart`, `slotEnd`, `forSelf`, `subjectName`, `peerJoined`, `serverNow`, `state`. (Confirmed in `server/src/modules/appointment/test.js`.)
- **`GET /appointments/:id/video-token` returns**: `{ token, roomName, roomUrl, expiresAt, serverNow, joinSimUrl }`. `joinSimUrl` is `'/dev/video/join'` in `mock` mode, `null` with the real adapter (`server/src/modules/video/service.js`).
- **`@daily-co/daily-js` is already installed** in the client workspace and added to `client/package.json` (`^0.91.0`).
- **HARD constraints for every subagent:** do NOT create/edit/delete anything under `agentChangeLogs/`; do NOT edit/commit anything under `docs/specification/` (00–15) or `docs/superpowers/specs/`. The controller owns the session changelog and the spec edits.

## File structure

| Path | C/M | Responsibility |
| --- | --- | --- |
| `client/src/lib/analytics/track.js` | Create | Fire-and-forget analytics emitter (`track(type, meta)`). Owned by S3; reused by S4/S6. |
| `client/src/lib/analytics/track.test.js` | Create | Verifies the POST shape + that a rejected POST is swallowed. |
| `client/src/modules/video/useDailyCall.js` | Create | Lazy-loads Daily, themed `createFrame` + `join`, lifecycle events, `destroy` on unmount. |
| `client/src/modules/video/useDailyCall.test.jsx` | Create | createFrame/join lifecycle; `joined-meeting` → one `video_join_success`; destroy on unmount. |
| `client/src/modules/video/views/WaitingRoom/WaitingRoom.jsx` | Create | P-11 get-ready screen (doctor info, slot, lighting tip, status, gated Join → `/video/:id`). |
| `client/src/modules/video/views/WaitingRoom/WaitingRoom.test.jsx` | Create | Renders doctor context; Join disabled >10 min out, enabled inside window and links to call. |
| `client/src/modules/video/views/VideoRoom/VideoRoom.jsx` | Modify | Fold in `useDailyCall` (real path) + retain mock placeholder; keep timer/cutoff/doctor-warning/ended chrome. |
| `client/src/modules/video/views/VideoRoom/VideoRoom.test.jsx` | Modify | Mock Daily; split mock-mode placeholder tests from real-mode chrome tests; assert Daily mounts in real mode. |
| `client/src/modules/video/video.routes.jsx` | Modify | Add `/video/:id/ready` → `WaitingRoom`; retain `/video/:id`. |
| `client/src/modules/appointment/views/Upcoming/Upcoming.jsx` | Modify | Join → `/video/:id/ready` + emit `video_join_attempt`. |
| `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx` | Modify | Join → `/video/:id/ready` + emit `video_join_attempt`. |
| `client/package.json` | (done) | `@daily-co/daily-js` ^0.91.0 added + installed. |

---

## Task 1: `track.js` analytics helper

**Files:**
- Create: `client/src/lib/analytics/track.js`
- Test: `client/src/lib/analytics/track.test.js`

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/analytics/track.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { track } from './track.js';
import { api } from '../apiClient/apiClient.js';

vi.mock('../apiClient/apiClient.js', () => ({ api: { post: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('track', () => {
  it('posts { type, networkType, meta } to /analytics/events', () => {
    api.post.mockResolvedValue(null);
    track('video_join_attempt', { appointmentId: 'a1', role: 'patient' });
    expect(api.post).toHaveBeenCalledWith('/analytics/events', {
      type: 'video_join_attempt',
      networkType: expect.any(String),
      meta: { appointmentId: 'a1', role: 'patient' },
    });
  });

  it('swallows a rejected POST (endpoint not deployed yet)', async () => {
    api.post.mockRejectedValue(new Error('404'));
    expect(() => track('video_join_success', { appointmentId: 'a1', role: 'doctor' })).not.toThrow();
    await Promise.resolve(); // let the rejected promise settle; no unhandled rejection
  });

  it('defaults meta to an empty object', () => {
    api.post.mockResolvedValue(null);
    track('landing_view');
    expect(api.post).toHaveBeenCalledWith('/analytics/events', {
      type: 'landing_view',
      networkType: expect.any(String),
      meta: {},
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- track.test`
Expected: FAIL — `track.js` does not exist / cannot resolve import.

- [ ] **Step 3: Write minimal implementation**

```js
// client/src/lib/analytics/track.js
// @ts-check
import { api } from '../apiClient/apiClient.js';

/**
 * Fire-and-forget analytics emit (KPI #3). Owned by S3; reused by S4/S6.
 * No-ops cleanly until S6 ships `POST /api/analytics/events`.
 * NOTE: apiClient prepends `/api`, so the path here is `/analytics/events`.
 * @param {string} type  doc 14 §6 catalog type
 * @param {Record<string, unknown>} [meta]
 */
export function track(type, meta = {}) {
  const networkType = navigator.connection?.effectiveType ?? 'unknown';
  api.post('/analytics/events', { type, networkType, meta }).catch(() => {});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- track.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/analytics/track.js client/src/lib/analytics/track.test.js
git commit -m "feat(analytics): add fire-and-forget track() helper (S3, KPI #3 seam)"
```

---

## Task 2: `useDailyCall` hook

**Files:**
- Create: `client/src/modules/video/useDailyCall.js`
- Test: `client/src/modules/video/useDailyCall.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/modules/video/useDailyCall.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { useRef } from 'react';
import { useDailyCall } from './useDailyCall.js';
import { track } from '../../lib/analytics/track.js';

vi.mock('../../lib/analytics/track.js', () => ({ track: vi.fn() }));

const h = vi.hoisted(() => ({ handlers: {}, frame: null, createFrame: null }));
vi.mock('@daily-co/daily-js', () => {
  h.frame = {
    on: vi.fn((evt, cb) => { h.handlers[evt] = cb; return h.frame; }),
    join: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  h.createFrame = vi.fn(() => h.frame);
  return { default: { createFrame: h.createFrame } };
});

function Harness(props) {
  const ref = useRef(null);
  return <div ref={ref}><Inner {...props} containerRef={ref} /></div>;
}
function Inner(props) {
  useDailyCall(props);
  return null;
}

beforeEach(() => { vi.clearAllMocks(); h.handlers = {}; });

const base = {
  enabled: true, roomUrl: 'https://x.daily.co/appt_a1', token: 'tok',
  appointmentId: 'a1', role: 'patient', onLeave: vi.fn(),
};

describe('useDailyCall', () => {
  it('creates a themed frame and joins with the room url + token', async () => {
    render(<Harness {...base} />);
    await waitFor(() => expect(h.createFrame).toHaveBeenCalledTimes(1));
    expect(h.frame.join).toHaveBeenCalledWith({ url: base.roomUrl, token: base.token });
    const opts = h.createFrame.mock.calls[0][1];
    expect(opts.theme.colors.background).toBe('#072018');
  });

  it('emits exactly one video_join_success on joined-meeting', async () => {
    render(<Harness {...base} />);
    await waitFor(() => expect(h.handlers['joined-meeting']).toBeTypeOf('function'));
    act(() => h.handlers['joined-meeting']());
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('video_join_success', { appointmentId: 'a1', role: 'patient' });
  });

  it('calls onLeave on left-meeting', async () => {
    render(<Harness {...base} />);
    await waitFor(() => expect(h.handlers['left-meeting']).toBeTypeOf('function'));
    act(() => h.handlers['left-meeting']());
    expect(base.onLeave).toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    render(<Harness {...base} enabled={false} />);
    await Promise.resolve();
    expect(h.createFrame).not.toHaveBeenCalled();
  });

  it('destroys the frame on unmount', async () => {
    const { unmount } = render(<Harness {...base} />);
    await waitFor(() => expect(h.createFrame).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(h.frame.destroy).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- useDailyCall`
Expected: FAIL — `useDailyCall.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
// client/src/modules/video/useDailyCall.js
// @ts-check
import { useEffect, useRef } from 'react';
import { track } from '../../lib/analytics/track.js';

const THEME = {
  colors: {
    accent: '#B5852F',
    accentText: '#FFFFFF',
    background: '#072018',
    backgroundAccent: '#0A2C20',
    baseText: '#DCE9E2',
    border: '#1F5440',
    mainAreaBg: '#072018',
    mainAreaBgAccent: '#0E3328',
    mainAreaText: '#DCE9E2',
    supportiveText: '#AFC6BA',
  },
};

/**
 * Mounts a brand-themed Daily Prebuilt iframe into `containerRef` and joins the room.
 * Daily owns the in-call tiles/controls/device pickers + reconnection/3G adaptation.
 * `@daily-co/daily-js` is lazy-imported so it never enters the main bundle (mirrors pdf-lib).
 * @param {{ enabled: boolean, roomUrl?: string, token?: string,
 *   containerRef: { current: HTMLElement|null },
 *   appointmentId?: string, role?: string, onLeave?: () => void }} args
 */
export function useDailyCall({ enabled, roomUrl, token, containerRef, appointmentId, role, onLeave }) {
  const frameRef = useRef(null);
  useEffect(() => {
    if (!enabled || !roomUrl || !containerRef.current) return undefined;
    let cancelled = false;
    (async () => {
      const DailyIframe = (await import('@daily-co/daily-js')).default;
      if (cancelled || !containerRef.current) return;
      const frame = DailyIframe.createFrame(containerRef.current, {
        showLeaveButton: true,
        iframeStyle: { width: '100%', height: '100%', border: '0' },
        theme: THEME,
      });
      frameRef.current = frame;
      frame.on('joined-meeting', () => track('video_join_success', { appointmentId, role }));
      frame.on('left-meeting', () => onLeave?.());
      frame.on('error', () => onLeave?.());
      await frame.join({ url: roomUrl, token });
    })();
    return () => {
      cancelled = true;
      const f = frameRef.current;
      frameRef.current = null;
      if (f) f.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomUrl, token]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- useDailyCall`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/video/useDailyCall.js client/src/modules/video/useDailyCall.test.jsx
git commit -m "feat(video): add useDailyCall hook (lazy Daily Prebuilt + themed join, S3)"
```

---

## Task 3: P-11 `WaitingRoom` view + route

**Files:**
- Create: `client/src/modules/video/views/WaitingRoom/WaitingRoom.jsx`
- Test: `client/src/modules/video/views/WaitingRoom/WaitingRoom.test.jsx`
- Modify: `client/src/modules/video/video.routes.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/modules/video/views/WaitingRoom/WaitingRoom.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WaitingRoom } from './WaitingRoom.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

function detail({ startOffsetMs }) {
  const start = new Date(Date.now() + startOffsetMs);
  return {
    id: 'a1', state: 'confirmed', doctorName: 'Dr A', specialization: 'Acne',
    slotStart: start.toISOString(), slotEnd: new Date(start.getTime() + 18e5).toISOString(),
    forSelf: true, subjectName: null,
  };
}
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/video/a1/ready']}>
        <Routes><Route path="/video/:id/ready" element={<WaitingRoom />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe('P-11 WaitingRoom', () => {
  it('shows the doctor context and the lighting tip', async () => {
    api.get.mockImplementation((p) =>
      p.includes('video-token') ? Promise.resolve({ joinSimUrl: null }) : Promise.resolve(detail({ startOffsetMs: 60 * 60 * 1000 })));
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByText(/well-lit/i)).toBeTruthy();
    expect(screen.getByText(/with you shortly/i)).toBeTruthy();
  });

  it('disables Join more than 10 minutes before the slot', async () => {
    api.get.mockImplementation((p) =>
      p.includes('video-token') ? Promise.resolve({ joinSimUrl: null }) : Promise.resolve(detail({ startOffsetMs: 60 * 60 * 1000 })));
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByRole('button', { name: /join call/i })).toHaveProperty('disabled', true);
  });

  it('enables Join inside the 10-minute window, linking to the call', async () => {
    api.get.mockImplementation((p) =>
      p.includes('video-token') ? Promise.resolve({ joinSimUrl: null }) : Promise.resolve(detail({ startOffsetMs: 5 * 60 * 1000 })));
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    const join = screen.getByRole('link', { name: /join call/i });
    expect(join.getAttribute('href')).toBe('/video/a1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- WaitingRoom`
Expected: FAIL — `WaitingRoom.jsx` does not exist.

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/modules/video/views/WaitingRoom/WaitingRoom.jsx
// @ts-check
import { Link, useParams } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatKarachi } from '../../../../lib/format/format.js';
import { useVideo } from '../../useVideo.js';

export function WaitingRoom() {
  const { id } = useParams();
  // detail gives doctor context + slot times; the token query also pre-warms the call-page cache.
  const { detail } = useVideo({ appointmentId: id });
  const d = detail.data;

  const slotStart = d?.slotStart ? new Date(d.slotStart).getTime() : null;
  const slotEnd = d?.slotEnd ? new Date(d.slotEnd).getTime() : null;
  const active =
    slotStart != null &&
    Date.now() >= slotStart - 10 * 60 * 1000 &&
    slotEnd != null &&
    Date.now() <= slotEnd + 5 * 60 * 1000;

  return (
    <PatientLayout>
      <section className="section-card">
        <h1>Waiting room</h1>
        {detail.isPending && <p className="help">Loading…</p>}
        {d && (
          <>
            <div className="appt-row">
              <strong>{d.doctorName}</strong> — {d.specialization}
              <div>{formatKarachi(d.slotStart)}</div>
            </div>
            <div className="alert alert--info">
              <strong>For the best consultation:</strong> find a well-lit area — sit facing a window
              or lamp if you can. Good lighting helps your doctor see your skin clearly.
            </div>
            <p className="help" role="status">
              Doctor will be with you shortly. Please stay on this page.
            </p>
            {active ? (
              <Link className="btn btn--primary btn--block" to={`/video/${id}`}>
                Join Call
              </Link>
            ) : (
              <>
                <button type="button" className="btn btn--primary btn--block" disabled>
                  Join Call
                </button>
                <p className="help">
                  Active 10 minutes before your slot at {formatKarachi(d.slotStart)}.
                </p>
              </>
            )}
          </>
        )}
      </section>
    </PatientLayout>
  );
}
```

> Note: `WaitingRoom` is patient+doctor gated by the route (any logged-in session), but uses `PatientLayout` to match the mockup's top-nav chrome (the mockup `patient-11-waiting-room.html` uses the patient topnav). The doctor reaches the call via D-02; the get-ready screen is shared. If a doctor-specific layout is later wanted, that is a follow-up, not S3 scope.

- [ ] **Step 4: Add the route**

Modify `client/src/modules/video/video.routes.jsx`:

```jsx
// @ts-check
import { VideoRoom } from './views/VideoRoom/VideoRoom.jsx';
import { WaitingRoom } from './views/WaitingRoom/WaitingRoom.jsx';
import { Login } from '../auth/views/Login/Login.jsx';

/** Video module routes (D3). Unauthenticated users fall back to Login (mirrors the prior App.jsx). */
export const videoRoutes = (session) => [
  { path: '/video/:id/ready', element: session ? <WaitingRoom /> : <Login /> },
  { path: '/video/:id', element: session ? <VideoRoom /> : <Login /> },
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --workspace client test -- WaitingRoom`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/modules/video/views/WaitingRoom client/src/modules/video/video.routes.jsx
git commit -m "feat(video): add P-11 WaitingRoom get-ready screen + /video/:id/ready route (S3)"
```

---

## Task 4: `VideoRoom` (P-12/D-04) — fold in Daily, retain mock path

**Files:**
- Modify: `client/src/modules/video/views/VideoRoom/VideoRoom.jsx`
- Modify: `client/src/modules/video/views/VideoRoom/VideoRoom.test.jsx`

- [ ] **Step 1: Rewrite the test (mock Daily; split mock-mode vs real-mode)**

Replace the whole file `client/src/modules/video/views/VideoRoom/VideoRoom.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VideoRoom } from './VideoRoom.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

const h = vi.hoisted(() => ({ role: 'patient', handlers: {}, frame: null, createFrame: null }));
vi.mock('../../../../lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../../context/session/session.jsx', () => ({ useSession: () => ({ session: { role: h.role } }) }));
vi.mock('@daily-co/daily-js', () => {
  h.frame = {
    on: vi.fn((evt, cb) => { h.handlers[evt] = cb; return h.frame; }),
    join: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  h.createFrame = vi.fn(() => h.frame);
  return { default: { createFrame: h.createFrame } };
});

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
beforeEach(() => { vi.clearAllMocks(); h.role = 'patient'; h.handlers = {}; });

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace client test -- VideoRoom`
Expected: FAIL — `createFrame` not called (Daily not yet wired), and the mock-mode `video-token` join-sim assertions/placeholder behavior depend on the new `isMock` branching.

- [ ] **Step 3: Rewrite the implementation**

Replace `client/src/modules/video/views/VideoRoom/VideoRoom.jsx`:

```jsx
// @ts-check
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../../../../context/session/session.jsx';
import { useVideo } from '../../useVideo.js';
import { useDailyCall } from '../../useDailyCall.js';

function mmss(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function VideoRoom() {
  const { id } = useParams();
  const { session } = useSession();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { token, detail, recordJoin } = useVideo({ appointmentId: id });
  const isMock = Boolean(token.data?.joinSimUrl);
  const containerRef = useRef(null);

  // Mock mode only: entering the room records this participant's join (server-provided URL).
  useEffect(() => {
    if (token.data?.joinSimUrl) recordJoin(token.data.joinSimUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token.data?.joinSimUrl, id]);

  const slotEnd = detail.data?.slotEnd ? new Date(detail.data.slotEnd).getTime() : null;
  const hardCutoff = slotEnd != null ? slotEnd + 5 * 60 * 1000 : null;
  const ended = hardCutoff != null && now >= hardCutoff;
  const msToEnd = slotEnd != null ? slotEnd - now : null;
  const isDoctor = session?.role === 'doctor';
  const peerJoined = detail.data?.peerJoined;
  const ready = !token.isError && !token.isPending && !detail.isPending;

  // Real Daily Prebuilt path (joinSimUrl == null). Mounts when the room is open and the call is live.
  useDailyCall({
    enabled: ready && !isMock && !ended && Boolean(token.data?.roomUrl),
    roomUrl: token.data?.roomUrl,
    token: token.data?.token,
    containerRef,
    appointmentId: id,
    role: session?.role,
    onLeave: () => window.history.back(),
  });

  if (token.isError)
    return (
      <main className="video-page">
        <p className="help">The video room isn't open yet. Try again closer to your appointment time.</p>
      </main>
    );
  if (token.isPending || detail.isPending)
    return (
      <main className="video-page">
        <p className="help">Connecting…</p>
      </main>
    );

  if (ended)
    return (
      <main className="video-page" style={{ background: 'var(--color-dark-deep)' }}>
        <div className="video-stage">
          <p style={{ color: 'var(--color-on-dark)' }}>This session has ended.</p>
        </div>
        <div className="video-controls">
          <button type="button" className="video-ctrl video-ctrl--leave" onClick={() => window.history.back()}>
            Leave
          </button>
        </div>
      </main>
    );

  return (
    <main className="video-page" style={{ background: 'var(--color-dark-deep)' }}>
      <div className="video-timer" style={{ color: 'var(--color-on-dark)' }}>
        {msToEnd != null && msToEnd > 0 ? `Time remaining: ${mmss(msToEnd)}` : 'Wrapping up…'}
      </div>
      {isDoctor && msToEnd != null && msToEnd > 0 && msToEnd <= 5 * 60 * 1000 && (
        <p className="video-warning" role="status">
          5 minutes remaining
        </p>
      )}
      <div className="video-stage" ref={containerRef}>
        {isMock && (
          <>
            {peerJoined ? (
              <p style={{ color: 'var(--color-on-dark)' }}>● Live — connected</p>
            ) : (
              <p style={{ color: 'var(--color-on-dark)' }}>Doctor will be with you shortly…</p>
            )}
            <div className="video-self" />
          </>
        )}
      </div>
      {isMock && (
        <div className="video-controls">
          <button type="button" className="video-ctrl video-ctrl--leave" onClick={() => window.history.back()}>
            Leave
          </button>
        </div>
      )}
    </main>
  );
}
```

> Notes for the implementer:
> - `useDailyCall` is called unconditionally (before the early returns) per the Rules of Hooks; the `enabled` flag gates the effect body. In `mock` mode `isMock` is true → `enabled` false → Daily never loads. In the `ended` branch `enabled` is false → any live frame is destroyed by the hook's cleanup.
> - The dead Mic/Cam buttons are removed (Daily owns the real in-call tray); the mock path keeps only a Leave button so dev/CI can exit.
> - `video_join_success` is emitted by `useDailyCall` on Daily's `joined-meeting` (real path only) — mock/CI does not fire it, matching the design.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace client test -- VideoRoom`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/video/views/VideoRoom/VideoRoom.jsx client/src/modules/video/views/VideoRoom/VideoRoom.test.jsx
git commit -m "feat(video): real Daily Prebuilt in VideoRoom (P-12/D-04) + retain mock path (S3)"
```

---

## Task 5: P-08 `Upcoming` — Join → ready + `video_join_attempt`

**Files:**
- Modify: `client/src/modules/appointment/views/Upcoming/Upcoming.jsx`
- Modify (extend): `client/src/modules/appointment/views/Upcoming/Upcoming.test.jsx`

- [ ] **Step 1: Add a test asserting the ready-route target + the emit**

Append this test inside the `describe('P-08 Upcoming', ...)` block of `Upcoming.test.jsx`. Add the track mock near the top of the file (after the existing `vi.mock` lines):

```jsx
// add near the top, after the existing vi.mock(...) calls:
vi.mock('../../../../lib/analytics/track.js', () => ({ track: vi.fn() }));
import { track } from '../../../../lib/analytics/track.js';
```

```jsx
  it('routes Join Call through the waiting room and emits video_join_attempt', async () => {
    const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    api.get.mockResolvedValue({
      data: [{ id: 'a1', slotStart: soon, slotEnd: soon, state: 'confirmed', feeAtBooking: 250000,
        forSelf: true, subjectName: null, doctorName: 'Dr A', specialization: 'Acne', doctorPhotoUrl: null }],
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    const join = screen.getByRole('link', { name: /join call/i });
    expect(join.getAttribute('href')).toBe('/video/a1/ready');
    join.click();
    expect(track).toHaveBeenCalledWith('video_join_attempt', { appointmentId: 'a1', role: 'patient' });
  });
```

> The existing test `enables Join Call within 10 min … linking to the video room` asserts `href` `.toContain('/video/a1')`; `/video/a1/ready` still satisfies it, so it stays green unchanged.

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npm --workspace client test -- Upcoming`
Expected: FAIL — `href` is `/video/a1` (not `/ready`) and `track` is not called.

- [ ] **Step 3: Update the Join link**

In `client/src/modules/appointment/views/Upcoming/Upcoming.jsx`, add the import:

```jsx
import { track } from '../../../../lib/analytics/track.js';
```

Replace the active-branch `<Link>` (currently `to={`/video/${a.id}`}`) with:

```jsx
                <Link
                  className="btn btn--secondary"
                  to={`/video/${a.id}/ready`}
                  onClick={() => track('video_join_attempt', { appointmentId: a.id, role: 'patient' })}
                >
                  Join Call
                </Link>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace client test -- Upcoming`
Expected: PASS (all, including the new one).

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/appointment/views/Upcoming/Upcoming.jsx client/src/modules/appointment/views/Upcoming/Upcoming.test.jsx
git commit -m "feat(appointment): P-08 Join routes via P-11 + emits video_join_attempt (S3)"
```

---

## Task 6: D-02 `DoctorToday` — Join → ready + `video_join_attempt`

**Files:**
- Modify: `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx`
- Modify (extend): `client/src/modules/doctor/views/DoctorToday/DoctorToday.test.jsx`

> D-02 is already built (list, 10-min Join gate, awaiting-prescription badge, write-Rx, History, `DoctorCancelModal`). S3's only delta here is the Join target + the analytics emit.

- [ ] **Step 1: Add a test asserting the ready-route target + the emit**

Add the track mock near the top of `DoctorToday.test.jsx` (after the existing `vi.mock` lines):

```jsx
vi.mock('../../../../lib/analytics/track.js', () => ({ track: vi.fn() }));
import { track } from '../../../../lib/analytics/track.js';
```

Add this test inside `describe('D-02 DoctorToday', ...)`:

```jsx
  it('routes the active Join Call through the waiting room and emits video_join_attempt', async () => {
    const noon = karachiNoonMs();
    const start = new Date(Date.now() + 5 * 60 * 1000); // inside the 10-min window
    api.get.mockResolvedValue({ data: [{ id: 'a1',
      slotStart: start.toISOString(), slotEnd: new Date(start.getTime() + 18e5).toISOString(),
      state: 'confirmed', forSelf: true, subjectName: null, patientName: 'Parent P' }] });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    const join = screen.getByRole('link', { name: /join call/i });
    expect(join.getAttribute('href')).toBe('/video/a1/ready');
    join.click();
    expect(track).toHaveBeenCalledWith('video_join_attempt', { appointmentId: 'a1', role: 'doctor' });
  });
```

> `karachiNoonMs` is unused by this test but already defined in the file; the `start` here is "now + 5 min" so the Join button is active regardless of wall-clock time within the Karachi day. (If the run happens to straddle a day boundary so the row is filtered out of "today", this is the only fragile test — but "now + 5 min" shares the current Karachi day in all but a ~5-minute window near midnight PKT, acceptable for CI.)

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npm --workspace client test -- DoctorToday`
Expected: FAIL — `href` is `/video/a1` and `track` is not called.

- [ ] **Step 3: Update the Join link**

In `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx`, add the import:

```jsx
import { track } from '../../../../lib/analytics/track.js';
```

Replace the active-branch `<Link>` (currently `to={`/video/${a.id}`}`) with:

```jsx
                  <Link
                    className="btn btn--secondary"
                    to={`/video/${a.id}/ready`}
                    onClick={() => track('video_join_attempt', { appointmentId: a.id, role: 'doctor' })}
                  >
                    Join Call
                  </Link>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace client test -- DoctorToday`
Expected: PASS (all, including the new one).

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx client/src/modules/doctor/views/DoctorToday/DoctorToday.test.jsx
git commit -m "feat(doctor): D-02 Join routes via P-11 + emits video_join_attempt (S3)"
```

---

## Task 7: Full-suite + build verification (lazy chunk)

**Files:** none (verification only).

- [ ] **Step 1: Run the full client suite**

Run: `npm --workspace client test`
Expected: all green (prior suites + the new track/useDailyCall/WaitingRoom tests + updated VideoRoom/Upcoming/DoctorToday). Record the exact count.

- [ ] **Step 2: Run the server + shared suite**

Run: `npm test`
Expected: all green (S3 touches no server code). Record the exact count.

- [ ] **Step 3: Build the client and confirm the Daily lazy chunk**

Run: `npm --workspace client run build`
Expected: build succeeds. In the Vite output, confirm a separate `@daily-co/daily-js` (or `daily-*`) chunk is emitted and the main entry chunk is not bloated by it (same pattern as the `pdf-lib` chunk). If `@daily-co/daily-js` is absent from the chunk list, that means a stray static import pulled it into the entry chunk — fix by ensuring the only reference is the dynamic `import()` in `useDailyCall.js`.

- [ ] **Step 4: Commit any build-config fix (only if needed)**

```bash
git add -A
git commit -m "chore(video): ensure @daily-co/daily-js stays lazy-chunked (S3)"
```

---

## Self-review checklist (run before handing off)

- **Spec coverage:** Daily Prebuilt (`useDailyCall`, Task 2) ✓; P-11 (Task 3) ✓; P-12/D-04 one role-aware VideoRoom (Task 4) ✓; D-02 delta (Task 6) ✓; analytics helper + emits (Tasks 1, 5, 6) ✓; routing (Task 3) ✓; tests incl. mock-path retained (every task) ✓; lazy chunk + build (Task 7) ✓; `package.json` dep (done) ✓.
- **Mock path stays green:** `joinSimUrl` present → `isMock` → Daily never loads; placeholder + `/dev/video/join` retained (Task 4 tests assert this).
- **Type/name consistency:** `track(type, meta)`, `useDailyCall({ enabled, roomUrl, token, containerRef, appointmentId, role, onLeave })`, `WaitingRoom`, route `/video/:id/ready` — used identically across tasks.
- **Path correctness:** `track.js` posts `'/analytics/events'` (apiClient adds `/api`).

## Doc-impact (tracked; controller applies at task end with approval — do NOT edit specs here)

Per the S3 design spec §7 + the doc-00 change-impact matrix:

| Doc | Change | Reason |
| --- | --- | --- |
| 02 | Note KPI #3 emit points: `video_join_attempt` on Join click (P-08/D-02), `video_join_success` on Daily `joined-meeting` (P-12/D-04). | Records where the KPI telemetry is emitted. |
| 05 | Note the client posts to `POST /api/analytics/events` (route owned/defined by S6). | API surface the client now calls. |
| 06 | P-11 = get-ready screen (no app camera-preview pane; Daily prejoin owns the device check) — minor approved deviation; one shared role-aware `VideoRoom` serves P-12 + D-04. | As-built screen behavior. |
| 11 | New ADR — "Video UI: Daily Prebuilt iframe + app chrome; P-11 get-ready + Daily prejoin; one role-aware VideoRoom; analytics via fire-and-forget `track.js`." | New architectural decision. |
| 13 | P-11/P-12/D-04 → Built (real Daily SDK in S3); correct the overstated "Video chrome (Daily SDK wrapper): Built (Slice D)" row. | Build-state reconciliation. |
| 14 §6 | (No change needed — catalog already lists both events.) Confirm wire shape `{ type, networkType, meta }`. | Verify helper matches the catalog. |

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-13 | Initial plan | Slice H · S3 implementation plan from the approved design spec |

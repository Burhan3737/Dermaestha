// client/src/modules/video/useDailyCall.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { useRef } from 'react';
import { useDailyCall } from '#src/modules/video/useDailyCall.js';
import { track } from '#src/lib/analytics/track.js';

vi.mock('#src/lib/analytics/track.js', () => ({ track: vi.fn() }));

const h = vi.hoisted(() => ({ handlers: {}, frame: null, createFrame: null, getCallInstance: vi.fn(() => null) }));
vi.mock('@daily-co/daily-js', () => {
  h.frame = {
    on: vi.fn((evt, cb) => {
      h.handlers[evt] = cb;
      return h.frame;
    }),
    join: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  h.createFrame = vi.fn(() => h.frame);
  return { default: { createFrame: h.createFrame, getCallInstance: h.getCallInstance } };
});

function Harness(props) {
  const ref = useRef(null);
  return (
    <div ref={ref}>
      <Inner {...props} containerRef={ref} />
    </div>
  );
}
function Inner(props) {
  useDailyCall(props);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.handlers = {};
  h.getCallInstance.mockReturnValue(null);
});

const base = {
  enabled: true,
  roomUrl: 'https://x.daily.co/appt_a1',
  token: 'tok',
  appointmentId: 'a1',
  role: 'patient',
  onLeave: vi.fn(),
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
    expect(track).toHaveBeenCalledWith('video_join_success', {
      appointmentId: 'a1',
      role: 'patient',
    });
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

  it('refuses a non-Daily room url (prevents recursive self-embed → HTTP 431)', async () => {
    render(<Harness {...base} roomUrl="http://localhost:3000/video/a1" />);
    // Wait long enough that the lazy import would have resolved and createFrame fired if unguarded.
    await new Promise((r) => setTimeout(r, 50));
    expect(h.createFrame).not.toHaveBeenCalled();
  });

  it('destroys the frame on unmount', async () => {
    const { unmount } = render(<Harness {...base} />);
    await waitFor(() => expect(h.createFrame).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(h.frame.destroy).toHaveBeenCalled());
  });

  it('does not rebuild the live call when only the token changes (token-refetch churn)', async () => {
    const { rerender } = render(<Harness {...base} token="tok-1" />);
    await waitFor(() => expect(h.createFrame).toHaveBeenCalledTimes(1));
    // A window-focus refetch mints a new Daily token; that must NOT tear down + recreate the frame
    // (the teardown/recreate race is what throws "Duplicate DailyIframe instances are not allowed").
    rerender(<Harness {...base} token="tok-2" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(h.createFrame).toHaveBeenCalledTimes(1);
  });

  it('tears down a leftover Daily instance before creating a new one (no Duplicate error)', async () => {
    const leftover = { destroy: vi.fn().mockResolvedValue(undefined) };
    h.getCallInstance.mockReturnValueOnce(leftover);
    render(<Harness {...base} />);
    await waitFor(() => expect(h.createFrame).toHaveBeenCalledTimes(1));
    expect(leftover.destroy).toHaveBeenCalled();
  });
});

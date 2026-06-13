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

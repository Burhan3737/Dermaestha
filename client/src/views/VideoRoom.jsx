// @ts-check
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { useSession } from '../lib/session.jsx';

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

  const token = useQuery({
    queryKey: ['video-token', id],
    queryFn: () => api.get(`/appointments/${id}/video-token`),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api.get(`/appointments/${id}`),
    refetchInterval: 5000,
  });

  // Mock mode: entering the room records this participant's join (server-provided URL).
  useEffect(() => {
    if (token.data?.joinSimUrl) api.post(token.data.joinSimUrl, { appointmentId: id }).catch(() => {});
  }, [token.data?.joinSimUrl, id]);

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

  const slotEnd = detail.data?.slotEnd ? new Date(detail.data.slotEnd).getTime() : null;
  const hardCutoff = slotEnd != null ? slotEnd + 5 * 60 * 1000 : null;
  const ended = hardCutoff != null && now >= hardCutoff;
  const msToEnd = slotEnd != null ? slotEnd - now : null;
  const isDoctor = session?.role === 'doctor';
  const peerJoined = detail.data?.peerJoined;

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
      <div className="video-stage">
        {peerJoined ? (
          <p style={{ color: 'var(--color-on-dark)' }}>● Live — connected</p>
        ) : (
          <p style={{ color: 'var(--color-on-dark)' }}>Doctor will be with you shortly…</p>
        )}
        <div className="video-self" />
      </div>
      <div className="video-controls">
        <button type="button" className="video-ctrl">Mic</button>
        <button type="button" className="video-ctrl">Cam</button>
        <button type="button" className="video-ctrl video-ctrl--leave" onClick={() => window.history.back()}>
          Leave
        </button>
      </div>
    </main>
  );
}

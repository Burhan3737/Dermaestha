// @ts-check
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';

export function VideoRoom() {
  const { id } = useParams();
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
    if (token.data?.joinSimUrl)
      api.post(token.data.joinSimUrl, { appointmentId: id }).catch(() => {});
  }, [token.data?.joinSimUrl, id]);

  if (token.isError)
    return (
      <main className="video-page">
        <p className="help">
          The video room isn't open yet. Try again closer to your appointment time.
        </p>
      </main>
    );
  if (token.isPending || detail.isPending)
    return (
      <main className="video-page">
        <p className="help">Connecting…</p>
      </main>
    );

  const peerJoined = detail.data?.peerJoined;
  return (
    <main className="video-page" style={{ background: 'var(--color-dark-deep)' }}>
      <div className="video-stage">
        {peerJoined ? (
          <p style={{ color: 'var(--color-on-dark)' }}>● Live — connected</p>
        ) : (
          <p style={{ color: 'var(--color-on-dark)' }}>Doctor will be with you shortly…</p>
        )}
        <div className="video-self" />
      </div>
      <div className="video-controls">
        <button type="button" className="video-ctrl">
          Mic
        </button>
        <button type="button" className="video-ctrl">
          Cam
        </button>
        <button
          type="button"
          className="video-ctrl video-ctrl--leave"
          onClick={() => window.history.back()}
        >
          Leave
        </button>
      </div>
    </main>
  );
}

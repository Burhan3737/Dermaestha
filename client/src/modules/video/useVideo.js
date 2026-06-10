// @ts-check
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * Video module data/actions (D2). Behavior identical to the prior VideoRoom view.
 * @param {{ appointmentId?: string|null }} [opts]
 */
export function useVideo(opts = {}) {
  const { appointmentId = null } = opts;

  const token = useQuery({
    queryKey: ['video-token', appointmentId],
    queryFn: () => api.get(`/appointments/${appointmentId}/video-token`),
    retry: false,
    enabled: Boolean(appointmentId),
  });

  const detail = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => api.get(`/appointments/${appointmentId}`),
    refetchInterval: 5000,
    enabled: Boolean(appointmentId),
  });

  // Mock mode: record this participant's join via the server-provided sim URL (fire-and-forget).
  const recordJoin = (joinSimUrl) => api.post(joinSimUrl, { appointmentId }).catch(() => {});

  return { token, detail, recordJoin };
}

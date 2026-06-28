// @ts-check
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * Video module data/actions (D2). Behavior identical to the prior VideoRoom view.
 * @param {{ appointmentId?: string|null }} [opts]
 */
export function useVideo(opts = {}) {
  const { appointmentId = null } = opts;

  // The video token is a one-time join credential (the Daily adapter mints a fresh token per call).
  // It must not be refetched mid-call — a new token would churn the Daily frame lifecycle — so it is
  // pinned: never stale, no window-focus/reconnect refetch.
  const token = useQuery({
    queryKey: ['video-token', appointmentId],
    queryFn: () => api.get(`/appointments/${appointmentId}/video-token`),
    retry: false,
    enabled: Boolean(appointmentId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const detail = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => api.get(`/appointments/${appointmentId}`),
    refetchInterval: 5000,
    enabled: Boolean(appointmentId),
  });

  return { token, detail };
}

// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * Appointment module data/mutations (D2). Behavior identical to the prior Upcoming view.
 * @param {{ detailId?: string|null, scope?: string|null }} [opts]
 */
export function useAppointment(opts = {}) {
  const { detailId = null, scope = null } = opts;
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['appointments', scope],
    queryFn: () => api.get(scope === 'history' ? '/appointments?scope=history' : '/appointments'),
  });

  const detail = useQuery({
    queryKey: ['appointment', detailId],
    queryFn: () => api.get(`/appointments/${detailId}`),
    enabled: !!detailId,
  });

  const cancel = useMutation({
    mutationFn: (id) => api.post(`/appointments/${id}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });

  return { list, detail, cancel };
}

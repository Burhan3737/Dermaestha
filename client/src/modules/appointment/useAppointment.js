// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * Appointment module data/mutations (D2). Behavior identical to the prior Upcoming view.
 * @param {{ detailId?: string|null }} [opts]
 */
export function useAppointment(opts = {}) {
  const { detailId = null } = opts;
  const qc = useQueryClient();

  const list = useQuery({ queryKey: ['appointments'], queryFn: () => api.get('/appointments') });

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

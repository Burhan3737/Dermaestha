// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * Prescription module data/mutations (D2 pattern): every query is `enabled`-gated.
 * @param {{ appointmentId?: string|null, medicineSearch?: string|null }} [opts]
 */
export function usePrescription(opts = {}) {
  const { appointmentId = null, medicineSearch = null } = opts;
  const qc = useQueryClient();

  const prescriptions = useQuery({
    queryKey: ['prescriptions', appointmentId],
    queryFn: () => api.get(`/appointments/${appointmentId}/prescriptions`),
    enabled: !!appointmentId,
  });

  const medicines = useQuery({
    queryKey: ['medicines', medicineSearch],
    queryFn: () => api.get(`/medicines?search=${encodeURIComponent(medicineSearch ?? '')}`),
    enabled: medicineSearch !== null && medicineSearch.length >= 2,
  });

  const submit = useMutation({
    mutationFn: ({ appointmentId: id, body }) => api.post(`/appointments/${id}/prescriptions`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prescriptions'] }),
  });

  return { prescriptions, medicines, submit };
}

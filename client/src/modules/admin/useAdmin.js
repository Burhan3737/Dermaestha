// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * Admin module data/mutations (house pattern: one hook per module, enabled-gated queries).
 * @param {{ medicines?: boolean, medicinesSearch?: string }} [opts]
 */
export function useAdmin(opts = {}) {
  const { medicines: medicinesEnabled = false, medicinesSearch = '' } = opts;
  const qc = useQueryClient();

  const medicines = useQuery({
    queryKey: ['admin-medicines', medicinesSearch],
    queryFn: () =>
      api.get(
        `/medicines?includeInactive=true${medicinesSearch ? `&search=${encodeURIComponent(medicinesSearch)}` : ''}`,
      ),
    enabled: medicinesEnabled,
  });

  const invalidateMedicines = () => qc.invalidateQueries({ queryKey: ['admin-medicines'] });

  const createMedicine = useMutation({
    mutationFn: (body) => api.post('/admin/medicines', body),
    onSuccess: invalidateMedicines,
  });

  const updateMedicine = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/admin/medicines/${id}`, body),
    onSuccess: invalidateMedicines,
  });

  return { medicines, createMedicine, updateMedicine };
}

// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * Admin module data/mutations (house pattern: one hook per module, enabled-gated queries).
 * @param {{ medicines?: boolean, medicinesSearch?: string, doctors?: boolean }} [opts]
 */
export function useAdmin(opts = {}) {
  const { medicines: medicinesEnabled = false, medicinesSearch = '', doctors: doctorsEnabled = false } = opts;
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

  const doctors = useQuery({
    queryKey: ['admin-doctors'],
    queryFn: () => api.get('/doctors?includeInactive=true'),
    enabled: doctorsEnabled,
  });

  const invalidateDoctors = () => qc.invalidateQueries({ queryKey: ['admin-doctors'] });

  const createDoctor = useMutation({
    mutationFn: (body) => api.post('/doctors', body),
    onSuccess: invalidateDoctors,
  });

  const updateDoctor = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/doctors/${id}`, body),
    onSuccess: invalidateDoctors,
  });

  const setDoctorActive = useMutation({
    mutationFn: ({ id, isActive }) => api.post(`/doctors/${id}/${isActive ? 'reactivate' : 'deactivate'}`),
    onSuccess: invalidateDoctors,
  });

  const resetDoctorPassword = useMutation({
    mutationFn: ({ id, newPassword }) => api.post(`/doctors/${id}/reset-password`, { newPassword }),
  });

  const uploadDoctorPhoto = useMutation({
    mutationFn: ({ id, file }) => {
      const fd = new FormData();
      fd.append('photo', file);
      return api.upload(`/doctors/${id}/photo`, fd);
    },
    onSuccess: invalidateDoctors,
  });

  const saveDoctorBlocks = useMutation({
    mutationFn: ({ id, blocks }) => api.put(`/doctors/${id}/availability`, { blocks }),
    onSuccess: invalidateDoctors,
  });

  return {
    medicines, createMedicine, updateMedicine,
    doctors, createDoctor, updateDoctor, setDoctorActive,
    resetDoctorPassword, uploadDoctorPhoto, saveDoctorBlocks,
  };
}

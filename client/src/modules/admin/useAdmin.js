// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/** Object → querystring, skipping empty values. */
const qs = (obj) => {
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

/**
 * Admin module data/mutations (house pattern: one hook per module, enabled-gated queries).
 * @param {{ medicines?: boolean, medicinesSearch?: string, doctors?: boolean, recordsFilters?: object|null, auditFilters?: object|null, recordDetailId?: string|null, alerts?: boolean, settings?: boolean, pendingReview?: boolean }} [opts]
 */
export function useAdmin(opts = {}) {
  const {
    medicines: medicinesEnabled = false,
    medicinesSearch = '',
    doctors: doctorsEnabled = false,
    recordsFilters = null,
    auditFilters = null,
    recordDetailId = null,
    alerts: alertsEnabled = false,
    settings: settingsEnabled = false,
    pendingReview: pendingReviewEnabled = false,
  } = opts;
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

  const alerts = useQuery({
    queryKey: ['admin-alerts'],
    queryFn: () => api.get('/admin/alerts'),
    enabled: alertsEnabled,
  });

  const records = useQuery({
    queryKey: ['admin-records', recordsFilters],
    queryFn: () => api.get(`/admin/records${qs(recordsFilters)}`),
    enabled: Boolean(recordsFilters),
  });

  const auditEntries = useQuery({
    queryKey: ['admin-audit', auditFilters],
    queryFn: () => api.get(`/admin/audit${qs(auditFilters)}`),
    enabled: Boolean(auditFilters),
  });

  /** @param {string} recordDetailId */
  const recordDetail = useQuery({
    queryKey: ['admin-record', recordDetailId],
    queryFn: () => api.get(`/admin/records/${recordDetailId}`),
    enabled: Boolean(recordDetailId),
  });

  const invalidateRecord = () => {
    qc.invalidateQueries({ queryKey: ['admin-record'] });
    qc.invalidateQueries({ queryKey: ['admin-records'] });
    qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  };

  /** Resend a failed notification job. @param {{ jobId: string }} args */
  const resendEmail = useMutation({
    mutationFn: ({ jobId }) => api.post(`/admin/emails/${jobId}/resend`),
    onSuccess: invalidateRecord,
  });

  /** Manual-payment review queue: `pending` appointments awaiting admin verification (design §7.2). */
  const pendingReview = useQuery({
    queryKey: ['admin-pending-review'],
    queryFn: () => api.get('/admin/records?state=pending'),
    enabled: pendingReviewEnabled,
  });

  const invalidateReview = () => {
    qc.invalidateQueries({ queryKey: ['admin-pending-review'] });
    qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  };

  /** Accept a pending payment → `confirmed`. @param {string} id */
  const acceptAppointment = useMutation({
    mutationFn: (id) => api.post(`/admin/appointments/${id}/accept`),
    onSuccess: invalidateReview,
  });

  /** Reject a pending payment → `cancelled` (frees the slot). @param {string} id */
  const rejectAppointment = useMutation({
    mutationFn: (id) => api.post(`/admin/appointments/${id}/reject`),
    onSuccess: invalidateReview,
  });

  /** Platform-wide tunable settings (F14). */
  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/admin/settings'),
    enabled: settingsEnabled,
  });

  /** Persist platform settings. @param {{ minBookingLeadMinutes: number, bankName: string, bankAccountName: string, bankAccountNumber: string, bankInstructions: string }} body */
  const saveSettings = useMutation({
    mutationFn: (body) => api.put('/admin/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
  });

  return {
    medicines, createMedicine, updateMedicine,
    doctors, createDoctor, updateDoctor, setDoctorActive,
    resetDoctorPassword, uploadDoctorPhoto, saveDoctorBlocks,
    alerts,
    records, auditEntries,
    recordDetail, resendEmail,
    settings, saveSettings,
    pendingReview, acceptAppointment, rejectAppointment,
  };
}

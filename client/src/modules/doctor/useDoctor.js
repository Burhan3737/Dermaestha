// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/**
 * The doctor module's data/mutations (D2). Every query is `enabled`-gated so a view triggers only
 * what it shows. Behavior is identical to the prior per-view useQuery/useMutation calls.
 * @param {{ listing?: boolean, doctorId?: string|null, slotsDate?: string|null,
 *   appointmentsScope?: string|null, availabilityDoctorId?: string|null }} [opts]
 */
export function useDoctor(opts = {}) {
  const {
    listing = false,
    doctorId = null,
    slotsDate = null,
    appointmentsScope = null,
    availabilityDoctorId = null,
  } = opts;
  const qc = useQueryClient();

  const doctors = useQuery({
    queryKey: ['doctors', 1],
    queryFn: () => api.get('/doctors?page=1&pageSize=20'),
    enabled: listing,
  });

  const doctor = useQuery({
    queryKey: ['doctor', doctorId],
    queryFn: () => api.get(`/doctors/${doctorId}`),
    enabled: Boolean(doctorId),
  });

  const slots = useQuery({
    queryKey: ['slots', doctorId, slotsDate],
    queryFn: () => api.get(`/doctors/${doctorId}/slots?date=${slotsDate}`),
    enabled: Boolean(doctorId && slotsDate),
  });

  const appointments = useQuery({
    queryKey: ['doctor-appointments', appointmentsScope],
    queryFn: () =>
      api.get(appointmentsScope === 'history' ? '/appointments?scope=history' : '/appointments'),
    enabled: Boolean(appointmentsScope),
  });

  const availability = useQuery({
    queryKey: ['availability', availabilityDoctorId],
    queryFn: () => api.get(`/doctors/${availabilityDoctorId}/availability`),
    enabled: Boolean(availabilityDoctorId),
  });

  const saveAvailability = useMutation({
    mutationFn: (blocks) => api.put('/availability', { blocks }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability'] }),
  });

  const cancelAppointment = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/appointments/${id}/cancel`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctor-appointments'] }),
  });

  return { doctors, doctor, slots, appointments, availability, saveAvailability, cancelAppointment };
}

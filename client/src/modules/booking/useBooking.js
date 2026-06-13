// @ts-check
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';
import { track } from '../../lib/analytics/track.js';

/**
 * Booking module data/actions (D2). Behavior identical to the prior Booking/PaymentReturn views.
 * @param {{ doctorId?: string|null, apptId?: string|null }} [opts]
 */
export function useBooking(opts = {}) {
  const { doctorId = null, apptId = null } = opts;

  const doctor = useQuery({
    queryKey: ['doctor', doctorId],
    queryFn: () => api.get(`/doctors/${doctorId}`),
    enabled: Boolean(doctorId),
  });

  const appointmentStatus = useQuery({
    queryKey: ['appointment', apptId],
    queryFn: () => api.get(`/appointments/${apptId}`),
    refetchInterval: (query) => (query.state.data?.state === 'confirmed' ? false : 2000),
    retry: false,
    enabled: Boolean(apptId),
  });

  // Lock the slot, create the payment intent, and return the hosted-checkout redirect URL.
  const confirmAndPay = async ({ doctorId, slotStart, forSelf, subject }) => {
    const body = { doctorId, slotStart, forSelf };
    if (!forSelf)
      body.subject = { name: subject.name, age: Number(subject.age), relation: subject.relation };
    const appt = await api.post('/appointments/lock', body);
    track('booking_started', { doctorId });
    const { redirectUrl } = await api.post(`/appointments/${appt.id}/pay`);
    return redirectUrl;
  };

  return { doctor, appointmentStatus, confirmAndPay };
}

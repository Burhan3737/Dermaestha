// @ts-check
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';
import { track } from '../../lib/analytics/track.js';

/**
 * Booking module data/actions (D2). Drives the doctor summary + manual-payment booking flow.
 * @param {{ doctorId?: string|null }} [opts]
 */
export function useBooking(opts = {}) {
  const { doctorId = null } = opts;

  const doctor = useQuery({
    queryKey: ['doctor', doctorId],
    queryFn: () => api.get(`/doctors/${doctorId}`),
    enabled: Boolean(doctorId),
  });

  // Manual-payment model: lock the slot (creates a `pending` appointment, snapshots feeAtBooking)
  // and return the new appointment id. The caller routes the patient to the payment-instructions
  // screen — there is no gateway redirect (design §7.1).
  const confirmBooking = async ({ doctorId, slotStart, forSelf, subject }) => {
    const body = { doctorId, slotStart, forSelf };
    if (!forSelf)
      body.subject = { name: subject.name, age: Number(subject.age), relation: subject.relation };
    const appt = await api.post('/appointments/lock', body);
    track('booking_started', { doctorId });
    return appt.id;
  };

  return { doctor, confirmBooking };
}

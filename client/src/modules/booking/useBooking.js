// @ts-check
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';
import { track } from '../../lib/analytics/track.js';

/** The slot hold was released — payment failed or the 10-min lock expired (ISSUE-3). */
export function isLockReleased(d) {
  return Boolean(
    d &&
      d.state === 'slot_locked' &&
      d.lockExpiresAt &&
      d.serverNow &&
      new Date(d.lockExpiresAt) <= new Date(d.serverNow),
  );
}

/** A booking that has reached a terminal outcome — confirmed (success) or lock-released (failure). */
export function isTerminalBooking(d) {
  return Boolean(d && (d.state === 'confirmed' || isLockReleased(d)));
}

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
    // Poll while awaiting webhook confirmation, but STOP on a terminal outcome: confirmed (success)
    // or a slot_locked row whose lock has been released/expired (payment failed or abandoned) —
    // otherwise P-07 would poll forever (ISSUE-3).
    refetchInterval: (query) => (isTerminalBooking(query.state.data) ? false : 2000),
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

// @ts-check
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { useBooking, isLockReleased } from '../../useBooking.js';

export function PaymentReturn() {
  const [params] = useSearchParams();
  const apptId = params.get('appt');
  const { appointmentStatus: q } = useBooking({ apptId });

  const confirmed = q.data?.state === 'confirmed';
  const lockReleased = isLockReleased(q.data);
  // Still awaiting the webhook only while the hold is genuinely live (not confirmed, not released).
  const awaiting = q.data && !confirmed && !lockReleased;

  return (
    <PatientLayout>
      <section className="section-card status-card">
        {confirmed && (
          <>
            <h1>Booking confirmed</h1>
            <Link className="btn btn--primary" to="/appointments">
              View my appointments
            </Link>
          </>
        )}
        {lockReleased && (
          <>
            <h1>Payment not completed</h1>
            <p className="help">
              The payment didn’t go through and your slot hold was released. Please pick another time.
            </p>
            <Link className="btn btn--primary" to="/browse">
              Back to doctors
            </Link>
          </>
        )}
        {q.isError && (
          <>
            <h1>Payment did not complete</h1>
            <Link className="btn btn--secondary" to="/browse">
              Back to doctors
            </Link>
          </>
        )}
        {!q.data && !q.isError && <p className="help">Confirming your payment…</p>}
        {awaiting && <p className="help">Awaiting payment confirmation…</p>}
      </section>
    </PatientLayout>
  );
}
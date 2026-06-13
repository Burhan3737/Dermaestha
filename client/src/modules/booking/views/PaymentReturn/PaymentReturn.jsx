// @ts-check
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { useBooking } from '../../useBooking.js';

export function PaymentReturn() {
  const [params] = useSearchParams();
  const apptId = params.get('appt');
  const { appointmentStatus: q } = useBooking({ apptId });

  return (
    <PatientLayout>
      <section className="section-card status-card">
        {q.data?.state === 'confirmed' && (
          <>
            <h1>Booking confirmed</h1>
            <Link className="btn btn--primary" to="/appointments">
              View my appointments
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
        {q.data && q.data.state !== 'confirmed' && (
          <p className="help">Awaiting payment confirmation…</p>
        )}
      </section>
    </PatientLayout>
  );
}
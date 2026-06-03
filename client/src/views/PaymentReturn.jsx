// @ts-check
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { PatientLayout } from '../layouts/PatientLayout.jsx';

export function PaymentReturn() {
  const [params] = useSearchParams();
  const apptId = params.get('appt');
  const q = useQuery({
    queryKey: ['appointment', apptId],
    queryFn: () => api.get(`/appointments/${apptId}`),
    refetchInterval: (query) => (query.state.data?.state === 'confirmed' ? false : 2000),
    retry: false,
  });

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
            <Link className="btn btn--secondary" to="/">
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

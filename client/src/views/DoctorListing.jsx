// @ts-check
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { PatientLayout } from '../layouts/PatientLayout.jsx';
import { DoctorCard } from '../components/DoctorCard.jsx';

export function DoctorListing() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['doctors', 1],
    queryFn: () => api.get('/doctors?page=1&pageSize=20'),
  });

  return (
    <PatientLayout>
      <h1>Find a dermatologist</h1>
      {isPending && <p className="help">Loading doctors…</p>}
      {isError && <p className="error-text">Could not load doctors. Please try again.</p>}
      {data && data.data.length === 0 && (
        <div className="empty">
          <p>No doctors are available right now.</p>
        </div>
      )}
      {data && data.data.length > 0 && (
        <div
          style={{
            display: 'grid',
            gap: 'var(--sp-4)',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            marginTop: 'var(--sp-5)',
          }}
        >
          {data.data.map((d) => (
            <DoctorCard key={d.id} doctor={d} />
          ))}
        </div>
      )}
    </PatientLayout>
  );
}

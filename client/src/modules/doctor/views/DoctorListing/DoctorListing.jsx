// @ts-check
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { DoctorCard } from '../../components/DoctorCard/DoctorCard.jsx';
import { useDoctor } from '../../useDoctor.js';

export function DoctorListing() {
  const { data, isPending, isError } = useDoctor({ listing: true }).doctors;

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
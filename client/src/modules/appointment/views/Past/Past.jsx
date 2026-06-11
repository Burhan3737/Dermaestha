// @ts-check
import { Link } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatKarachi } from '../../../../lib/format/format.js';
import { stateLabel } from '../../stateLabel.js';
import { useAppointment } from '../../useAppointment.js';

export function Past() {
  const { list } = useAppointment({ scope: 'history' });
  const rows = list.data?.data ?? [];

  return (
    <PatientLayout>
      <section className="section-card">
        <div className="tabs" role="tablist">
          <Link className="tab" to="/appointments">
            Upcoming
          </Link>
          <Link className="tab tab--active" to="/appointments/history">
            Past
          </Link>
        </div>
        <h1>Past appointments</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && <p className="help">No past appointments.</p>}
        {rows.map((a) => (
          <div key={a.id} className="appt-row">
            <strong>{a.doctorName}</strong> — {a.specialization}
            <div>{formatKarachi(a.slotStart)}</div>
            {!a.forSelf && <div>for: {a.subjectName}</div>}
            <span className="badge badge--neutral">{stateLabel(a.state)}</span>
            {a.state === 'prescription_issued' && (
              <Link className="btn btn--secondary" to={`/appointments/${a.id}/prescriptions`}>
                Download Prescription
              </Link>
            )}
          </div>
        ))}
      </section>
    </PatientLayout>
  );
}

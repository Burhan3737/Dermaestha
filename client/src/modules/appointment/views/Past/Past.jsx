// @ts-check
import { Link } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatKarachi } from '../../../../lib/format/format.js';
import { DoctorAvatar } from '../../components/DoctorAvatar/DoctorAvatar.jsx';
import { stateLabel, stateBadge } from '../../stateLabel.js';
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
        <div className="appt-list">
          {rows.map((a) => (
            <div key={a.id} className="card appt-row">
              <DoctorAvatar name={a.doctorName} photoUrl={a.doctorPhotoUrl} />
              <div className="appt-meta">
                <div className="appt-head">
                  <div>
                    <p className="appt-name">{a.doctorName}</p>
                    <p className="appt-sub">
                      {a.specialization}
                      {!a.forSelf && a.subjectName ? ` · for: ${a.subjectName}` : ''}
                    </p>
                    <p className="appt-sub tnum">{formatKarachi(a.slotStart)}</p>
                  </div>
                  <span className={`badge badge--${stateBadge(a.state)}`}>
                    {stateLabel(a.state)}
                  </span>
                </div>
                {a.state === 'prescription_issued' && (
                  <div className="appt-actions">
                    <Link
                      className="btn btn--secondary btn--sm"
                      to={`/appointments/${a.id}/prescriptions`}
                    >
                      Download Prescription
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </PatientLayout>
  );
}

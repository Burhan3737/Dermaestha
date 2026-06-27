// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatPkr, formatKarachi } from '../../../../lib/format/format.js';
import { CancelModal } from '../../components/CancelModal/CancelModal.jsx';
import { DoctorAvatar } from '../../components/DoctorAvatar/DoctorAvatar.jsx';
import { stateLabel, stateBadge } from '../../stateLabel.js';
import { track } from '../../../../lib/analytics/track.js';
import { useAppointment } from '../../useAppointment.js';

export function Upcoming() {
  const [cancelId, setCancelId] = useState(null);
  const { list, cancel: cancelMut } = useAppointment();

  const rows = list.data?.data ?? [];

  return (
    <PatientLayout>
      <section className="section-card">
        <div className="tabs" role="tablist">
          <Link className="tab tab--active" to="/appointments">
            Upcoming
          </Link>
          <Link className="tab" to="/appointments/history">
            Past
          </Link>
        </div>
        <h1>Upcoming appointments</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && (
          <div className="empty">
            <p className="h3 strong" style={{ marginBottom: 'var(--sp-2)' }}>
              No upcoming appointments
            </p>
            <p className="body-sm" style={{ marginBottom: 'var(--sp-4)' }}>
              Find a verified dermatologist and book your first consultation.
            </p>
            <Link className="btn btn--primary" to="/browse">
              Browse doctors
            </Link>
          </div>
        )}
        <div className="appt-list">
          {rows.map((a) => {
            if (a.state === 'pending') {
              return (
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
                        <p className="appt-sub tnum">
                          {formatKarachi(a.slotStart)} · {formatPkr(a.feeAtBooking)}
                        </p>
                      </div>
                      <span className={`badge badge--${stateBadge(a.state)}`}>
                        {stateLabel(a.state)}
                      </span>
                    </div>
                    <div className="appt-actions">
                      <Link className="btn btn--primary btn--sm" to={`/book/pay/${a.id}`}>
                        {a.paymentReference ? 'View payment details' : 'Enter payment reference'}
                      </Link>
                      {a.paymentReference && (
                        <span className="help" style={{ margin: 0 }}>
                          Awaiting confirmation
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            const opensAt = new Date(a.slotStart).getTime() - 10 * 60 * 1000;
            const closesAt = new Date(a.slotEnd).getTime() + 5 * 60 * 1000;
            const active = Date.now() >= opensAt && Date.now() <= closesAt;
            return (
              <div key={a.id} className={`card appt-row${active ? ' appt-row--active' : ''}`}>
                <DoctorAvatar name={a.doctorName} photoUrl={a.doctorPhotoUrl} />
                <div className="appt-meta">
                  <div className="appt-head">
                    <div>
                      <p className="appt-name">{a.doctorName}</p>
                      <p className="appt-sub">
                        {a.specialization}
                        {!a.forSelf && a.subjectName ? ` · for: ${a.subjectName}` : ''}
                      </p>
                      <p className="appt-sub tnum">
                        {formatKarachi(a.slotStart)} · {formatPkr(a.feeAtBooking)}
                      </p>
                    </div>
                    <span className={`badge badge--${stateBadge(a.state)}`}>
                      {stateLabel(a.state)}
                    </span>
                  </div>
                  <div className="appt-actions">
                    {active ? (
                      <Link
                        className="btn btn--primary btn--sm"
                        to={`/video/${a.id}/ready`}
                        onClick={() =>
                          track('video_join_attempt', { appointmentId: a.id, role: 'patient' })
                        }
                      >
                        Join Call
                      </Link>
                    ) : (
                      <>
                        <button type="button" className="btn btn--primary btn--sm" disabled>
                          Join Call
                        </button>
                        <span className="help" style={{ margin: 0 }}>
                          Active 10 min before
                        </span>
                      </>
                    )}
                    {a.state === 'confirmed' && (
                      <button
                        type="button"
                        className="btn btn--danger-ghost btn--sm"
                        onClick={() => setCancelId(a.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {cancelId && (
        <CancelModal
          onClose={() => setCancelId(null)}
          onConfirm={() => cancelMut.mutate(cancelId, { onSuccess: () => setCancelId(null) })}
        />
      )}
    </PatientLayout>
  );
}

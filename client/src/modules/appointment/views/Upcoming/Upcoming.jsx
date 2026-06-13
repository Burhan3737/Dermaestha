// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatPkr, formatKarachi } from '../../../../lib/format/format.js';
import { CancelModal } from '../../components/CancelModal/CancelModal.jsx';
import { track } from '../../../../lib/analytics/track.js';
import { useAppointment } from '../../useAppointment.js';

export function Upcoming() {
  const [cancelId, setCancelId] = useState(null);
  const { list, detail, cancel: cancelMut } = useAppointment({ detailId: cancelId });

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
          <div className="empty-state">
            <p>No upcoming appointments.</p>
            <Link className="btn btn--primary" to="/browse">
              Browse doctors
            </Link>
          </div>
        )}
        {rows.map((a) => (
          <div key={a.id} className="appt-row">
            <strong>{a.doctorName}</strong> — {a.specialization}
            <div>{formatKarachi(a.slotStart)}</div>
            {!a.forSelf && <div>for: {a.subjectName}</div>}
            <div>{formatPkr(a.feeAtBooking)}</div>
            {(() => {
              const opensAt = new Date(a.slotStart).getTime() - 10 * 60 * 1000;
              const closesAt = new Date(a.slotEnd).getTime() + 5 * 60 * 1000;
              const active = Date.now() >= opensAt && Date.now() <= closesAt;
              return active ? (
                <Link
                  className="btn btn--secondary"
                  to={`/video/${a.id}/ready`}
                  onClick={() => track('video_join_attempt', { appointmentId: a.id, role: 'patient' })}
                >
                  Join Call
                </Link>
              ) : (
                <button type="button" className="btn btn--secondary" disabled>
                  Join Call
                </button>
              );
            })()}
            {a.state === 'confirmed' && (
              <button type="button" className="btn btn--ghost" onClick={() => setCancelId(a.id)}>
                Cancel
              </button>
            )}
          </div>
        ))}
      </section>
      {cancelId &&
        detail.data &&
        (() => {
          const appt = rows.find((r) => r.id === cancelId);
          const isLate =
            appt && new Date(appt.slotStart).getTime() - Date.now() < 2 * 60 * 60 * 1000;
          return (
            <CancelModal
              quote={isLate ? null : detail.data.refundQuote}
              lateNoRefund={isLate}
              onClose={() => setCancelId(null)}
              onConfirm={() => cancelMut.mutate(cancelId, { onSuccess: () => setCancelId(null) })}
            />
          );
        })()}
    </PatientLayout>
  );
}
// @ts-check
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { formatKarachi } from '../../../../lib/format/format.js';
import { DoctorCancelModal } from '../../../appointment/components/DoctorCancelModal/DoctorCancelModal.jsx';
import { stateLabel } from '../../../appointment/stateLabel.js';
import { track } from '../../../../lib/analytics/track.js';
import { useDoctor } from '../../useDoctor.js';

const karachiDay = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(iso));

export function DoctorToday() {
  // The sidebar (Today / History links) is the single navigation control; the active view is
  // derived from the route so it can never drift out of sync with the URL (was ISSUE-4 desync).
  const { pathname } = useLocation();
  const tab = pathname.endsWith('/history') ? 'history' : 'today';
  const { appointments: list, cancelAppointment } = useDoctor({ appointmentsScope: tab });
  const [cancelId, setCancelId] = useState(null);

  const all = list.data?.data ?? [];
  const today = karachiDay(new Date().toISOString());
  const rows = tab === 'history' ? all : all.filter((a) => karachiDay(a.slotStart) === today);

  return (
    <SidebarLayout>
      <section className="section-card">
        <h1>{tab === 'history' ? 'Appointment history' : 'Today’s appointments'}</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && (
          <p className="help">{tab === 'history' ? 'No past appointments.' : 'No appointments today.'}</p>
        )}
        {rows.map((a) => {
          const opensAt = new Date(a.slotStart).getTime() - 10 * 60 * 1000;
          const closesAt = new Date(a.slotEnd).getTime() + 5 * 60 * 1000;
          const active = Date.now() >= opensAt && Date.now() <= closesAt;
          return (
            <div key={a.id} className="appt-row">
              <div>{formatKarachi(a.slotStart)}</div>
              <strong>{a.patientName}</strong>
              {!a.forSelf && <div>for: {a.subjectName}</div>}
              {tab === 'today' &&
                (active ? (
                  <Link
                    className="btn btn--secondary"
                    to={`/video/${a.id}`}
                    onClick={() => track('video_join_attempt', { appointmentId: a.id, role: 'doctor' })}
                  >
                    Join Call
                  </Link>
                ) : (
                  <button type="button" className="btn btn--secondary" disabled>
                    Join Call
                  </button>
                ))}
              {tab === 'history' && <span className="badge badge--neutral">{stateLabel(a.state)}</span>}
              {(a.state === 'completed' || a.state === 'prescription_issued') && (
                <Link className="btn btn--secondary" to={`/doctor/appointments/${a.id}/prescribe`}>
                  Write prescription
                </Link>
              )}
              {a.state === 'completed' &&
                !a.hasPrescription &&
                Date.now() - new Date(a.slotEnd).getTime() > 12 * 3600 * 1000 && (
                  // awaiting_prescription derived condition (doc 02 §4.3) — doctor-facing nudge;
                  // the F12/A3 admin alert is Slice G.
                  <span className="badge badge--warning">Awaiting prescription</span>
                )}
              {a.state === 'confirmed' && tab === 'today' && (
                <button type="button" className="btn btn--ghost" onClick={() => setCancelId(a.id)}>
                  Cancel
                </button>
              )}
            </div>
          );
        })}
      </section>
      {cancelId && (
        <DoctorCancelModal
          onClose={() => setCancelId(null)}
          onConfirm={(reason) =>
            cancelAppointment.mutate({ id: cancelId, reason }, { onSuccess: () => setCancelId(null) })
          }
        />
      )}
    </SidebarLayout>
  );
}
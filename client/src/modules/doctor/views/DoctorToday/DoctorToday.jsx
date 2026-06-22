// @ts-check
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { formatKarachi, formatKarachiTime } from '../../../../lib/format/format.js';
import { DoctorCancelModal } from '../../../appointment/components/DoctorCancelModal/DoctorCancelModal.jsx';
import { stateLabel, stateBadge } from '../../../appointment/stateLabel.js';
import { track } from '../../../../lib/analytics/track.js';
import { useDoctor } from '../../useDoctor.js';

const karachiDay = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(iso));

export function DoctorToday() {
  // In-page Today/History tabs (mirrors the patient Upcoming/Past page). The tabs are route links,
  // so the active view is derived from the URL and can never drift out of sync with it (ADR-42).
  const { pathname } = useLocation();
  const tab = pathname.endsWith('/history') ? 'history' : 'today';
  const isHistory = tab === 'history';
  const { appointments: list, cancelAppointment } = useDoctor({ appointmentsScope: tab });
  const [cancelId, setCancelId] = useState(null);

  const all = list.data?.data ?? [];
  const today = karachiDay(new Date().toISOString());
  const rows = isHistory ? all : all.filter((a) => karachiDay(a.slotStart) === today);

  return (
    <SidebarLayout>
      <section className="section-card">
        <div className="tabs" role="tablist">
          <Link className={`tab${tab === 'today' ? ' tab--active' : ''}`} to="/doctor">
            Today
          </Link>
          <Link className={`tab${tab === 'history' ? ' tab--active' : ''}`} to="/doctor/history">
            History
          </Link>
        </div>
        <h1>{isHistory ? 'Appointment history' : 'Today’s appointments'}</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && (
          <p className="help">{isHistory ? 'No past appointments.' : 'No appointments today.'}</p>
        )}
        <div className="appt-list">
          {rows.map((a) => {
            const opensAt = new Date(a.slotStart).getTime() - 10 * 60 * 1000;
            const closesAt = new Date(a.slotEnd).getTime() + 5 * 60 * 1000;
            const active = Date.now() >= opensAt && Date.now() <= closesAt;
            const awaiting =
              a.state === 'completed' &&
              !a.hasPrescription &&
              Date.now() - new Date(a.slotEnd).getTime() > 12 * 3600 * 1000;
            const canWriteRx = a.state === 'completed' || a.state === 'prescription_issued';
            const showCancel = a.state === 'confirmed' && !isHistory;
            const hasActions = !isHistory || canWriteRx || awaiting;
            return (
              <div
                key={a.id}
                className={`card appt-row${active && !isHistory ? ' appt-row--active' : ''}`}
              >
                {!isHistory && <div className="appt-time tnum">{formatKarachiTime(a.slotStart)}</div>}
                <div className="appt-meta">
                  <div className="appt-head">
                    <div>
                      <p className="appt-name">{a.patientName}</p>
                      {!a.forSelf && <p className="appt-sub">for: {a.subjectName}</p>}
                      {isHistory && <p className="appt-sub tnum">{formatKarachi(a.slotStart)}</p>}
                    </div>
                    <span className={`badge badge--${stateBadge(a.state)}`}>
                      {stateLabel(a.state)}
                    </span>
                  </div>
                  {hasActions && (
                    <div className="appt-actions">
                      {!isHistory &&
                        (active ? (
                          <Link
                            className="btn btn--primary btn--sm"
                            to={`/video/${a.id}`}
                            onClick={() =>
                              track('video_join_attempt', { appointmentId: a.id, role: 'doctor' })
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
                        ))}
                      {canWriteRx && (
                        <Link
                          className="btn btn--secondary btn--sm"
                          to={`/doctor/appointments/${a.id}/prescribe`}
                        >
                          Write prescription
                        </Link>
                      )}
                      {awaiting && (
                        // awaiting_prescription derived condition (doc 02 §4.3) — doctor-facing nudge;
                        // the F12/A3 admin alert is Slice G.
                        <span className="badge badge--warning">Awaiting prescription</span>
                      )}
                      {showCancel && (
                        <button
                          type="button"
                          className="btn btn--danger-ghost btn--sm"
                          onClick={() => setCancelId(a.id)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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

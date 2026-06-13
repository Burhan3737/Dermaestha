// @ts-check
import { Link, useParams } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatKarachi } from '../../../../lib/format/format.js';
import { useVideo } from '../../useVideo.js';

export function WaitingRoom() {
  const { id } = useParams();
  // detail gives doctor context + slot times; the token query also pre-warms the call-page cache.
  const { detail } = useVideo({ appointmentId: id });
  const d = detail.data;

  const slotStart = d?.slotStart ? new Date(d.slotStart).getTime() : null;
  const slotEnd = d?.slotEnd ? new Date(d.slotEnd).getTime() : null;
  const active =
    slotStart != null &&
    Date.now() >= slotStart - 10 * 60 * 1000 &&
    slotEnd != null &&
    Date.now() <= slotEnd + 5 * 60 * 1000;

  return (
    <PatientLayout>
      <section className="section-card">
        <h1>Waiting room</h1>
        {detail.isPending && <p className="help">Loading…</p>}
        {d && (
          <>
            <div className="appt-row">
              <strong>{d.doctorName}</strong> — {d.specialization}
              <div>{formatKarachi(d.slotStart)}</div>
            </div>
            <div className="alert alert--info">
              <strong>For the best consultation:</strong> find a well-lit area — sit facing a window
              or lamp if you can. Good lighting helps your doctor see your skin clearly.
            </div>
            <p className="help" role="status">
              Doctor will be with you shortly. Please stay on this page.
            </p>
            {active ? (
              <Link className="btn btn--primary btn--block" to={`/video/${id}`}>
                Join Call
              </Link>
            ) : (
              <>
                <button type="button" className="btn btn--primary btn--block" disabled>
                  Join Call
                </button>
                <p className="help">
                  Active 10 minutes before your slot at {formatKarachi(d.slotStart)}.
                </p>
              </>
            )}
          </>
        )}
      </section>
    </PatientLayout>
  );
}

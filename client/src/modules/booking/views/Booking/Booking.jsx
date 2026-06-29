// @ts-check
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatPkr, formatKarachi } from '../../../../lib/format/format.js';
import { useBooking } from '../../useBooking.js';

export function Booking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const slotStart = params.get('slot');
  const [forSelf, setForSelf] = useState(true);
  const [subject, setSubject] = useState({ name: '', age: '', relation: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lockBlocked, setLockBlocked] = useState(false);

  const { doctor, confirmBooking } = useBooking({ doctorId: id });

  async function onConfirm() {
    setError(null);
    setLockBlocked(false);
    setBusy(true);
    try {
      const apptId = await confirmBooking({ doctorId: id, slotStart, forSelf, subject });
      navigate(`/book/pay/${apptId}`);
    } catch (e) {
      // An existing live hold blocks a new booking (Single-Lock). Point the patient to the pending
      // booking in their appointments so they can complete it (instead of a dead-end message).
      if (e.code === 'ACTIVE_LOCK_EXISTS') setLockBlocked(true);
      setError(e.message ?? 'Could not create the booking.');
      setBusy(false);
    }
  }

  return (
    <PatientLayout>
      {doctor.data && (
        <section className="section-card">
          <h1>{doctor.data.fullName}</h1>
          <p className="doc-card__spec">{doctor.data.specialization}</p>
          <p>Slot: {formatKarachi(slotStart)}</p>
          <p className="doc-card__fee">{formatPkr(doctor.data.fee)}</p>
        </section>
      )}
      <section className="section-card">
        <h2>Who is this consultation for?</h2>
        <label>
          <input type="radio" name="who" checked={forSelf} onChange={() => setForSelf(true)} />{' '}
          Myself
        </label>
        <label>
          <input type="radio" name="who" checked={!forSelf} onChange={() => setForSelf(false)} />{' '}
          Someone else
        </label>
        {!forSelf && (
          <div>
            <label>
              Patient name
              <input
                value={subject.name}
                onChange={(e) => setSubject({ ...subject, name: e.target.value })}
              />
            </label>
            <label>
              Age
              <input
                type="number"
                value={subject.age}
                onChange={(e) => setSubject({ ...subject, age: e.target.value })}
              />
            </label>
            <label>
              Relation
              <input
                value={subject.relation}
                onChange={(e) => setSubject({ ...subject, relation: e.target.value })}
              />
            </label>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        {lockBlocked && (
          <Link className="btn btn--secondary" to="/appointments">
            Go to your appointments
          </Link>
        )}
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || !slotStart}
          onClick={onConfirm}
        >
          Confirm booking
        </button>
      </section>
    </PatientLayout>
  );
}
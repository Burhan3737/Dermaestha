// @ts-check
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { PatientLayout } from '../layouts/PatientLayout.jsx';
import { formatPkr, formatKarachi } from '../lib/format.js';

export function Booking() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const slotStart = params.get('slot');
  const [forSelf, setForSelf] = useState(true);
  const [subject, setSubject] = useState({ name: '', age: '', relation: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const doctor = useQuery({ queryKey: ['doctor', id], queryFn: () => api.get(`/doctors/${id}`) });

  async function confirmAndPay() {
    setError(null);
    setBusy(true);
    try {
      const body = { doctorId: id, slotStart, forSelf };
      if (!forSelf) body.subject = { name: subject.name, age: Number(subject.age), relation: subject.relation };
      const appt = await api.post('/appointments/lock', body);
      const { redirectUrl } = await api.post(`/appointments/${appt.id}/pay`);
      window.location.href = redirectUrl;
    } catch (e) {
      setError(e.message ?? 'Could not start payment.');
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
          <input type="radio" name="who" checked={forSelf} onChange={() => setForSelf(true)} /> Myself
        </label>
        <label>
          <input type="radio" name="who" checked={!forSelf} onChange={() => setForSelf(false)} /> Someone else
        </label>
        {!forSelf && (
          <div>
            <label>
              Patient name
              <input value={subject.name} onChange={(e) => setSubject({ ...subject, name: e.target.value })} />
            </label>
            <label>
              Age
              <input type="number" value={subject.age} onChange={(e) => setSubject({ ...subject, age: e.target.value })} />
            </label>
            <label>
              Relation
              <input value={subject.relation} onChange={(e) => setSubject({ ...subject, relation: e.target.value })} />
            </label>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        <button type="button" className="btn btn--primary" disabled={busy || !slotStart} onClick={confirmAndPay}>
          Confirm & Pay
        </button>
      </section>
    </PatientLayout>
  );
}

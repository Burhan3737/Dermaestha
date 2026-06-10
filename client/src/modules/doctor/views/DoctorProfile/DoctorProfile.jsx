// @ts-check
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { SlotButton } from '../../../../shared/SlotButton/SlotButton.jsx';
import { formatPkr } from '../../../../lib/format/format.js';
import { useDoctor } from '../../useDoctor.js';

function todayKarachiYMD() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function DoctorProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [date] = useState(todayKarachiYMD());

  const { doctor, slots } = useDoctor({ doctorId: id, slotsDate: date });

  if (doctor.isError)
    return (
      <PatientLayout>
        <p className="error-text">Doctor not found.</p>
      </PatientLayout>
    );

  return (
    <PatientLayout>
      {doctor.data && (
        <section className="section-card">
          <h1>{doctor.data.fullName}</h1>
          <p className="doc-card__spec">{doctor.data.specialization}</p>
          <p>{doctor.data.bio}</p>
          <p className="doc-card__fee">{formatPkr(doctor.data.fee)}</p>
        </section>
      )}
      <section className="section-card">
        <h2>Available today</h2>
        {slots.isPending && <p className="help">Loading slots…</p>}
        {slots.isError && (
          <p className="error-text">Could not load slots. Please try again.</p>
        )}
        {slots.data && slots.data.data.length === 0 && (
          <p className="help">No slots available today.</p>
        )}
        {slots.data && slots.data.data.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            {slots.data.data.map((s) => (
              <SlotButton
                key={s.slotStart}
                slot={s}
                selected={false}
                onSelect={() => navigate(`/book/${id}?slot=${encodeURIComponent(s.slotStart)}`)}
              />
            ))}
          </div>
        )}
      </section>
    </PatientLayout>
  );
}
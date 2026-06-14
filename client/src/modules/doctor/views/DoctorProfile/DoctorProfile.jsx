// @ts-check
import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { SlotButton } from '../../../../shared/SlotButton/SlotButton.jsx';
import { formatPkr } from '../../../../lib/format/format.js';
import { useDoctor } from '../../useDoctor.js';

// Upcoming bookable days (Asia/Karachi). Pakistan observes no DST, so a fixed 24h step is safe.
function upcomingKarachiDays(count = 7) {
  const ymdFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const labelFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    days.push({ ymd: ymdFmt.format(d), label: i === 0 ? 'Today' : labelFmt.format(d) });
  }
  return days;
}

export function DoctorProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const days = useMemo(() => upcomingKarachiDays(7), []);
  const [date, setDate] = useState(days[0].ymd);

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
        <h2>Available slots</h2>
        <div
          className="day-tabs"
          role="tablist"
          aria-label="Choose a day"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}
        >
          {days.map((d) => (
            <button
              key={d.ymd}
              type="button"
              role="tab"
              aria-selected={d.ymd === date}
              className={`day-tab btn btn--sm ${d.ymd === date ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setDate(d.ymd)}
            >
              {d.label}
            </button>
          ))}
        </div>
        {slots.isPending && <p className="help">Loading slots…</p>}
        {slots.isError && (
          <p className="error-text">Could not load slots. Please try again.</p>
        )}
        {slots.data && slots.data.data.length === 0 && (
          <p className="help">No slots available on this day.</p>
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
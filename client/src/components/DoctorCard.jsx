// @ts-check
import { Link } from 'react-router-dom';
import { formatPkr, formatKarachi } from '../lib/format.js';

export function DoctorCard({ doctor }) {
  return (
    <Link
      to={`/doctors/${doctor.id}`}
      className="doc-card"
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div className="doc-card__img">
        {doctor.photoUrl ? (
          <img src={doctor.photoUrl} alt={doctor.fullName} />
        ) : (
          <div
            className="avatar avatar--lg"
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 0,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {initials(doctor.fullName)}
          </div>
        )}
      </div>
      <div className="doc-card__body">
        <h3 className="doc-card__name">{doctor.fullName}</h3>
        <p className="doc-card__spec">{doctor.specialization}</p>
        <div className="doc-card__foot">
          <span className="doc-card__fee">{formatPkr(doctor.fee)}</span>
          <span className="doc-card__slot">
            {doctor.nextAvailableSlot
              ? `Next: ${formatKarachi(doctor.nextAvailableSlot)}`
              : 'No slots'}
          </span>
        </div>
      </div>
    </Link>
  );
}

function initials(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

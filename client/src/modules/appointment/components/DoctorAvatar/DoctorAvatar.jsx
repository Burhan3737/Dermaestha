// @ts-check
import { initials } from '../../../../lib/format/format.js';

/** Doctor avatar for appointment rows — the photo when present, initials fallback otherwise. */
export function DoctorAvatar({ name, photoUrl }) {
  return photoUrl ? (
    <img className="avatar avatar--lg appt-avatar" src={photoUrl} alt="" />
  ) : (
    <span className="avatar avatar--lg appt-avatar">{initials(name)}</span>
  );
}

// @ts-check
import { useNavigate } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { useSession } from '../../../../context/session/session.jsx';
import { useAuth } from '../../../auth/useAuth.js';

/** Minimal account view (doc 06 §2 registry note: "logout + basic details"). ISSUE-11. */
export function Profile() {
  const { session } = useSession();
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <PatientLayout>
      <section className="section-card">
        <h1>Your account</h1>
        {session && (
          <dl className="profile-details">
            <dt className="label">Name</dt>
            <dd>{session.fullName}</dd>
            <dt className="label">Role</dt>
            <dd>{session.role}</dd>
          </dl>
        )}
        <button type="button" className="btn btn--secondary" onClick={handleLogout}>
          Log out
        </button>
      </section>
    </PatientLayout>
  );
}

// @ts-check
import { NavLink } from 'react-router-dom';
import { api } from '../../lib/apiClient/apiClient.js';

export const DOCTOR_LINKS = [
  // Single appointments section (Today/History live as in-page tabs on the page, ADR-42).
  { to: '/doctor', label: 'Appointments', end: true },
  { to: '/doctor/availability', label: 'Availability' },
];

export function SidebarLayout({ links = DOCTOR_LINKS, children }) {
  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } finally {
      // Full reload clears client session state and re-bootstraps via /auth/me → /login.
      window.location.assign('/login');
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="brand" style={{ marginBottom: 'var(--sp-6)' }}>
          <span className="brand__mark" />
          <span className="brand__word">Dermestha</span>
        </div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="sidebar__link">
            {l.label}
          </NavLink>
        ))}
        <button
          type="button"
          className="sidebar__link"
          onClick={handleLogout}
          style={{
            marginTop: 'auto',
            background: 'none',
            border: 'none',
            font: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Log out
        </button>
      </nav>
      <div className="content">{children}</div>
    </div>
  );
}

// @ts-check
import { NavLink } from 'react-router-dom';

const DOCTOR_LINKS = [
  { to: '/doctor', label: 'Today', end: true },
  { to: '/doctor/availability', label: 'Availability' },
  { to: '/doctor/history', label: 'History' },
];

export function SidebarLayout({ links = DOCTOR_LINKS, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav className="sidebar">
        <div className="brand" style={{ marginBottom: 'var(--sp-6)' }}>
          <span className="brand__mark" />
          <span className="brand__word">Dermestha</span>
        </div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="sidebar__link">{l.label}</NavLink>
        ))}
      </nav>
      <div className="content">{children}</div>
    </div>
  );
}

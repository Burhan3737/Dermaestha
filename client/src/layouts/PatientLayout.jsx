// @ts-check
import { Link, NavLink } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';

export function PatientLayout({ children }) {
  const { session } = useSession();
  return (
    <>
      <header className="topnav">
        <div className="topnav__inner container">
          <Link to="/" className="brand">
            <span className="brand__mark" />
            <span className="brand__word">Dermestha</span>
          </Link>
          <nav className="topnav__links">
            <NavLink to="/">Browse</NavLink>
            {session ? (
              <NavLink to="/appointments">Appointments</NavLink>
            ) : (
              <Link to="/login" className="btn btn--secondary btn--sm">
                Log in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="container" style={{ padding: 'var(--sp-6) var(--sp-4) 80px' }}>
        {children}
      </main>
      {session && (
        <nav className="tabbar only-mobile">
          <NavLink to="/" className="tabbar__item">
            Browse
          </NavLink>
          <NavLink to="/appointments" className="tabbar__item">
            Appointments
          </NavLink>
          <NavLink to="/profile" className="tabbar__item">
            Profile
          </NavLink>
        </nav>
      )}
    </>
  );
}

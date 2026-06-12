// @ts-check
import { Routes, Route } from 'react-router-dom';
import { useSession } from './context/session/session.jsx';
import { useAuth } from './modules/auth/useAuth.js';
import { buildRoutes } from './routes.jsx';

function Placeholder({ label }) {
  const { logout } = useAuth();
  return (
    <main style={{ maxWidth: 600, margin: '64px auto', padding: 24 }}>
      <h1 style={{ color: 'var(--color-primary)' }}>{label}</h1>
      <p style={{ color: 'var(--color-text-body)' }}>Coming in a later slice.</p>
      <button className="btn btn--secondary" onClick={() => logout()}>
        Log out
      </button>
    </main>
  );
}

export function AppRoutes() {
  const { session, loading } = useSession();
  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <Routes>
      {buildRoutes(session).map((r) => (
        <Route key={r.path} path={r.path} element={r.element} />
      ))}
      <Route path="*" element={<Placeholder label="Dermestha" />} />
    </Routes>
  );
}
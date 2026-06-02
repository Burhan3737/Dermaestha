// @ts-check
import { Routes, Route } from 'react-router-dom';
import { routes } from './routes.jsx';
import { useSession } from './lib/session.jsx';

function Placeholder({ label }) {
  const { logout } = useSession();
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
  const { loading } = useSession();
  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <Routes>
      {routes.map((r) => (
        <Route key={r.path} path={r.path} element={r.element} />
      ))}
      <Route path="/" element={<Placeholder label="Patient dashboard" />} />
      <Route path="/doctor" element={<Placeholder label="Doctor panel" />} />
      <Route path="/admin" element={<Placeholder label="Admin panel" />} />
      <Route path="*" element={<Placeholder label="Dermestha" />} />
    </Routes>
  );
}

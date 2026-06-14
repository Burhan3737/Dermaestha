// @ts-check
import { Routes, Route } from 'react-router-dom';
import { useSession } from './context/session/session.jsx';
import { buildRoutes } from './routes.jsx';
import { NotFound } from './shared/NotFound/NotFound.jsx';

export function AppRoutes() {
  const { session, loading } = useSession();
  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <Routes>
      {buildRoutes(session).map((r) => (
        <Route key={r.path} path={r.path} element={r.element} />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
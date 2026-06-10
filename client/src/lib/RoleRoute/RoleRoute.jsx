import { Navigate } from 'react-router-dom';

/** Convenience client-side guard. The SERVER (DA6) is the real boundary. */
export function RoleRoute({ session, role, children }) {
  if (!session) return <Navigate to="/login" replace />;
  if (role && session.role !== role) return <Navigate to="/" replace />;
  return children;
}

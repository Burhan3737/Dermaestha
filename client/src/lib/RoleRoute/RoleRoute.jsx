import { Navigate } from 'react-router-dom';

/** Convenience client-side guard. The SERVER (DA6) is the real boundary. `role` may be a string or an array. */
export function RoleRoute({ session, role, children }) {
  if (!session) return <Navigate to="/login" replace />;
  const allowed = role == null ? null : Array.isArray(role) ? role : [role];
  if (allowed && !allowed.includes(session.role)) return <Navigate to="/" replace />;
  return children;
}

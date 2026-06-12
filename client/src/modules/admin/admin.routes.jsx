// @ts-check
import { Navigate } from 'react-router-dom';
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { AdminDoctors } from './views/AdminDoctors/AdminDoctors.jsx';
import { AdminMedicines } from './views/AdminMedicines/AdminMedicines.jsx';

/** Admin sidebar links (A-01…A-05). Entries are added as the views land. */
export const ADMIN_LINKS = [
  { to: '/admin/doctors', label: 'Doctors' },
  { to: '/admin/medicines', label: 'Medicines' },
];

const guard = (session, el) => (
  <RoleRoute session={session} role="admin">
    {el}
  </RoleRoute>
);

export const adminRoutes = (session) => [
  { path: '/admin', element: guard(session, <Navigate to="/admin/doctors" replace />) },
  { path: '/admin/doctors', element: guard(session, <AdminDoctors />) },
  { path: '/admin/medicines', element: guard(session, <AdminMedicines />) },
];

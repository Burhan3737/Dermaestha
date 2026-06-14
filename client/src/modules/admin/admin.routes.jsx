// @ts-check
import { Navigate } from 'react-router-dom';
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { AdminDoctors } from './views/AdminDoctors/AdminDoctors.jsx';
import { AdminMedicines } from './views/AdminMedicines/AdminMedicines.jsx';
import { AdminRecords } from './views/AdminRecords/AdminRecords.jsx';
import { AdminRecordDetail } from './views/AdminRecordDetail/AdminRecordDetail.jsx';
import { AdminAlerts } from './views/AdminAlerts/AdminAlerts.jsx';
import { AdminSettings } from './views/AdminSettings/AdminSettings.jsx';
import { AdminAppearance } from './views/AdminAppearance/AdminAppearance.jsx';

/** Admin sidebar links (A-01…A-05). Entries are added as the views land. */
export const ADMIN_LINKS = [
  { to: '/admin/doctors', label: 'Doctors' },
  { to: '/admin/medicines', label: 'Medicines' },
  { to: '/admin/records', label: 'Records & audit' },
  { to: '/admin/alerts', label: 'System health' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/appearance', label: 'Appearance' },
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
  { path: '/admin/records', element: guard(session, <AdminRecords />) },
  { path: '/admin/records/:id', element: guard(session, <AdminRecordDetail />) },
  { path: '/admin/alerts', element: guard(session, <AdminAlerts />) },
  { path: '/admin/settings', element: guard(session, <AdminSettings />) },
  { path: '/admin/appearance', element: guard(session, <AdminAppearance />) },
];

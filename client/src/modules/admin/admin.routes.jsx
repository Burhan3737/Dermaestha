// @ts-check
import { Navigate } from 'react-router-dom';
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { AdminDoctors } from './views/AdminDoctors/AdminDoctors.jsx';
import { AdminMedicines } from './views/AdminMedicines/AdminMedicines.jsx';
import { AdminRecords } from './views/AdminRecords/AdminRecords.jsx';
import { AdminRecordDetail } from './views/AdminRecordDetail/AdminRecordDetail.jsx';
import { AdminReview } from './views/AdminReview/AdminReview.jsx';
import { AdminAlerts } from './views/AdminAlerts/AdminAlerts.jsx';
import { AdminSettings } from './views/AdminSettings/AdminSettings.jsx';

/** Admin sidebar links (A-01…A-06). Entries are added as the views land. */
export const ADMIN_LINKS = [
  { to: '/admin/doctors', label: 'Doctors' },
  { to: '/admin/medicines', label: 'Medicines' },
  { to: '/admin/review', label: 'Payment review' },
  { to: '/admin/records', label: 'Records & audit' },
  { to: '/admin/alerts', label: 'System health' },
  { to: '/admin/settings', label: 'Settings' },
];

// Each route declares its OWN allowed roles (no shared/implied tier). To segregate later —
// e.g. make Settings superadmin-only, or admit a new role on one view — edit just that route's
// `roles` array. Mirrors the server's explicit per-route dual-listing (requireRole).
const guard = (session, roles, el) => (
  <RoleRoute session={session} role={roles}>
    {el}
  </RoleRoute>
);

export const adminRoutes = (session) => [
  { path: '/admin', element: guard(session, ['admin', 'superadmin'], <Navigate to="/admin/doctors" replace />) },
  { path: '/admin/doctors', element: guard(session, ['admin', 'superadmin'], <AdminDoctors />) },
  { path: '/admin/medicines', element: guard(session, ['admin', 'superadmin'], <AdminMedicines />) },
  { path: '/admin/review', element: guard(session, ['admin', 'superadmin'], <AdminReview />) },
  { path: '/admin/records', element: guard(session, ['admin', 'superadmin'], <AdminRecords />) },
  { path: '/admin/records/audit', element: guard(session, ['admin', 'superadmin'], <AdminRecords />) },
  { path: '/admin/records/:id', element: guard(session, ['admin', 'superadmin'], <AdminRecordDetail />) },
  { path: '/admin/alerts', element: guard(session, ['admin', 'superadmin'], <AdminAlerts />) },
  { path: '/admin/settings', element: guard(session, ['admin', 'superadmin'], <AdminSettings />) },
];

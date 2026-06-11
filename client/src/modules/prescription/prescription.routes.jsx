// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { PrescriptionView } from './views/PrescriptionView/PrescriptionView.jsx';

/** Prescription module routes (D3). */
export const prescriptionRoutes = (session) => [
  {
    path: '/appointments/:id/prescriptions',
    element: (
      <RoleRoute session={session} role="patient">
        <PrescriptionView />
      </RoleRoute>
    ),
  },
];

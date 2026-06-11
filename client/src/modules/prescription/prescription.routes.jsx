// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { PrescriptionView } from './views/PrescriptionView/PrescriptionView.jsx';
import { PrescriptionBuilder } from './views/PrescriptionBuilder/PrescriptionBuilder.jsx';

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
  {
    path: '/doctor/appointments/:id/prescribe',
    element: (
      <RoleRoute session={session} role="doctor">
        <PrescriptionBuilder />
      </RoleRoute>
    ),
  },
];

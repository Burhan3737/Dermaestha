// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { Upcoming } from './views/Upcoming/Upcoming.jsx';

/** Appointment module routes (D3). */
export const appointmentRoutes = (session) => [
  {
    path: '/appointments',
    element: (
      <RoleRoute session={session} role="patient">
        <Upcoming />
      </RoleRoute>
    ),
  },
];

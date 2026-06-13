// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { DoctorListing } from './views/DoctorListing/DoctorListing.jsx';
import { DoctorProfile } from './views/DoctorProfile/DoctorProfile.jsx';
import { DoctorToday } from './views/DoctorToday/DoctorToday.jsx';
import { AvailabilityGrid } from './views/AvailabilityGrid/AvailabilityGrid.jsx';

/**
 * Doctor module routes (D3). The RoleRoute-guarded doctor routes need the live session, so they are
 * exposed as a factory the aggregator calls with `session` (mirrors the prior App.jsx hardcoding).
 */
export const doctorRoutes = (session) => [
  { path: '/browse', element: <DoctorListing /> },
  { path: '/doctors/:id', element: <DoctorProfile /> },
  {
    path: '/doctor',
    element: (
      <RoleRoute session={session} role="doctor">
        <DoctorToday />
      </RoleRoute>
    ),
  },
  {
    path: '/doctor/availability',
    element: (
      <RoleRoute session={session} role="doctor">
        <AvailabilityGrid />
      </RoleRoute>
    ),
  },
];

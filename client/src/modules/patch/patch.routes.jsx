// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { Patches } from './views/Patches/Patches.jsx';

/** Superadmin-only Patches route. The SERVER (requireRole('superadmin')) is the real boundary. */
export const patchRoutes = (session) => [
  {
    path: '/admin/patches',
    element: (
      <RoleRoute session={session} role={['superadmin']}>
        <Patches />
      </RoleRoute>
    ),
  },
];

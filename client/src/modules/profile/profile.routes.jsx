// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { Profile } from './views/Profile/Profile.jsx';

/** Profile module routes (D3). `/profile` is any authenticated user's minimal account view (ISSUE-11). */
export const profileRoutes = (session) => [
  {
    path: '/profile',
    element: (
      <RoleRoute session={session}>
        <Profile />
      </RoleRoute>
    ),
  },
];

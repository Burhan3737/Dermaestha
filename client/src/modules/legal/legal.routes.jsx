// @ts-check
import { Terms } from './views/Terms/Terms.jsx';
import { Privacy } from './views/Privacy/Privacy.jsx';

/** Legal module routes (D3). Public/unauthenticated — linked from signup consent + landing footer. */
export const legalRoutes = [
  { path: '/legal/terms', element: <Terms /> },
  { path: '/legal/privacy', element: <Privacy /> },
];

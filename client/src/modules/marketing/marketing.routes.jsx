// @ts-check
import { Navigate } from 'react-router-dom';
import { Landing } from './views/Landing/Landing.jsx';

/**
 * Marketing module routes (D3). `/` serves the public P-01 landing; a logged-in patient is
 * redirected to /browse so the logged-out acquisition page isn't shown to them.
 */
export const marketingRoutes = (session) => [
  {
    path: '/',
    element: session?.role === 'patient' ? <Navigate to="/browse" replace /> : <Landing />,
  },
];

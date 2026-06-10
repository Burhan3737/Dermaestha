// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { Booking } from './views/Booking/Booking.jsx';
import { PaymentReturn } from './views/PaymentReturn/PaymentReturn.jsx';

/** Booking module routes (D3). */
export const bookingRoutes = (session) => [
  {
    path: '/book/:id',
    element: (
      <RoleRoute session={session} role="patient">
        <Booking />
      </RoleRoute>
    ),
  },
  {
    path: '/pay/return',
    element: (
      <RoleRoute session={session} role="patient">
        <PaymentReturn />
      </RoleRoute>
    ),
  },
];

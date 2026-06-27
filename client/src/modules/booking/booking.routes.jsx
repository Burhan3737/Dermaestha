// @ts-check
import { RoleRoute } from '../../lib/RoleRoute/RoleRoute.jsx';
import { Booking } from './views/Booking/Booking.jsx';
import { PaymentInstructions } from './views/PaymentInstructions/PaymentInstructions.jsx';

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
    path: '/book/pay/:id',
    element: (
      <RoleRoute session={session} role="patient">
        <PaymentInstructions />
      </RoleRoute>
    ),
  },
];

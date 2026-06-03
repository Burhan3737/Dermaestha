// @ts-check
import { SignUp } from './views/SignUp.jsx';
import { Login } from './views/Login.jsx';
import { ForgotPassword } from './views/ForgotPassword.jsx';
import { ResetPassword } from './views/ResetPassword.jsx';
import { ChangePassword } from './views/ChangePassword.jsx';
import { DoctorProfile } from './views/DoctorProfile.jsx';
import { Booking } from './views/Booking.jsx';
import { PaymentReturn } from './views/PaymentReturn.jsx';

/** Public + Slice-A auth routes. Slice-B adds discovery routes. */
export const routes = [
  { path: '/signup', element: <SignUp /> },
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/doctor/change-password', element: <ChangePassword /> },
  { path: '/doctors/:id', element: <DoctorProfile /> },
  { path: '/book/:id', element: <Booking /> },
  { path: '/pay/return', element: <PaymentReturn /> },
];

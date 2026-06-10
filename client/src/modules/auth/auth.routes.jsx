// @ts-check
import { Login } from './views/Login/Login.jsx';
import { SignUp } from './views/SignUp/SignUp.jsx';
import { ForgotPassword } from './views/ForgotPassword/ForgotPassword.jsx';
import { ResetPassword } from './views/ResetPassword/ResetPassword.jsx';
import { ChangePassword } from './views/ChangePassword/ChangePassword.jsx';

/** Auth module routes (D3). */
export const authRoutes = [
  { path: '/signup', element: <SignUp /> },
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/doctor/change-password', element: <ChangePassword /> },
];

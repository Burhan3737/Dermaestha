// @ts-check
import { authRoutes } from './modules/auth/auth.routes.jsx';
import { doctorRoutes } from './modules/doctor/doctor.routes.jsx';
import { bookingRoutes } from './modules/booking/booking.routes.jsx';
import { appointmentRoutes } from './modules/appointment/appointment.routes.jsx';
import { videoRoutes } from './modules/video/video.routes.jsx';
import { prescriptionRoutes } from './modules/prescription/prescription.routes.jsx';
import { adminRoutes } from './modules/admin/admin.routes.jsx';

/**
 * Aggregated route table (D3). Each module owns its own *.routes.jsx (incl. its RoleRoute wrapping);
 * the guarded modules take the live session, so this is a factory rather than a static array.
 */
export const buildRoutes = (session) => [
  ...authRoutes,
  ...doctorRoutes(session),
  ...bookingRoutes(session),
  ...appointmentRoutes(session),
  ...videoRoutes(session),
  ...prescriptionRoutes(session),
  ...adminRoutes(session),
];
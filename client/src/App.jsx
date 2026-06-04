// @ts-check
import { Routes, Route } from 'react-router-dom';
import { routes } from './routes.jsx';
import { useSession } from './lib/session.jsx';
import { RoleRoute } from './lib/RoleRoute.jsx';
import { DoctorListing } from './views/DoctorListing.jsx';
import { AvailabilityGrid } from './views/AvailabilityGrid.jsx';
import { Upcoming } from './views/Upcoming.jsx';
import { Booking } from './views/Booking.jsx';
import { PaymentReturn } from './views/PaymentReturn.jsx';
import { VideoRoom } from './views/VideoRoom.jsx';
import { Login } from './views/Login.jsx';

function Placeholder({ label }) {
  const { logout } = useSession();
  return (
    <main style={{ maxWidth: 600, margin: '64px auto', padding: 24 }}>
      <h1 style={{ color: 'var(--color-primary)' }}>{label}</h1>
      <p style={{ color: 'var(--color-text-body)' }}>Coming in a later slice.</p>
      <button className="btn btn--secondary" onClick={() => logout()}>
        Log out
      </button>
    </main>
  );
}

export function AppRoutes() {
  const { session, loading } = useSession();
  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <Routes>
      <Route path="/" element={<DoctorListing />} />
      {routes.map((r) => (
        <Route key={r.path} path={r.path} element={r.element} />
      ))}
      <Route
        path="/doctor/availability"
        element={
          <RoleRoute session={session} role="doctor">
            <AvailabilityGrid />
          </RoleRoute>
        }
      />
      <Route
        path="/appointments"
        element={
          <RoleRoute session={session} role="patient">
            <Upcoming />
          </RoleRoute>
        }
      />
      <Route
        path="/book/:id"
        element={
          <RoleRoute session={session} role="patient">
            <Booking />
          </RoleRoute>
        }
      />
      <Route
        path="/pay/return"
        element={
          <RoleRoute session={session} role="patient">
            <PaymentReturn />
          </RoleRoute>
        }
      />
      <Route path="/video/:id" element={session ? <VideoRoom /> : <Login />} />
      <Route path="/doctor" element={<Placeholder label="Doctor — Today" />} />
      <Route path="/admin" element={<Placeholder label="Admin panel" />} />
      <Route path="*" element={<Placeholder label="Dermestha" />} />
    </Routes>
  );
}

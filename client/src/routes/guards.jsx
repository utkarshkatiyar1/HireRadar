import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

const ADMIN_EMAIL = 'utkarshkatiyar688@gmail.com';

// Redirects to /login if no token. Replaces the current
// "if (!token && page !== 'pricing') return AuthScreen" branch.
export function ProtectedRoute() {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

// Redirects authed users away from /login to /jobs.
export function PublicOnlyRoute({ children }) {
  const { token } = useAuth();
  if (token) return <Navigate to="/jobs" replace />;
  return children;
}

// Same hardcoded-email check as today — flagged as a wart worth generalizing
// to a user.role field later, not fixed in this UI-only pass.
export function AdminRoute() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  if (!isAdmin) return <Navigate to="/jobs" replace />;
  return <Outlet />;
}

export { ADMIN_EMAIL };

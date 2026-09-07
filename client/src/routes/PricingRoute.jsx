import { useAuth } from '../auth';
import PublicHeader from '../layout/PublicHeader';
import PricingPage from '../components/PricingPage';

// The genuinely special case: /pricing must be viewable while logged out
// (no sidebar chrome — a logged-out visitor shouldn't see the authed shell)
// but also viewable normally once logged in. Not nested inside AppShell's
// layout route for this reason; renders its own minimal chrome when
// logged out, or nothing extra when logged in (App.jsx's authed /pricing
// route under AppShell handles that case instead — see routes tree).
export default function PricingRoute() {
  const { token } = useAuth();

  if (!token) {
    return (
      <>
        <PublicHeader />
        <div className="app"><main><PricingPage /></main></div>
      </>
    );
  }

  return (
    <div className="app"><main><PricingPage /></main></div>
  );
}

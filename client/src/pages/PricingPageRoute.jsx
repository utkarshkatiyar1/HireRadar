import PricingPage from '../components/PricingPage';

// /pricing when authed renders inside the full AppShell — same PricingPage
// component, this route just adds no extra chrome since AppShell already
// wraps it via the layout route.
export default function PricingPageRoute() {
  return (
    <main>
      <PricingPage />
    </main>
  );
}

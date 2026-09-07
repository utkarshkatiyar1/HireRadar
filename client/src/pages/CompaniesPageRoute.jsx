import CompaniesPage from '../components/CompaniesPage';
import { useAuth } from '../auth';
import { ADMIN_EMAIL } from '../routes/guards';

// Thin route wrapper — CompaniesPage still receives isAdmin as a prop for
// now (kept minimal for this pass; reading useAuth() internally is a small
// follow-up, not required for the router migration itself).
export default function CompaniesPageRoute() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  return (
    <main>
      <CompaniesPage isAdmin={isAdmin} />
    </main>
  );
}

import ProfilePage from '../components/ProfilePage';
import { useAuth } from '../auth';

export default function ProfilePageRoute() {
  const { user } = useAuth();
  return (
    <main>
      <ProfilePage user={user} />
    </main>
  );
}

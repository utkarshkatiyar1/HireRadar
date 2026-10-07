import Leaderboard from '../components/Leaderboard';
import { useAuth } from '../auth';

export default function LeaderboardPageRoute() {
  const { user } = useAuth();
  return (
    <main>
      <Leaderboard currentUserId={user?.id} />
    </main>
  );
}

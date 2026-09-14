import { useAuth } from '../auth';
import { useJobs } from '../hooks/useJobs';
import StatsPanel from '../components/StatsPanel';

export default function ProgressPage() {
  const { token } = useAuth();
  const { stats } = useJobs({ token, smartFilter: true });

  return (
    <main className="progress-page">
      {stats ? <StatsPanel stats={stats} /> : <p className="msg">Loading stats…</p>}
    </main>
  );
}

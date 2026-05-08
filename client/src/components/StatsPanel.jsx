import { useMemo } from 'react';

const DAY_MS    = 86_400_000;
const DAILY_GOAL = 5;

const isoDate = (offset = 0) => {
  const d = new Date(Date.now() - offset * DAY_MS);
  return d.toISOString().slice(0, 10);
};

const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function calcStreak(daily) {
  const byDate = Object.fromEntries(daily.map(d => [d._id, d.count]));
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    if (byDate[isoDate(i)]) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function buildLast14(daily) {
  const byDate = Object.fromEntries(daily.map(d => [d._id, d.count]));
  return Array.from({ length: 14 }, (_, i) => {
    const key = isoDate(13 - i);
    return { key, label: fmtDate(key), count: byDate[key] ?? 0 };
  });
}

function MetricCard({ value, label, color, icon }) {
  return (
    <div className="sp2-card">
      <div className="sp2-card-icon">{icon}</div>
      <div className={`sp2-card-value ${color}`}>{value}</div>
      <div className="sp2-card-label">{label}</div>
    </div>
  );
}

export default function StatsPanel({ stats }) {
  const days        = useMemo(() => buildLast14(stats.daily ?? []), [stats.daily]);
  const streak      = useMemo(() => calcStreak(stats.daily ?? []),  [stats.daily]);
  const max         = Math.max(...days.map(d => d.count), 1);
  const todayCount  = stats.appToday ?? 0;
  const goalPct     = Math.min((todayCount / DAILY_GOAL) * 100, 100);
  const topCos      = stats.topCompanies ?? [];

  return (
    <div className="sp2">

      {/* ── Section: Key Numbers ── */}
      <section className="sp2-section">
        <h2 className="sp2-heading">Overview</h2>
        <div className="sp2-cards">
          <MetricCard value={streak}            label="Day Streak"      color="accent" icon="🔥" />
          <MetricCard value={todayCount}         label="Applied Today"   color="accent" icon="⚡" />
          <MetricCard value={stats.appWeek ?? 0} label="This Week"       color="teal"   icon="📅" />
          <MetricCard value={stats.appMonth ?? 0} label="30 Days"        color="teal"   icon="📈" />
          <MetricCard value={stats.applied ?? 0}  label="Total Applied"  color="violet" icon="✅" />
          <MetricCard value={stats.newToday ?? 0} label="New Jobs Today" color=""       icon="🆕" />
        </div>
      </section>

      {/* ── Section: Today's Goal ── */}
      <section className="sp2-section">
        <div className="sp2-goal-header">
          <h2 className="sp2-heading">Today's Goal</h2>
          <span className="sp2-goal-frac">{todayCount} / {DAILY_GOAL} applications</span>
        </div>
        <div className="sp2-goal-track">
          <div className="sp2-goal-bar" style={{ width: `${goalPct}%` }} />
        </div>
        <p className="sp2-goal-hint">
          {todayCount === 0
            ? 'No applications yet today — first one is the hardest.'
            : todayCount < DAILY_GOAL
            ? `${DAILY_GOAL - todayCount} more to hit your daily goal.`
            : '🎯 Goal crushed! Keep going.'}
        </p>
      </section>

      {/* ── Section: Bar Chart ── */}
      <section className="sp2-section">
        <h2 className="sp2-heading">Applications — Last 14 Days</h2>
        <div className="sp2-chart">
          {days.map(d => {
            const pct    = max > 0 ? (d.count / max) * 100 : 0;
            const isToday = d.key === isoDate(0);
            return (
              <div key={d.key} className="sp2-col">
                <span className="sp2-bar-val">{d.count > 0 ? d.count : ''}</span>
                <div className="sp2-bar-wrap">
                  <div
                    className={`sp2-bar${isToday ? ' today' : ''}${d.count === 0 ? ' zero' : ''}`}
                    style={{ height: `${d.count > 0 ? Math.max(pct, 6) : 2}%` }}
                  />
                </div>
                <span className={`sp2-bar-date${isToday ? ' today' : ''}`}>{d.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section: Top Companies ── */}
      {topCos.length > 0 && (
        <section className="sp2-section">
          <h2 className="sp2-heading">Companies Applied To</h2>
          <div className="sp2-companies">
            {topCos.map(({ _id: co, count }) => (
              <div key={co} className="sp2-co-row">
                <span className="sp2-co-name">{co}</span>
                <div className="sp2-co-track">
                  <div
                    className="sp2-co-bar"
                    style={{ width: `${(count / topCos[0].count) * 100}%` }}
                  />
                </div>
                <span className="sp2-co-count">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {topCos.length === 0 && (
        <section className="sp2-section sp2-empty-state">
          <div className="sp2-empty-icon">🚀</div>
          <p className="sp2-empty-title">No applications yet</p>
          <p className="sp2-empty-hint">Head to the Jobs tab and mark your first application. Stats will populate here.</p>
        </section>
      )}

    </div>
  );
}

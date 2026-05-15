import { useEffect, useState } from 'react';
import { authFetch } from '../auth';

const AVATAR_BG = [
  'linear-gradient(135deg,#fbbf24,#d97706)',  // gold
  'linear-gradient(135deg,#cbd5e1,#64748b)',  // silver
  'linear-gradient(135deg,#fb923c,#9a3412)',  // bronze
  'linear-gradient(135deg,#8b5cf6,#6d28d9)',
  'linear-gradient(135deg,#2dd4bf,#0d9488)',
  'linear-gradient(135deg,#22c55e,#16a34a)',
  'linear-gradient(135deg,#60a5fa,#3b82f6)',
  'linear-gradient(135deg,#f87171,#ef4444)',
];

const RANK_LABEL = ['1st', '2nd', '3rd'];

function Podium({ rows, currentUserId }) {
  if (rows.length < 3) return null;
  // Podium order: 2nd, 1st, 3rd
  const order = [rows[1], rows[0], rows[2]];
  const heights = ['podium-2', 'podium-1', 'podium-3'];
  const indices = [1, 0, 2];

  return (
    <div className="lb-podium">
      {order.map((r, i) => {
        const rank = indices[i];
        const mine = currentUserId && String(r.userId) === String(currentUserId);
        return (
          <div key={r.userId} className={`podium-col ${heights[i]}${mine ? ' me' : ''}`}>
            <div className="podium-name-stack">
              <div className="podium-avatar" style={{ background: AVATAR_BG[rank] }}>
                {r.name[0].toUpperCase()}
              </div>
              <span className="podium-name">{r.name}{mine && <span className="lb-you">you</span>}</span>
              <span className="podium-total">{r.total}</span>
              <span className="podium-meta">{r.thisWeek} this week · {r.today} today</span>
            </div>
            <div className="podium-block">
              <span className="podium-rank">{RANK_LABEL[rank]}</span>
              <span className="podium-medal">
                {rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Leaderboard({ currentUserId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await authFetch('/jobs/leaderboard');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) { setRows(data); setErr(null); }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) {
    return (
      <div className="lb-page">
        <div className="loading-pulse">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </div>
    );
  }
  if (err) return <p className="msg error">Error: {err}</p>;

  if (!rows.length) {
    return (
      <div className="empty">
        <div className="empty-icon">🏆</div>
        <p className="empty-title">No applications yet</p>
        <p className="empty-hint">Be the first to mark a job as applied and claim the top spot.</p>
      </div>
    );
  }

  const hasPodium = rows.length >= 3;
  const tail = hasPodium ? rows.slice(3) : rows;
  const tailStart = hasPodium ? 3 : 0;
  const max  = rows[0].total || 1;
  const myRank = rows.findIndex(r => currentUserId && String(r.userId) === String(currentUserId));

  // Solo / duo: render compact featured cards instead of a stretched grid row.
  if (rows.length < 3) {
    return (
      <div className="lb-page">
        <header className="lb-header">
          <div>
            <h2 className="lb-title">Leaderboard</h2>
            <p className="lb-sub">
              {rows.length} hunter{rows.length !== 1 ? 's' : ''} on the board.{' '}
              {rows.length === 1
                ? 'Invite a friend to make it interesting.'
                : 'Need at least 3 hunters to unlock the podium.'}
            </p>
          </div>
        </header>

        <div className="lb-solo-grid">
          {rows.map((r, i) => {
            const mine = currentUserId && String(r.userId) === String(currentUserId);
            return (
              <div key={r.userId} className={`lb-solo-card${i === 0 ? ' lb-solo-lead' : ''}${mine ? ' me' : ''}`}>
                <div className="lb-solo-rank">
                  {i === 0 ? '🥇' : '🥈'}
                  <span className="lb-solo-rank-n">#{i + 1}</span>
                </div>
                <div className="lb-solo-avatar" style={{ background: AVATAR_BG[i] }}>
                  {r.name[0].toUpperCase()}
                </div>
                <div className="lb-solo-name">
                  {r.name}
                  {mine && <span className="lb-you">you</span>}
                </div>
                <div className="lb-solo-stats">
                  <div className="lb-solo-stat">
                    <span className="lb-solo-num violet">{r.thisWeek}</span>
                    <span className="lb-solo-lbl">This week</span>
                  </div>
                  <div className="lb-solo-stat">
                    <span className="lb-solo-num orange">{r.today}</span>
                    <span className="lb-solo-lbl">Today</span>
                  </div>
                  <div className="lb-solo-stat">
                    <span className="lb-solo-num">{r.total}</span>
                    <span className="lb-solo-lbl">Total</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="lb-page">
      <header className="lb-header">
        <div>
          <h2 className="lb-title">Leaderboard</h2>
          <p className="lb-sub">
            {rows.length} hunters · ranked by total applications
            {myRank >= 0 && <> · you're <span className="lb-myrank">#{myRank + 1}</span></>}
          </p>
        </div>
        <div className="lb-legend">
          <span className="lb-legend-item"><i className="lb-dot lb-dot-week" /> this week</span>
          <span className="lb-legend-item"><i className="lb-dot lb-dot-today" /> today</span>
          <span className="lb-legend-item"><i className="lb-dot lb-dot-total" /> total</span>
        </div>
      </header>

      <Podium rows={rows} currentUserId={currentUserId} />

      {tail.length > 0 && (
        <div className="lb-list">
          {tail.map((r, i) => {
            const rank = i + tailStart;
            const pct  = (r.total / max) * 100;
            const mine = currentUserId && String(r.userId) === String(currentUserId);
            return (
              <div key={r.userId} className={`lb-row${mine ? ' me' : ''}`}>
                <div className="lb-fill" style={{ width: `${pct}%` }} />
                <div className="lb-row-inner">
                  <span className="lb-rank-n">#{rank + 1}</span>
                  <div className="lb-avatar" style={{ background: AVATAR_BG[rank % AVATAR_BG.length] }}>
                    {r.name[0].toUpperCase()}
                  </div>
                  <span className="lb-name">
                    {r.name}
                    {mine && <span className="lb-you">you</span>}
                  </span>
                  <span className="lb-week" title="This week">{r.thisWeek}</span>
                  <span className="lb-today" title="Today">{r.today}</span>
                  <span className="lb-total" title="Total">{r.total}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

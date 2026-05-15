import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';

const LEVEL_COLOR = { INFO: '#4ade80', WARN: '#facc15', ERROR: '#f87171' };

const fmt = (iso) => iso.replace('T', ' ').slice(0, 23); // "2026-05-15 17:48:27.963"

export default function TerminalPage() {
  const { token } = useAuth();
  const [entries, setEntries]   = useState([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused]     = useState(false);
  const [filter, setFilter]     = useState('');
  const bottomRef  = useRef(null);
  const pausedRef  = useRef(false);
  const entriesRef = useRef([]);

  pausedRef.current  = paused;
  entriesRef.current = entries;

  useEffect(() => {
    if (!token) return;

    // EventSource with token as query param (can't set headers on EventSource)
    const es = new EventSource(`/admin/logs?token=${encodeURIComponent(token)}`);

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      if (pausedRef.current) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'history') {
          setEntries(msg.entries);
        } else if (msg.type === 'entry') {
          setEntries(prev => {
            const next = [...prev, msg.entry];
            return next.length > 2000 ? next.slice(-2000) : next;
          });
        }
      } catch {}
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [token]);

  // Auto-scroll when not paused
  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [entries, paused]);

  const visible = filter.trim()
    ? entries.filter(e => e.msg.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <div className="terminal-page">
      <div className="terminal-toolbar">
        <span className={`terminal-status ${connected ? 'live' : 'offline'}`}>
          <span className="terminal-dot" />
          {connected ? 'LIVE' : 'CONNECTING…'}
        </span>

        <input
          className="terminal-filter"
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />

        <span className="terminal-count">{visible.length} lines</span>

        <button className="terminal-btn" onClick={() => setPaused(p => !p)}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button className="terminal-btn danger" onClick={() => setEntries([])}>
          Clear
        </button>
      </div>

      <div className="terminal-body">
        {visible.length === 0 && (
          <div className="terminal-empty">
            {connected ? 'Waiting for logs…' : 'Connecting to server…'}
          </div>
        )}
        {visible.map((e, i) => (
          <div key={i} className={`terminal-line level-${e.level}`}>
            <span className="terminal-ts">{fmt(e.ts)}</span>
            <span className="terminal-level" style={{ color: LEVEL_COLOR[e.level] ?? '#94a3b8' }}>
              {e.level}
            </span>
            <span className="terminal-msg">{e.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { useApplicationCounts } from '../hooks/useApplicationCounts';
import { FEATURES } from '../config/features';
import { ADMIN_EMAIL } from '../routes/guards';

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const counts = useApplicationCounts({ enabled: FEATURES.applications });

  const linkClass = ({ isActive }) => `sb-link${isActive ? ' active' : ''}`;

  return (
    <>
      {mobileOpen && <div className="sb-scrim" onClick={onCloseMobile} />}
      <aside className={`sb-sidebar${mobileOpen ? ' sb-open' : ''}`}>
        <div className="sb-logo">
          <span className="logo-text">HIRE·RADAR</span>
        </div>

        <nav className="sb-nav">
          <NavLink to="/jobs" className={linkClass} onClick={onCloseMobile}>
            <span>Jobs</span>
          </NavLink>
          <NavLink to="/progress" className={linkClass} onClick={onCloseMobile}>
            <span>Progress</span>
          </NavLink>
          {FEATURES.applications && (
            <NavLink to="/applications" className={linkClass} onClick={onCloseMobile}>
              <span>Applications</span>
              {counts.needsAction > 0 && <span className="sb-badge">{counts.needsAction}</span>}
            </NavLink>
          )}
          <NavLink to="/companies" className={linkClass} onClick={onCloseMobile}>
            <span>Companies</span>
          </NavLink>
          <NavLink to="/leaderboard" className={linkClass} onClick={onCloseMobile}>
            <span>Leaderboard</span>
          </NavLink>

          <div className="sb-divider" />

          {FEATURES.candidateProfile && (
            <NavLink to="/profile/candidate" className={linkClass} onClick={onCloseMobile}>
              <span>Candidate Profile</span>
            </NavLink>
          )}
          <NavLink to="/resumes" className={linkClass} onClick={onCloseMobile}>
            <span>Resumes</span>
          </NavLink>
          <NavLink to="/profile" className={linkClass} onClick={onCloseMobile}>
            <span>Preferences</span>
          </NavLink>

          <div className="sb-divider" />

          <NavLink to="/pricing" className={linkClass} onClick={onCloseMobile}>
            <span>Pricing</span>
          </NavLink>
          {isAdmin && (
            <NavLink to="/terminal" className={linkClass} onClick={onCloseMobile}>
              <span>Terminal</span>
            </NavLink>
          )}
        </nav>

        <div className="sb-footer">
          <button className="sb-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? '☀ Light mode' : '🌙 Dark mode'}
          </button>
          {user && (
            <div className="sb-user">
              <span className="user-avatar">{user.name[0].toUpperCase()}</span>
              <span className="sb-user-name">{user.name}</span>
              <button className="sb-logout" onClick={logout} title="Log out">⏻</button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

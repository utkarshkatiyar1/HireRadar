import { useNavigate } from 'react-router-dom';
import { useTheme } from '../theme';

// Minimal chrome for pre-auth public pages (e.g. /pricing while logged out).
// Replaces the previously duplicated inline header markup that lived in
// App.jsx's logged-out+pricing branch.
export default function PublicHeader() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="header-logo"><span className="logo-text">HIRE·RADAR</span></div>
      <div style={{ flex: 1 }} />
      <div className="header-controls">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >{theme === 'dark' ? '☀' : '🌙'}</button>
        <button className="page-btn" style={{ marginLeft: 8 }} onClick={() => navigate('/login')}>Sign in →</button>
      </div>
    </header>
  );
}

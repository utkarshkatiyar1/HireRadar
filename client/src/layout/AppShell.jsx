import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="sb-shell">
      <div className="sb-mobile-topbar">
        <button className="sb-hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">☰</button>
        <span className="logo-text">HIRE·RADAR</span>
      </div>

      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="sb-content">
        <Outlet />
        <footer className="footer">
          <span className="footer-copy">© {new Date().getFullYear()} Utkarsh Katiyar · HireRadar</span>
          <span className="footer-sep">·</span>
          <span className="footer-note">Personal job aggregator — not affiliated with any listed company</span>
        </footer>
      </div>
    </div>
  );
}

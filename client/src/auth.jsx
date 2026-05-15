import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const TOKEN_KEY = 'hr_token';
const USER_KEY  = 'hr_user';

// In dev, Vite proxy handles relative URLs. In production, prefix with the API base.
const API = import.meta.env.VITE_API_URL ?? '';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  });

  const persist = (t, u) => {
    if (t) { localStorage.setItem(TOKEN_KEY, t); localStorage.setItem(USER_KEY, JSON.stringify(u)); }
    else   { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
    setToken(t); setUser(u);
  };

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    persist(data.token, data.user);
  }, []);

  const signup = useCallback(async (email, name, password) => {
    const res = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');
    persist(data.token, data.user);
  }, []);

  const logout = useCallback(() => persist(null, null), []);

  // Auto-logout on 401 from authFetch.
  useEffect(() => {
    const handler = () => persist(null, null);
    window.addEventListener('hr:auth-expired', handler);
    return () => window.removeEventListener('hr:auth-expired', handler);
  }, []);

  return (
    <AuthCtx.Provider value={{ token, user, login, signup, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

export async function authFetch(url, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${url}`, { ...opts, headers });
  if (res.status === 401) window.dispatchEvent(new Event('hr:auth-expired'));
  return res;
}

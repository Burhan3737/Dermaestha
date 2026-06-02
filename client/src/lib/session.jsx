// @ts-check
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './apiClient.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setSession(await api.get('/auth/me')); }
    catch { setSession(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (creds) => { const u = await api.post('/auth/login', creds); setSession(u); return u; }, []);
  const signup = useCallback(async (data) => { const u = await api.post('/auth/signup', data); setSession(u); return u; }, []);
  const logout = useCallback(async () => { await api.post('/auth/logout'); setSession(null); }, []);

  return (
    <SessionContext.Provider value={{ session, loading, refresh, login, signup, logout, setSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

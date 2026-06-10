// @ts-check
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/apiClient/apiClient.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSession(await api.get('/auth/me'));
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cross-cutting session STATE only (D15). One-shot auth actions live in modules/auth/useAuth.js.
  return (
    <SessionContext.Provider value={{ session, loading, refresh, setSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

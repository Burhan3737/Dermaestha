// @ts-check
import { useCallback } from 'react';
import { api } from '../../lib/apiClient/apiClient.js';
import { useSession } from '../../context/session/session.jsx';

/**
 * One-shot auth actions (D15). State lives in context/session; these call the API and update it
 * via useSession().setSession. Behavior is identical to the prior inline/context implementations.
 */
export function useAuth() {
  const { setSession } = useSession();

  const login = useCallback(
    async (creds) => {
      const u = await api.post('/auth/login', creds);
      setSession(u);
      return u;
    },
    [setSession],
  );

  const signup = useCallback(
    async (data) => {
      const u = await api.post('/auth/signup', data);
      setSession(u);
      return u;
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setSession(null);
  }, [setSession]);

  const requestPasswordReset = useCallback(
    (email) => api.post('/auth/forgot-password', { email }),
    [],
  );

  const resetPassword = useCallback((data) => api.post('/auth/reset-password', data), []);

  const changePassword = useCallback(
    async (form) => {
      const u = await api.post('/auth/change-password', form);
      setSession(u);
      return u;
    },
    [setSession],
  );

  return { login, signup, logout, requestPasswordReset, resetPassword, changePassword };
}

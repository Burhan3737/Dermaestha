// @ts-check
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from '../lib/queryClient/queryClient.js';
import { SessionProvider } from './session/session.jsx';

/** Composes the app-wide cross-cutting providers so main.jsx stays thin (D16). */
export function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>{children}</SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

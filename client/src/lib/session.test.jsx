import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from './session.jsx';
import { api } from './apiClient.js';

vi.mock('./apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

function Probe() {
  const { session, loading } = useSession();
  return <div>{loading ? 'loading' : session ? `user:${session.role}` : 'anon'}</div>;
}

beforeEach(() => vi.clearAllMocks());

describe('SessionProvider', () => {
  it('hydrates from /auth/me on mount', async () => {
    api.get.mockResolvedValue({
      id: 'u1',
      role: 'patient',
      fullName: 'P',
      mustChangePassword: false,
    });
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('user:patient')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });
  it('shows anon when /auth/me 401s', async () => {
    api.get.mockRejectedValue(new Error('401'));
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('anon')).toBeTruthy());
  });
});

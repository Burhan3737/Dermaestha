import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profile } from './Profile.jsx';

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../auth/useAuth.js', () => ({ useAuth: () => ({ logout: logoutMock }) }));
vi.mock('../../../../context/session/session.jsx', () => ({
  useSession: () => ({ session: { id: 'u1', role: 'patient', fullName: 'Pat Patient' } }),
}));

describe('/profile account view (ISSUE-11)', () => {
  it('shows basic account details (logout + basic details — doc 06 §2)', () => {
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>,
    );
    // basic details
    expect(screen.getByText('Pat Patient')).toBeTruthy();
    // not the old placeholder
    expect(screen.queryByText(/coming in a later slice/i)).toBeNull();
    // working logout
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(logoutMock).toHaveBeenCalled();
  });
});

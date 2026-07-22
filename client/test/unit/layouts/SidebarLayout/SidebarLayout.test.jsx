import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { post: vi.fn().mockResolvedValue({}) },
}));
vi.mock('#src/context/session/session.jsx', () => ({
  useSession: vi.fn(),
}));
import { api } from '#src/lib/apiClient/apiClient.js';
import { useSession } from '#src/context/session/session.jsx';
import { SidebarLayout } from '#src/layouts/SidebarLayout/SidebarLayout.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  useSession.mockReturnValue({ session: null }); // default; withRole() overrides per case
});

describe('SidebarLayout', () => {
  it('renders a Log out control that posts to /auth/logout (ISSUE-2)', () => {
    render(
      <MemoryRouter>
        <SidebarLayout>x</SidebarLayout>
      </MemoryRouter>,
    );
    // doctor/admin chrome must offer a logout affordance (audit ISSUE-2 — none existed).
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
  });

  const withRole = (role, links) => {
    useSession.mockReturnValue({ session: role ? { role } : null });
    return render(
      <MemoryRouter>
        <SidebarLayout links={links}>x</SidebarLayout>
      </MemoryRouter>,
    );
  };

  const LINKS = [
    { to: '/admin/doctors', label: 'Doctors' },
    { to: '/admin/patches', label: 'Patches', roles: ['superadmin'] },
  ];

  it('hides a roles-gated link from a non-matching role', () => {
    withRole('admin', LINKS);
    expect(screen.getByRole('link', { name: 'Doctors' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Patches' })).toBeNull();
  });

  it('shows a roles-gated link to the matching role', () => {
    withRole('superadmin', LINKS);
    expect(screen.getByRole('link', { name: 'Patches' })).toBeTruthy();
  });

  it('shows ungated links even with no session', () => {
    withRole(null, LINKS);
    expect(screen.getByRole('link', { name: 'Doctors' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Patches' })).toBeNull();
  });
});

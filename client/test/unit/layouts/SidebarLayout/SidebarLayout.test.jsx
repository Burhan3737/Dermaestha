import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { post: vi.fn().mockResolvedValue({}) },
}));
import { api } from '#src/lib/apiClient/apiClient.js';
import { SidebarLayout } from '#src/layouts/SidebarLayout/SidebarLayout.jsx';

beforeEach(() => vi.clearAllMocks());

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
});

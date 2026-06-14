import { describe, it, expect, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PatientLayout } from './PatientLayout.jsx';

vi.mock('../../context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'patient' } }),
}));

describe('PatientLayout', () => {
  it('exposes a Profile link in the desktop top nav when signed in (ISSUE-2)', () => {
    const { container } = render(
      <MemoryRouter>
        <PatientLayout>x</PatientLayout>
      </MemoryRouter>,
    );
    // doc 06 §2: logged-in desktop nav = Browse / Appointments / Profile (top nav on desktop).
    const topnav = container.querySelector('.topnav');
    expect(within(topnav).getByRole('link', { name: 'Profile' })).toBeTruthy();
  });
});

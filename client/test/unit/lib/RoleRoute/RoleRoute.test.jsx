import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleRoute } from '#src/lib/RoleRoute/RoleRoute.jsx';

const renderGuard = (props) =>
  render(
    <MemoryRouter>
      <RoleRoute {...props}>OK</RoleRoute>
    </MemoryRouter>,
  );

describe('RoleRoute', () => {
  it('renders children when role matches', () => {
    const { queryByText } = renderGuard({ session: { role: 'admin' }, role: 'admin' });
    expect(queryByText('OK')).not.toBeNull();
  });
  it('redirects away (no children) when role mismatches', () => {
    const { queryByText } = renderGuard({ session: { role: 'patient' }, role: 'admin' });
    expect(queryByText('OK')).toBeNull();
  });
  it('renders children when session.role is in a role array', () => {
    const { queryByText } = renderGuard({
      session: { role: 'superadmin' },
      role: ['admin', 'superadmin'],
    });
    expect(queryByText('OK')).not.toBeNull();
  });
  it('redirects when session.role is not in the role array', () => {
    const { queryByText } = renderGuard({
      session: { role: 'patient' },
      role: ['admin', 'superadmin'],
    });
    expect(queryByText('OK')).toBeNull();
  });
  it('still supports a string role (backwards compatible)', () => {
    const { queryByText } = renderGuard({ session: { role: 'doctor' }, role: 'doctor' });
    expect(queryByText('OK')).not.toBeNull();
  });
});

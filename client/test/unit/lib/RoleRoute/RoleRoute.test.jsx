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
});

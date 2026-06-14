import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SignUp } from '#src/modules/auth/views/SignUp/SignUp.jsx';
import { SessionProvider } from '#src/context/session/session.jsx';

function setup() {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <SignUp />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('P-04 Sign up', () => {
  it('disables submit until the ToS consent box is checked', () => {
    setup();
    const submit = screen.getByRole('button', { name: /create account/i });
    expect(submit.disabled).toBe(true);
  });
  it('links to the legal pages from the consent label', () => {
    setup();
    expect(screen.getByRole('link', { name: /terms/i }).getAttribute('href')).toBe('/legal/terms');
    expect(screen.getByRole('link', { name: /privacy/i }).getAttribute('href')).toBe(
      '/legal/privacy',
    );
  });
});

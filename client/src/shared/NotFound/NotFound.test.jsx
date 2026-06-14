import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFound } from './NotFound.jsx';

describe('NotFound (404)', () => {
  it('renders a not-found message and a Back to Browse CTA (ISSUE-8)', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByText(/page not found/i)).toBeTruthy();
    // Not the old "Coming in a later slice." placeholder.
    expect(screen.queryByText(/coming in a later slice/i)).toBeNull();
    expect(screen.getByRole('link', { name: /browse/i }).getAttribute('href')).toBe('/browse');
  });
});

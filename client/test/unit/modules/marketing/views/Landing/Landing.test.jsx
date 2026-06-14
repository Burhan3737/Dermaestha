import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Landing } from '#src/modules/marketing/views/Landing/Landing.jsx';
import { track } from '#src/lib/analytics/track.js';
import { buildRoutes } from '#src/routes.jsx';

vi.mock('#src/lib/analytics/track.js', () => ({ track: vi.fn() }));
vi.mock('#src/modules/doctor/views/DoctorListing/DoctorListing.jsx', () => ({
  DoctorListing: () => <div>browse-listing</div>,
}));

beforeEach(() => vi.clearAllMocks());

function setup() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe('P-01 Landing', () => {
  it('renders the hero headline', () => {
    setup();
    expect(screen.getByText(/see a real skin doctor without leaving home/i)).toBeTruthy();
  });

  it('primary hero CTA links to /browse and signup CTA links to /signup', () => {
    setup();
    const browse = screen.getAllByRole('link', { name: /find your dermatologist/i })[0];
    expect(browse.getAttribute('href')).toBe('/browse');
    const signup = screen.getByRole('link', { name: /create your account/i });
    expect(signup.getAttribute('href')).toBe('/signup');
  });

  it('footer links to the legal pages', () => {
    setup();
    expect(screen.getByRole('link', { name: /terms of service/i }).getAttribute('href')).toBe(
      '/legal/terms',
    );
    expect(screen.getByRole('link', { name: /privacy policy/i }).getAttribute('href')).toBe(
      '/legal/privacy',
    );
  });

  it('static featured/hero cards do not dead-end to /doctors/sample (ISSUE-5)', () => {
    const { container } = setup();
    // doc 06 §3: the featured grid is static placeholder data for v1 — cards must not link to a
    // non-existent profile ("/doctors/sample" rendered "Doctor not found.").
    expect(container.querySelectorAll('a[href="/doctors/sample"]').length).toBe(0);
  });

  it('emits landing_view once on mount with referrer meta', () => {
    setup();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('landing_view', { referrer: document.referrer || null });
  });
});

describe('marketing routing', () => {
  function renderAt(entry, session) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          {buildRoutes(session).map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Routes>
      </MemoryRouter>,
    );
  }
  it('serves the landing at / for a logged-out visitor', () => {
    renderAt('/', null);
    expect(screen.getByText(/see a real skin doctor/i)).toBeTruthy();
  });
  it('redirects a logged-in patient from / to /browse', () => {
    renderAt('/', { role: 'patient' });
    expect(screen.getByText('browse-listing')).toBeTruthy();
  });
});

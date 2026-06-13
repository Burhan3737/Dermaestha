import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { legalRoutes } from './legal.routes.jsx';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {legalRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
      </Routes>
    </MemoryRouter>,
  );
}

describe('F16 Legal pages', () => {
  it('renders the Terms draft with title, banner, and a medical-disclaimer section', () => {
    renderAt('/legal/terms');
    expect(screen.getByRole('heading', { name: /terms of service/i })).toBeTruthy();
    expect(screen.getByText(/draft — pending legal review/i)).toBeTruthy();
    expect(screen.getByText(/medical disclaimer/i)).toBeTruthy();
  });
  it('renders the Privacy draft with title, banner, and a data-handling section', () => {
    renderAt('/legal/privacy');
    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeTruthy();
    expect(screen.getByText(/draft — pending legal review/i)).toBeTruthy();
    expect(screen.getByText(/data handling/i)).toBeTruthy();
  });
  it('exposes both legal routes publicly (no guard wrapper)', () => {
    const paths = legalRoutes.map((r) => r.path);
    expect(paths).toEqual(expect.arrayContaining(['/legal/terms', '/legal/privacy']));
  });
});

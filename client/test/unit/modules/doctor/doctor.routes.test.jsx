import { describe, it, expect } from 'vitest';
import { doctorRoutes } from '#src/modules/doctor/doctor.routes.jsx';
import { DOCTOR_LINKS } from '#src/layouts/SidebarLayout/SidebarLayout.jsx';

describe('doctor routes', () => {
  it('serves the doctor listing at /browse, not /', () => {
    const paths = doctorRoutes(null).map((r) => r.path);
    expect(paths).toContain('/browse');
    expect(paths).not.toContain('/');
    expect(paths).toContain('/doctors/:id');
  });

  it('registers a real route for every doctor sidebar link (ISSUE-4)', () => {
    const paths = doctorRoutes(null).map((r) => r.path);
    for (const link of DOCTOR_LINKS) {
      expect(paths).toContain(link.to);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { doctorRoutes } from './doctor.routes.jsx';

describe('doctor routes', () => {
  it('serves the doctor listing at /browse, not /', () => {
    const paths = doctorRoutes(null).map((r) => r.path);
    expect(paths).toContain('/browse');
    expect(paths).not.toContain('/');
    expect(paths).toContain('/doctors/:id');
  });
});

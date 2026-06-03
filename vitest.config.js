import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Vitest (via Vite) does not populate process.env from .env for non-VITE_ vars.
  // Copy .env into process.env so server modules that read env at import time and the
  // DB integration tests (which need DATABASE_URL) work under the test runner.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    test: {
      environment: 'node',
      include: ['server/src/**/*.test.js', 'shared/**/*.test.js'],
      hookTimeout: 30000,
    },
  };
});

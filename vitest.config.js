import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Vitest (via Vite) does not populate process.env from .env for non-VITE_ vars.
  // Copy .env into process.env so server modules that read env at import time and the
  // DB integration tests (which need DATABASE_URL) work under the test runner.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    resolve: {
      alias: {
        '#src': fileURLToPath(new URL('./server/src', import.meta.url)),
        '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },
    test: {
      environment: 'node',
      include: ['server/test/**/*.test.js', 'shared/test/**/*.test.js'],
      hookTimeout: 30000,
    },
  };
});

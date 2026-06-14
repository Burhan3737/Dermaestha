// @ts-check
import { defineConfig, devices } from '@playwright/test';

// Load .env into THIS process so global-setup (Prisma) has DATABASE_URL etc.
// The override keys in webServer.env below are NOT present in .env, so --env-file in the
// webServer command won't clobber them.
process.loadEnvFile('.env');

const BASE_URL = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: false, // shared seeded DB rows — run serially for determinism
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:client && node --env-file=.env server/src/index.js',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NODE_ENV: 'development',
      PAYMENT_PROVIDER: 'mock',
      VIDEO_PROVIDER: 'mock',
      EMAIL_PROVIDER: 'console',
      PORT: '3000',
      APP_BASE_URL: BASE_URL,
    },
  },
});

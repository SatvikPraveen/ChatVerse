import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end configuration. Playwright starts the real API (against a MongoDB given by
 * E2E_MONGODB_URI, with the in-process Redis emulator) and the Vite dev server, then drives
 * Chromium against them. Nothing is mocked: every assertion goes through the wire protocol.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const API_PORT = 4100;
const WEB_PORT = 4173;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

const apiEnv = {
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: String(API_PORT),
  NODE_ID: 'e2e-api',
  MONGODB_URI: process.env.E2E_MONGODB_URI ?? 'mongodb://localhost:27017/chatverse_e2e',
  // Explicitly empty: the API treats '' as unset and uses its in-process Redis emulator.
  REDIS_URL: '',
  JWT_ACCESS_SECRET: 'e2e-access-secret-e2e-access-secret-e2e-access-secret',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-e2e-refresh-secret-e2e-refresh-secret',
  CORS_ORIGINS: WEB_URL,
  AUTH_RATE_LIMIT_MAX: '10000',
  RATE_LIMIT_MAX: '100000',
  LOG_LEVEL: 'warn',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @chatverse/api exec tsx src/index.ts',
      cwd: repoRoot,
      url: `${API_URL}/health/ready`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: apiEnv,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `pnpm --filter @chatverse/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: repoRoot,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_URL: API_URL },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});

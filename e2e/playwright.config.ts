import { defineConfig, devices } from '@playwright/test';
import { STATE } from './tests/state.js';

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const reuse = !process.env.CI;

// Starts the *built* API and web app (run `pnpm build` first), unless E2E_WEB_URL
// points at an already-running deployment.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    // Signs in as the seeded demo account once; the other tests reuse that session.
    { name: 'setup', testMatch: /(^|[\\/])auth\.setup\.ts$/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STATE },
      dependencies: ['setup'],
      testIgnore: /(^|[\\/])auth\.spec\.ts$/,
    },
    // Sign-in, sign-up and invites start signed out.
    { name: 'auth', use: { ...devices['Desktop Chrome'] }, testMatch: /(^|[\\/])auth\.spec\.ts$/ },
  ],
  webServer: process.env.E2E_WEB_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter @heroarc/api start',
          url: 'http://localhost:4000/health',
          reuseExistingServer: reuse,
          timeout: 60_000,
        },
        {
          command: 'pnpm --filter @heroarc/web start',
          url: 'http://localhost:3000/healthz',
          reuseExistingServer: reuse,
          timeout: 60_000,
          env: { PORT: '3000' },
        },
      ],
});

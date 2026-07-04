import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for goals-optimizer.
 * Tests run against a local dev server (Next.js) on port 3013.
 * All tests use the Demo-Kader flow — no external API calls needed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,       // sequential: dev server is shared
  retries: 0,                 // no retries locally
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://127.0.0.1:3013',
    trace: 'on-first-retry',
    // Capture console errors per test via page events (done in each spec)
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'NEXT_PUBLIC_BASE_PATH="" npm run dev -- --port 3013',
    url: 'http://127.0.0.1:3013',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

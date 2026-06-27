import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E smoke config — minimal scaffold for the OSS launch test gate.
 *
 * NOT WIRED INTO `npm run test` (that is the pure Vitest unit gate). E2E is a
 * separate, opt-in suite that needs a running app + a browser engine.
 *
 * One-time setup (heavy deps are intentionally NOT in package.json yet):
 *   npm i -D @playwright/test
 *   npx playwright install chromium
 *
 * Run against a locally running dev server (custom node server.js, port 9002):
 *   npm run dev -- 9002          # in one terminal
 *   npm run test:e2e             # in another (or: npx playwright test)
 *
 * Point at any base URL (CI / staging) with PLAYWRIGHT_BASE_URL:
 *   PLAYWRIGHT_BASE_URL=https://staging.example.com npm run test:e2e
 *
 * `webServer` is left commented-out on purpose: this repo's server is a custom
 * `node server.js` (Socket.io), not `next dev`, and the OSS carve may relocate
 * it — wiring auto-start here would couple the smoke gate to that. Enable it
 * once the OSS run command is final.
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:9002';

export default defineConfig({
  testDir: './tests/e2e',
  // Fail the suite if a test was accidentally left as `.only`.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Uncomment once the OSS run command is finalized to auto-start the app:
  // webServer: {
  //   command: 'npm run start',
  //   url: baseURL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});

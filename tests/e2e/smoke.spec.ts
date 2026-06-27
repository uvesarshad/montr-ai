import { test, expect } from '@playwright/test';

/**
 * Smoke suite — the bare-minimum "is the app alive?" checks for the OSS gate.
 *
 * Requires a running app (see playwright.config.ts header for setup). These are
 * deliberately shallow: a deeper E2E flow (sign in, create a workflow, etc.)
 * belongs in dedicated specs once auth fixtures exist.
 */

test.describe('smoke', () => {
  test('GET /api/health returns 200 and a healthy/degraded status', async ({ request }) => {
    const res = await request.get('/api/health');
    // The endpoint returns 200 for healthy|degraded, 503 for unhealthy. A live
    // app with Mongo reachable should be 200; assert that and on the payload.
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(body.services?.mongodb?.status).toBe('up');
  });

  test('/login loads and renders the sign-in page', async ({ page }) => {
    const res = await page.goto('/login');
    expect(res?.status()).toBe(200);
    // Page should render with a non-empty document title and a visible body.
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('body')).toBeVisible();
  });
});

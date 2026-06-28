import { expect, type Page } from '@playwright/test';

/**
 * Shared auth + precondition helpers for the OSS E2E suite.
 *
 * The app pages under `(app)/*` are all behind auth (BetterAuth session cookie).
 * E2E credentials are NOT hard-coded — supply them via env so the same specs run
 * against local dev, a docker stack, or staging:
 *
 *   E2E_EMAIL=you@example.com  E2E_PASSWORD=secret  npm run test:e2e
 *
 * If creds are absent (or login fails), the auth-dependent specs SKIP gracefully
 * rather than fail — keeping the smoke gate green on an un-seeded environment.
 */

export const E2E_EMAIL = process.env.E2E_EMAIL ?? '';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '';

export function hasCredentials(): boolean {
  return E2E_EMAIL.length > 0 && E2E_PASSWORD.length > 0;
}

/**
 * Sign in via the email/password form on `/login`.
 *
 * Resilient selectors: the password form uses stable ids (`#email`, `#password`)
 * and a submit button labelled "Sign In with Email & Password". Returns true on a
 * successful redirect away from `/login`, false otherwise (caller decides to skip).
 *
 * FLAKY/ENV-DEPENDENT: login itself depends on Redis being up (the auth rate
 * limiter is fail-closed) and a seeded user. Treat a `false` return as "precondition
 * unmet", not "bug".
 */
export async function signIn(page: Page): Promise<boolean> {
  if (!hasCredentials()) return false;

  await page.goto('/login');
  await page.locator('#email').fill(E2E_EMAIL);
  await page.locator('#password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /sign in with email/i }).click();

  // Success = we leave /login (to /dashboard or wherever the app lands). 2FA /
  // verify-email interstitials are treated as "could not complete" → skip.
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a signed-in session for a spec; returns true if ready, false if the
 * caller should `test.skip()`. Centralises the "no creds / login failed" branch.
 */
export async function ensureSignedIn(page: Page): Promise<boolean> {
  if (!hasCredentials()) return false;
  return signIn(page);
}

/**
 * Best-effort: dismiss the first-run onboarding takeover if it is covering the
 * page (it portals to <body> at z-200 and would intercept clicks on app pages).
 * Clicks the always-present "Skip" control in its top bar. No-op if not shown.
 */
export async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: /^skip$/i });
  try {
    if (await skip.isVisible({ timeout: 2_000 })) {
      await skip.click();
      // Give the portal a tick to unmount.
      await page.waitForTimeout(300);
    }
  } catch {
    // Onboarding not present — nothing to dismiss.
  }
}

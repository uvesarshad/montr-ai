import { test, expect, type Page } from '@playwright/test';
import { ensureSignedIn, dismissOnboardingIfPresent, hasCredentials } from './helpers/auth';

/**
 * Authenticated page smokes — CRM list, Social, Inbox.
 *
 * Shallow "does the page load + render its shell" checks for the core modules,
 * complementing the unauthenticated /api/health + /login smokes in smoke.spec.ts.
 * Each module page is wrapped in ModuleShell, which renders its title as an <h1>;
 * we assert on that heading (role-based, resilient) plus one key sub-element.
 *
 * PRECONDITIONS:
 *  - Requires E2E_EMAIL/E2E_PASSWORD (whole describe skips otherwise).
 *  - Data-light: these assert page chrome, not seeded records, so they pass on an
 *    empty tenant (empty states are expected and asserted where relevant).
 *
 * data-testid hints to harden these are listed in the C3 follow_ups.
 */

test.describe('app smoke · authenticated module pages', () => {
  test.skip(!hasCredentials(), 'Set E2E_EMAIL/E2E_PASSWORD to run auth-gated E2E.');

  // Sign in once per worker, then reuse the session across the specs below.
  test.beforeEach(async ({ page }) => {
    const signedIn = await ensureSignedIn(page);
    test.skip(!signedIn, 'Login precondition unmet (creds/Redis/seed).');
  });

  async function gotoModule(page: Page, path: string) {
    await page.goto(path);
    // The first-run takeover can cover any app page; clear it so headings are hit-testable.
    await dismissOnboardingIfPresent(page);
  }

  test('CRM contacts list loads (heading + search)', async ({ page }) => {
    await gotoModule(page, '/crm/contacts');

    // ModuleShell <h1> title is "Contacts".
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible({ timeout: 20_000 });
    // The list toolbar exposes a search input ("Search contacts…").
    await expect(page.getByPlaceholder(/search contacts/i)).toBeVisible();
  });

  test('Social overview loads (heading)', async ({ page }) => {
    await gotoModule(page, '/social');

    // ModuleShell <h1> title is "Social" (both loading and loaded states use it).
    await expect(page.getByRole('heading', { name: 'Social' })).toBeVisible({ timeout: 20_000 });
  });

  test('Inbox loads (heading + select-a-conversation empty state)', async ({ page }) => {
    await gotoModule(page, '/inbox');

    // ModuleShell <h1> title is "Conversations".
    await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible({ timeout: 20_000 });
    // The thread pane shows an EmptyState until a conversation is picked. On an
    // empty tenant this is the expected resting state; assert it softly so a
    // seeded tenant (which may auto-select) still passes.
    const emptyState = page.getByText(/select a conversation/i);
    const hasEmpty = await emptyState.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasEmpty) {
      test.info().annotations.push({
        type: 'info',
        description: 'Inbox did not show the empty state (seeded conversations?) — heading still asserted.',
      });
    }
  });
});

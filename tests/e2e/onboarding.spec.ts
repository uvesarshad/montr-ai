import { test, expect } from '@playwright/test';
import { ensureSignedIn, hasCredentials } from './helpers/auth';

/**
 * First-run / onboarding happy path.
 *
 * Flow under test (src/components/marketing/onboarding/onboarding-flow.tsx, mounted
 * by OnboardingModalWrapper on /dashboard for a brand whose marketing plan is not
 * yet completed):
 *
 *   load app → /dashboard → onboarding takeover appears
 *     step 0  "What's your website?"        (AI site scan on Continue — FLAKY)
 *     step 1  "What do you need help with?"  (pure UI multi-select)
 *     step 2  "Connect your platforms"       (pure UI tile select, optional)
 *     step 3  "What's your main goal?"        (pure UI single-select)
 *     step 4  "Building your plan"            (AI roadmap gen → "Enter Montr")
 *   → finish hands off to the agent (openAgentLauncher → 'open-agent').
 *
 * PRECONDITIONS / FLAKINESS (clearly marked):
 *  - Requires E2E_EMAIL/E2E_PASSWORD + a seeded brand WITHOUT a completed plan.
 *    On an already-onboarded account the takeover never opens → the test SKIPS.
 *  - Steps 0 and 4 call live AI flows (analyzeOnboardingWebsite /
 *    processOnboardingMessage). They are slow and provider-dependent; assertions
 *    around them are generous and best-effort, NOT strict.
 *
 * data-testid hints that would make this deterministic are listed in the C3
 * follow_ups (e.g. onboarding-root, onboarding-continue, onboarding-step-{n}).
 */

test.describe('onboarding · first run', () => {
  test.skip(!hasCredentials(), 'Set E2E_EMAIL/E2E_PASSWORD to run auth-gated E2E.');

  // The AI steps make this materially slower than a smoke test.
  test.setTimeout(120_000);

  test('walks the onboarding takeover and reaches the agent hand-off', async ({ page }) => {
    const signedIn = await ensureSignedIn(page);
    test.skip(!signedIn, 'Login precondition unmet (creds/Redis/seed).');

    await page.goto('/dashboard');

    // The takeover portals to <body>; step 0 renders this heading. If it never
    // appears within a grace window, this account is already onboarded → skip.
    const websiteHeading = page.getByRole('heading', { name: /what's your website\?/i });
    const opened = await websiteHeading.isVisible({ timeout: 8_000 }).catch(() => false);
    test.skip(!opened, 'Onboarding takeover did not open (already onboarded?).');

    // Sanity: the takeover chrome (brand + step counter "1 / 5") is present.
    await expect(page.getByText('Montr', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/1\s*\/\s*5/)).toBeVisible();

    /* step 0 — website. The "https://" pill precedes a free input (placeholder
       "acme.com"). Entering a value enables Continue, which kicks the AI scan. */
    await page.getByPlaceholder('acme.com').fill('example.com');
    const continueBtn = page.getByRole('button', { name: /continue|analyzing/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    /* step 1 — needs (multi-select). Pick at least one card to enable Continue. */
    await expect(page.getByRole('heading', { name: /what do you need help with\?/i })).toBeVisible({
      timeout: 30_000, // covers the website-scan round trip from step 0
    });
    await page.getByRole('button', { name: /email marketing/i }).click();
    await page.getByRole('button', { name: /^continue$/i }).click();

    /* step 2 — platforms (selection-only; Continue is always enabled here). */
    await expect(page.getByRole('heading', { name: /connect your platforms/i })).toBeVisible();
    await page.getByRole('button', { name: /^continue$/i }).click();

    /* step 3 — goal (single-select). */
    await expect(page.getByRole('heading', { name: /what's your main goal\?/i })).toBeVisible();
    await page.getByRole('button', { name: /increase my sales/i }).click();
    await page.getByRole('button', { name: /^continue$/i }).click();

    /* step 4 — plan build (AI). Heading flips "Building your plan" →
       "Your plan is ready" once the roadmap flow reports completion. The final
       CTA is "Enter Montr". Both are AI-gated, so treat as best-effort. */
    await expect(
      page.getByRole('heading', { name: /building your plan|your plan is ready/i }),
    ).toBeVisible({ timeout: 30_000 });

    const enterMontr = page.getByRole('button', { name: /enter montr/i });
    const ready = await enterMontr.isEnabled({ timeout: 60_000 }).catch(() => false);

    if (!ready) {
      // AI did not complete the roadmap in time — the deterministic part of the
      // flow (steps 0–3 navigation) has already passed. Don't fail the gate on a
      // slow/unavailable model; record it instead.
      test.info().annotations.push({
        type: 'flaky-precondition',
        description: 'Plan generation (AI) did not reach "ready" — hand-off step skipped.',
      });
      return;
    }

    await enterMontr.click();

    // Hand-off: onComplete closes the takeover and openAgentLauncher fires the
    // 'open-agent' event, sliding in the quick agent panel ("Montr AI Agent").
    await expect(page.getByText(/montr ai agent/i)).toBeVisible({ timeout: 15_000 });
  });
});

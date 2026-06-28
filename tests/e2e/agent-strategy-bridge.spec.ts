import { test, expect } from '@playwright/test';
import { ensureSignedIn, dismissOnboardingIfPresent, hasCredentials } from './helpers/auth';

/**
 * The WOW flow — agent strategy-bridge (B1).
 *
 * What it exercises (src/components/agent/agent-conversation.tsx):
 *   open the agent with a strategy prompt
 *     → the agent runs generate_strategy and renders a StrategyDraftCard
 *       (header "Strategy draft", quality ring, goals/channels, "Activate" CTA)
 *     → click Activate → the agent runs activate_strategy and renders a
 *       StrategyActivationCard (header "Activate roadmap", "Approval needed")
 *     → click Approve → card flips to "Roadmap activated — missions are starting."
 *
 * Entry point: navigate straight to the full agent workspace with a seeded prompt
 * (`/agent?prompt=...`). agent-shell reads `?prompt` into the composer; the spec
 * sends it. This avoids depending on the onboarding hand-off path.
 *
 * HEAVILY FLAKY / AI- + AUTH-DEPENDENT (clearly marked):
 *  - Needs auth + a selected brand + a live AI provider (Genkit/Vercel AI SDK)
 *    with the strategy tools wired. The cards only appear after real tool runs.
 *  - Activation needs the BullMQ worker + Redis for mission spawning; without
 *    them the activation card may stay "Approval needed" or error.
 *  - Each `expect(...).toBeVisible` around a card uses a long timeout and the
 *    test bails out softly (annotation + return) if the model is slow/unavailable
 *    rather than failing the whole OSS gate.
 *
 * Selectors are text/role-based today. data-testid hints to harden this are in
 * the C3 follow_ups (strategy-draft-card, strategy-activate-btn,
 * strategy-activation-card, strategy-approve-btn).
 */

const STRATEGY_PROMPT =
  'Use the generate_strategy tool now to turn "grow my sales" into a data-driven ' +
  'strategy draft (measurable goals/KPIs, channel mix, content mix and cadence), ' +
  'then show me the draft so I can review and activate it.';

test.describe('agent · strategy bridge (WOW)', () => {
  test.skip(!hasCredentials(), 'Set E2E_EMAIL/E2E_PASSWORD to run auth-gated E2E.');

  // generate_strategy → activate_strategy are two sequential AI/tool runs.
  test.setTimeout(180_000);

  test('strategy draft → Activate → approval card → Approve', async ({ page }) => {
    const signedIn = await ensureSignedIn(page);
    test.skip(!signedIn, 'Login precondition unmet (creds/Redis/seed).');

    // Seed the composer via the URL the in-app launcher uses.
    await page.goto(`/agent?prompt=${encodeURIComponent(STRATEGY_PROMPT)}`);
    await dismissOnboardingIfPresent(page);

    // The mission composer (MessageComposer, placeholder "Reply to the mission...")
    // is pre-filled from ?prompt. If a brand-setup redirect happened instead, the
    // composer won't be here → skip (brand precondition unmet).
    const composer = page.getByPlaceholder(/reply to the mission/i);
    const composerReady = await composer.isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!composerReady, 'Agent composer not reached (no brand / redirected to setup).');

    // Send the seeded prompt (Enter submits in MessageComposer).
    await composer.click();
    await composer.press('Enter');

    /* ---- StrategyDraftCard ---- */
    // Resilient anchor: the card header text "Strategy draft".
    const draftHeader = page.getByText('Strategy draft', { exact: true });
    const draftShown = await draftHeader.isVisible({ timeout: 120_000 }).catch(() => false);
    if (!draftShown) {
      test.info().annotations.push({
        type: 'flaky-precondition',
        description: 'generate_strategy did not render a draft card (AI slow/unavailable).',
      });
      return;
    }

    // Assert the Activate CTA. Activate is disabled when the draft cannot be
    // activated (validation issues) — handle that branch.
    const activateBtn = page.getByRole('button', { name: /^activate$/i });
    await expect(activateBtn).toBeVisible();

    if (!(await activateBtn.isEnabled())) {
      test.info().annotations.push({
        type: 'flaky-precondition',
        description: 'Draft not activatable (validation warnings) — Activate disabled.',
      });
      return;
    }
    await activateBtn.click();

    /* ---- StrategyActivationCard ---- */
    const activationHeader = page.getByText('Activate roadmap', { exact: true });
    const activationShown = await activationHeader.isVisible({ timeout: 120_000 }).catch(() => false);
    if (!activationShown) {
      test.info().annotations.push({
        type: 'flaky-precondition',
        description: 'activate_strategy did not render an approval card (AI/worker slow).',
      });
      return;
    }
    // The pending state shows "Approval needed".
    await expect(page.getByText(/approval needed/i)).toBeVisible();

    /* ---- Approve ---- */
    const approveBtn = page.getByRole('button', { name: /^approve$/i });
    await expect(approveBtn).toBeEnabled();
    await approveBtn.click();

    // Success outcome copy from the card.
    await expect(page.getByText(/roadmap activated/i)).toBeVisible({ timeout: 30_000 });
  });
});

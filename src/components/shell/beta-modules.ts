/**
 * Beta-labeled modules — the single curated list of non-launch-critical
 * surfaces that carry a "Beta" badge in the shell (Rail switcher + SubNav head).
 *
 * Launch-critical surfaces are deliberately NOT here: agent, onboarding /
 * first-run, dashboard, CRM, social, inbox, whatsapp, email/campaigns.
 *
 * Edit THIS list to add or remove a beta label — both the Rail and the
 * per-module SubNav read from it, so one change flips the badge everywhere.
 * Entries are route prefixes (matched exactly or as a path segment).
 */
export const BETA_MODULES: string[] = [
  '/ads', // Ads — create-only, always-paused writes; experimental surface
  '/ai-studio', // AI Studio — legacy unified workspace, slated for revamp
  '/ai-bots', // AI Bots — experimental chatbot builder
];

/** True when the pathname belongs to a module flagged beta (see BETA_MODULES). */
export function isBetaModule(pathname: string): boolean {
  return BETA_MODULES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

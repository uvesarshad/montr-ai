import type { ScheduledPostStatus } from '@/lib/db/models/scheduled-post.model';
import type { IOrgSocialApprovalPolicy } from '@/lib/db/models/organization.model';

export type SocialSubmissionIntent = 'schedule' | 'publish';

/** Brand-level `requireApproval` flag for a given intent. */
const BRAND_FLAG_BY_INTENT: Record<SocialSubmissionIntent, string> = {
    schedule: 'schedulePost',
    publish: 'publishPost',
};

export function requiresSocialPostApproval(
  requireApproval: string[],
  intent?: SocialSubmissionIntent,
): boolean {
  if (intent) {
    return requireApproval.includes(BRAND_FLAG_BY_INTENT[intent]);
  }
  return requireApproval.includes('schedulePost') || requireApproval.includes('publishPost');
}

/**
 * Decide whether a social post submission needs admin approval (audit C8).
 *
 * Precedence: the **org policy is the floor** — when enabled it decides who is
 * subject (`appliesTo`) and for which intents (`requireFor`). A brand's
 * `requireApproval` may *additionally* require approval but cannot weaken the
 * org policy. When the org policy is off, the brand override keeps the legacy
 * members-only gate (admins auto-approve).
 */
export function resolveSocialSubmissionDecision({
  orgPolicy,
  brandRequireApproval,
  userRole,
  intent,
}: {
  orgPolicy?: IOrgSocialApprovalPolicy | null;
  brandRequireApproval: string[];
  userRole: 'user' | 'admin' | 'super_admin';
  intent: SocialSubmissionIntent;
}): {
  initialStatus: ScheduledPostStatus;
  requiresApproval: boolean;
  shouldQueueImmediately: boolean;
} {
  const orgEnabled = Boolean(orgPolicy?.enabled);

  // Who is subject to approval. The org policy decides; when it's off, the
  // per-brand override keeps the legacy "non-admins only" gate.
  const appliesTo = orgEnabled ? orgPolicy!.appliesTo ?? 'non_admins' : 'non_admins';
  const isSubject = appliesTo === 'all_members' || userRole === 'user';

  // Org floor: enabled + this intent listed in requireFor (default: both).
  const requireFor = orgPolicy?.requireFor?.length
    ? orgPolicy.requireFor
    : (['schedule', 'publish'] as SocialSubmissionIntent[]);
  const orgRequires = orgEnabled && requireFor.includes(intent);

  // Brand override: may add approval on top of the org policy.
  const brandRequires = requiresSocialPostApproval(brandRequireApproval, intent);

  const requiresApproval = isSubject && (orgRequires || brandRequires);

  return {
    initialStatus: requiresApproval ? 'pending_approval' : 'scheduled',
    requiresApproval,
    shouldQueueImmediately: !requiresApproval,
  };
}

// OSS carve stub (always-allow) of src/lib/social/plan-limits.ts — single-tenant, unmetered.
/**
 * Social plan-limit enforcement — OSS single-tenant stub.
 *
 * The private build resolves an org's effective plan and enforces social caps
 * (volume / storage / AI-generation) against it. The OSS build is single-tenant
 * and unmetered: there is no plan/credit repo to query, so every gate is
 * always-allow, every limit is unlimited (-1), every counter reports 0, and the
 * AI meter is a no-op. Exported symbols + signatures match the (org-stripped)
 * source exactly so the 20 social routes that import this module do not move.
 *
 * `IPlanFeatures` stays imported because it is core schema, not overlay code.
 * The DB-backed resolver (`getOrgPlanFeatures`) and Mongo handle (`getDatabase`)
 * imports are dropped — the stub never queries anything.
 */

import type { IPlanFeatures } from '@/lib/db/models/plan.model';

/** Where "limit reached" errors send the user. */
export const UPGRADE_URL = '/pricing';

/** Numeric social plan-limit keys (-1 = unlimited). */
export type SocialLimitKey =
    | 'maxBrands'
    | 'maxSocialAccountsPerBrand'
    | 'maxScheduledPostsPerMonth'
    | 'maxPostsPerDay'
    | 'maxDraftsPerBrand'
    | 'maxPostTemplates'
    | 'maxMediaStorageMb'
    | 'maxSocialAIGenerationsPerMonth';

/** Boolean social plan-feature keys. */
export type SocialFeatureKey =
    | 'allowApprovalWorkflow'
    | 'allowBulkPublishing'
    | 'allowSocialAI'
    | 'allowAiVideo'
    | 'allowWhiteLabel';

export interface SocialLimitCheck {
    allowed: boolean;
    key: SocialLimitKey;
    current: number;
    limit: number; // -1 = unlimited
}

/**
 * Standard error body for plan-limit rejections (audit C9 §B2):
 * `{ error, code: 'PLAN_LIMIT_REACHED', limit, current, upgradeUrl }`.
 * Routes return it with status 402 so the UI can show the upgrade toast.
 *
 * Kept verbatim: it is a pure shape helper. In the OSS build nothing ever
 * builds a failing `SocialLimitCheck`, so routes never reach it — but the
 * export must exist for call-sites that reference its return type.
 */
export function planLimitErrorBody(check: SocialLimitCheck): {
    error: string;
    code: 'PLAN_LIMIT_REACHED';
    key: SocialLimitKey;
    limit: number;
    current: number;
    upgradeUrl: string;
} {
    return {
        error: `Plan limit reached (${check.current}/${check.limit} for ${check.key}). Upgrade your plan to continue.`,
        code: 'PLAN_LIMIT_REACHED',
        key: check.key,
        limit: check.limit,
        current: check.current,
        upgradeUrl: UPGRADE_URL,
    };
}

/** Standard error body for a disabled boolean plan feature. */
export function planFeatureErrorBody(key: SocialFeatureKey): {
    error: string;
    code: 'PLAN_FEATURE_DISABLED';
    key: SocialFeatureKey;
    upgradeUrl: string;
} {
    return {
        error: `Your plan does not include this feature (${key}). Upgrade your plan to use it.`,
        code: 'PLAN_FEATURE_DISABLED',
        key,
        upgradeUrl: UPGRADE_URL,
    };
}

/**
 * Single-tenant permissive plan features: every boolean on, every numeric cap
 * unlimited (-1), every allow-list empty (this module's convention: empty =
 * allow all). Returned by `getSocialPlanFeatures` so any caller that reads a
 * field sees an unrestricted plan.
 */
const ALWAYS_ALLOW_FEATURES: IPlanFeatures = {
    // General Platform Features
    aiGeneration: true,
    customBranding: true,
    analytics: true,
    prioritySupport: true,
    apiAccess: true,
    teamCollaboration: true,

    // CRM Features
    maxContacts: -1,
    maxDeals: -1,
    maxPipelines: -1,
    maxCustomFields: -1,
    allowEmailSync: true,
    allowCalendarSync: true,
    allowWebhooks: true,

    // WhatsApp Features
    maxWhatsAppAccounts: -1,
    maxWhatsAppConversations: -1,
    maxWhatsAppCampaigns: -1,
    maxWhatsAppTemplates: -1,
    allowWhatsAppAutomation: true,

    // Forms Features
    maxForms: -1,
    maxFormSubmissions: -1,
    allowFormEmbedding: true,
    allowFormNotifications: true,
    allowFormConditionalLogic: true,

    // Docs Features
    maxDocuments: -1,
    allowPublicPublishing: true,
    allowDocCollaboration: true,
    allowDocVersionHistory: true,

    // AI Studio Features
    maxConversations: -1,
    maxMessagesPerConversation: -1,
    allowedAIProviders: [],

    // Canvas/Workflows Features
    maxCanvases: -1,
    maxWorkflowExecutions: -1,
    allowAdvancedNodes: true,
    allowAIWorkflowGeneration: true,

    // Workflow Queue Fairness
    maxConcurrentExecutions: -1,
    maxQueuedExecutions: -1,
    executionPriority: 0,

    // Execution History Retention
    executionRetentionDays: -1,
    failedExecutionRetentionDays: -1,
    maxStoredExecutions: -1,

    // Marketing Email Features
    maxEmailCampaigns: -1,
    maxEmailTemplates: -1,
    allowEmailAutomation: true,

    // Social Media Features (existing)
    maxBrands: -1,
    maxSocialAccountsPerBrand: -1,
    allowedPlatforms: [],

    // Social Media Features (audit C9)
    allowApprovalWorkflow: true,
    maxScheduledPostsPerMonth: -1,
    maxPostsPerDay: -1,
    maxDraftsPerBrand: -1,
    maxPostTemplates: -1,
    maxMediaStorageMb: -1,
    allowBulkPublishing: true,
    allowSocialAI: true,
    maxSocialAIGenerationsPerMonth: -1,
    allowAiVideo: true,
    allowWhiteLabel: true,

    // AI Model Access Control
    allowedModelTiers: [],
    allowedModelTypes: [],

    // BYOK
    allowByok: true,
    byokProviders: [],

    // Credits
    monthlyCredits: -1,

    // Custom Models
    allowCustomOpenRouterModels: true,

    // Voice Features
    allowVoice: true,
    allowVoiceByok: true,
    maxVoiceMinutes: -1,
    allowedVoiceProviders: [],

    // Agent Features
    agent: {
        allowAgent: true,
        allowedModels: [],
        defaultModel: 'claude-haiku-4-5',
        routerModel: 'claude-haiku-4-5',
        maxTokensUsdCents: -1,
        maxToolCalls: -1,
        maxWallClockHours: -1,
        allowedAutonomyModes: ['watch', 'supervised', 'autopilot'],
        defaultAutonomyMode: 'autopilot',
        maxActiveSchedules: -1,
        minWakeIntervalMinutes: 1,
        allowAdsWrite: true,
    },
};

/**
 * Effective plan features. Single-tenant: always the unrestricted plan.
 *
 * NOTE on signatures (whole module): the strip does NOT drop the leading
 * `organizationId` arg at non-repo call-sites — it rewrites the org expression
 * to a single-tenant owner key but keeps the call ARITY. So every stub below
 * mirrors the (unstripped) source parameter list, with the org param renamed
 * `_organizationId` and ignored. Dropping it would arity-mismatch the 20 social
 * routes (e.g. `checkSocialAIAllowance(ownerKey)`, `hasSocialPlanFeature(o,k)`).
 */
export async function getSocialPlanFeatures(_organizationId?: string): Promise<IPlanFeatures> {
    return ALWAYS_ALLOW_FEATURES;
}

/** Boolean plan-feature gate. Single-tenant: always enabled. */
export async function hasSocialPlanFeature(
    _organizationId: string,
    _key: SocialFeatureKey
): Promise<boolean> {
    return true;
}

/**
 * Numeric limit check. Single-tenant: always allowed and unlimited (-1).
 * The expensive `currentCount` thunk is intentionally never invoked.
 */
export async function checkSocialPlanLimit(
    _organizationId: string,
    key: SocialLimitKey,
    _currentCount: () => Promise<number>,
    _options?: { pending?: number; fallbackLimit?: number }
): Promise<SocialLimitCheck> {
    return { allowed: true, key, current: 0, limit: -1 };
}

/** Is `platform` allowed? Single-tenant: every platform is allowed. */
export async function isPlatformAllowed(_organizationId: string, _platform: string): Promise<boolean> {
    return true;
}

// ── Counters — single-tenant unmetered: usage is always 0 (unlimited room). ──

/** Posts scheduled into the calendar month of `ref`. */
export async function countScheduledPostsInMonth(_organizationId: string, _ref: Date = new Date()): Promise<number> {
    return 0;
}

/** Posts scheduled into the calendar day of `ref`. */
export async function countScheduledPostsOnDay(_organizationId: string, _ref: Date = new Date()): Promise<number> {
    return 0;
}

/** Drafts per brand. */
export async function countDraftsForBrand(_brandId: string): Promise<number> {
    return 0;
}

/** Post templates across all brands. */
export async function countTemplatesForOrg(_organizationId?: string): Promise<number> {
    return 0;
}

/** Connected (active) social accounts on one brand. */
export async function countAccountsForBrand(_brandId: string): Promise<number> {
    return 0;
}

/** Brands. */
export async function countBrandsForOrg(_organizationId?: string): Promise<number> {
    return 0;
}

/** Media-library storage used, in MB. */
export async function getMediaStorageUsedMb(_organizationId?: string): Promise<number> {
    return 0;
}

// ── Social AI generation metering — no-op in the unmetered OSS build. ─────────

/** Social AI generations used this calendar month. */
export async function countSocialAIGenerationsThisMonth(_organizationId?: string): Promise<number> {
    return 0;
}

/** Record one social AI generation. No-op: nothing is metered. */
export async function meterSocialAIGeneration(_organizationId?: string): Promise<void> {
    // no-op
}

/**
 * Combined AI-endpoint gate. Single-tenant: always allowed, so returns null.
 */
export async function checkSocialAIAllowance(_organizationId?: string): Promise<
    | null
    | ReturnType<typeof planFeatureErrorBody>
    | ReturnType<typeof planLimitErrorBody>
> {
    return null;
}

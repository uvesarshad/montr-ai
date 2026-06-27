// OSS carve stub (always-allow) of src/lib/plan-enforcement.ts — single-tenant, unmetered.
//
// In the open-source single-tenant build there is no plan/credit/quota backend:
// every entitlement is granted, every cap is unlimited (-1), and every check is a
// no-op that resolves to "allowed". The exported surface is preserved so core
// call-sites (canvas execute route, workflow queue, fairness, CRM/forms/docs/social
// routes, agent/voice gates) resolve unchanged. No DB lookups, no organizationId.

import type { IPlanFeatures } from '@/lib/db/models/plan.model';

/**
 * Plan Enforcement Utility (OSS stub)
 *
 * Centralized functions for checking plan limits. In OSS single-tenant mode these
 * always allow — there is no metering backend to consult.
 */

interface LimitCheckResult {
    allowed: boolean;
    current: number;
    limit: number;
    message?: string;
}

/**
 * Default features for the free plan. Kept for shape/compat with any importer; the
 * resolvers below return the UNLIMITED variant instead.
 */
export const DEFAULT_FREE_PLAN_FEATURES: IPlanFeatures = {
    aiGeneration: true,
    customBranding: false,
    analytics: false,
    prioritySupport: false,
    apiAccess: false,
    teamCollaboration: false,
    maxContacts: 100,
    maxDeals: 20,
    maxPipelines: 1,
    maxCustomFields: 5,
    allowEmailSync: false,
    allowCalendarSync: false,
    allowWebhooks: false,
    maxWhatsAppAccounts: 1,
    maxWhatsAppConversations: 50,
    maxWhatsAppCampaigns: 5,
    maxWhatsAppTemplates: 10,
    allowWhatsAppAutomation: false,
    maxForms: 5,
    maxFormSubmissions: 100,
    allowFormEmbedding: true,
    allowFormNotifications: true,
    allowFormConditionalLogic: false,
    maxDocuments: 10,
    allowPublicPublishing: true,
    allowDocCollaboration: false,
    allowDocVersionHistory: false,
    maxConversations: 10,
    maxMessagesPerConversation: 50,
    allowedAIProviders: ['openai', 'google'],
    maxCanvases: 5,
    maxWorkflowExecutions: 100,
    allowAdvancedNodes: false,
    allowAIWorkflowGeneration: false,
    maxConcurrentExecutions: 2,
    maxQueuedExecutions: 200,
    executionPriority: 10,
    executionRetentionDays: 30,
    failedExecutionRetentionDays: 90,
    maxStoredExecutions: 5000,
    maxEmailCampaigns: 5,
    maxEmailTemplates: 10,
    allowEmailAutomation: false,
    maxBrands: 1,
    maxSocialAccountsPerBrand: 3,
    allowedPlatforms: ['x', 'linkedin'],
    allowApprovalWorkflow: false,
    maxScheduledPostsPerMonth: 30,
    maxPostsPerDay: 5,
    maxDraftsPerBrand: 20,
    maxPostTemplates: 10,
    maxMediaStorageMb: 250,
    allowBulkPublishing: false,
    allowSocialAI: true,
    maxSocialAIGenerationsPerMonth: 50,
    allowAiVideo: false,
    allowWhiteLabel: false,
    allowedModelTiers: ['free'],
    allowedModelTypes: ['text', 'image'],
    allowByok: false,
    byokProviders: [],
    monthlyCredits: 100,
    allowCustomOpenRouterModels: false,
    allowVoice: false,
    allowVoiceByok: false,
    maxVoiceMinutes: 0,
    allowedVoiceProviders: [],
    agent: {
        allowAgent: false,
        allowedModels: ['claude-haiku-4-5-20251001'],
        defaultModel: 'claude-haiku-4-5-20251001',
        routerModel: 'claude-haiku-4-5-20251001',
        maxTokensUsdCents: 50,
        maxToolCalls: 25,
        maxWallClockHours: 1,
        allowedAutonomyModes: ['watch'],
        defaultAutonomyMode: 'watch',
        maxActiveSchedules: 0,
        minWakeIntervalMinutes: 1440,
        allowAdsWrite: false,
    },
};

/**
 * The OSS single-tenant entitlement set: everything granted, every numeric cap
 * unlimited (-1). `allowWhiteLabel` stays false (agency white-label resolves to a
 * null/default profile in the white-label seam — there is nothing to brand here).
 * `executionPriority` stays a sane top priority (lower = higher in BullMQ) and the
 * agent wake floor stays at 1 minute; both are tuning values, not caps.
 */
const UNLIMITED_PLAN_FEATURES: IPlanFeatures = {
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
    allowedAIProviders: [
        'openai', 'google', 'anthropic', 'openrouter', 'groq',
        'mistral', 'cohere', 'deepseek', 'xai', 'perplexity',
    ],

    // Canvas/Workflows Features
    maxCanvases: -1,
    maxWorkflowExecutions: -1,
    allowAdvancedNodes: true,
    allowAIWorkflowGeneration: true,

    // Workflow Queue Fairness (single org — no contention; top priority, no caps)
    maxConcurrentExecutions: -1,
    maxQueuedExecutions: -1,
    executionPriority: 1,

    // Execution History Retention (-1 = keep forever / no cap)
    executionRetentionDays: -1,
    failedExecutionRetentionDays: -1,
    maxStoredExecutions: -1,

    // Marketing Email Features
    maxEmailCampaigns: -1,
    maxEmailTemplates: -1,
    allowEmailAutomation: true,

    // Social Media Features
    maxBrands: -1,
    maxSocialAccountsPerBrand: -1,
    allowedPlatforms: [
        'x', 'linkedin', 'facebook', 'instagram', 'threads', 'youtube',
        'tiktok', 'pinterest', 'bluesky', 'mastodon', 'googlebusiness',
        'telegram', 'discord', 'slack', 'devto', 'reddit',
    ],
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
    allowWhiteLabel: false, // → null/default branding profile in the white-label seam

    // AI Model Access Control
    allowedModelTiers: ['free', 'pro', 'enterprise'],
    allowedModelTypes: ['text', 'image', 'video'],

    // BYOK
    allowByok: true,
    byokProviders: [
        'openai', 'google', 'anthropic', 'openrouter', 'groq',
        'mistral', 'cohere', 'deepseek', 'xai', 'perplexity',
    ],

    // Credits
    monthlyCredits: -1,

    // Custom Models
    allowCustomOpenRouterModels: true,

    // Voice Features
    allowVoice: true,
    allowVoiceByok: true,
    maxVoiceMinutes: -1,
    allowedVoiceProviders: ['twilio', 'plivo', 'vonage', 'telnyx'],

    // Agent Features
    agent: {
        allowAgent: true,
        allowedModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'],
        defaultModel: 'claude-haiku-4-5-20251001',
        routerModel: 'claude-haiku-4-5-20251001',
        maxTokensUsdCents: -1,
        maxToolCalls: -1,
        maxWallClockHours: -1,
        allowedAutonomyModes: ['watch', 'supervised', 'autopilot'],
        defaultAutonomyMode: 'watch',
        maxActiveSchedules: -1,
        minWakeIntervalMinutes: 1,
        allowAdsWrite: true,
    },
};

/** An "unlimited" limit-check result — always allowed, no cap. */
const UNLIMITED_RESULT: LimitCheckResult = { allowed: true, current: 0, limit: -1 };

/**
 * Resolve the effective plan features for a user. OSS single-tenant: always the
 * unlimited entitlement set — no DB lookup.
 */
export async function getEffectivePlanFeatures(_userId: string): Promise<IPlanFeatures> {
    return UNLIMITED_PLAN_FEATURES;
}

/**
 * Resolve the effective plan features. OSS single-tenant: always unlimited.
 * (The multi-tenant original resolved per-organization; there is one tenant here.)
 */
export async function getOrgPlanFeatures(_organizationId: string): Promise<IPlanFeatures> {
    return UNLIMITED_PLAN_FEATURES;
}

/**
 * Generic limit checker. OSS single-tenant: always allowed, unlimited.
 */
export async function checkPlanLimit(
    _userId: string,
    _collection: string,
    _limitField: keyof IPlanFeatures
): Promise<LimitCheckResult> {
    return { ...UNLIMITED_RESULT };
}

/** Check if user can create a contact. OSS: always allowed. */
export async function canCreateContact(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'contacts', 'maxContacts');
}

/** Check if user can create a deal. OSS: always allowed. */
export async function canCreateDeal(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'deals', 'maxDeals');
}

/** Check if user can create a pipeline. OSS: always allowed. */
export async function canCreatePipeline(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'pipelines', 'maxPipelines');
}

/** Check if user can create a custom field. OSS: always allowed. */
export async function canCreateCustomField(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'custom_fields', 'maxCustomFields');
}

/** Check if user can create a form. OSS: always allowed. */
export async function canCreateForm(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'forms', 'maxForms');
}

/** Check if user can create a document. OSS: always allowed. */
export async function canCreateDocument(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'documents', 'maxDocuments');
}

/** Check if user can create a canvas/workflow. OSS: always allowed. */
export async function canCreateCanvas(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'canvases', 'maxCanvases');
}

/** Check if user can create an AI conversation. OSS: always allowed. */
export async function canCreateConversation(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'conversations', 'maxConversations');
}

/** Check if user can create a brand. OSS: always allowed. */
export async function canCreateBrand(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'brands', 'maxBrands');
}

/** Check if user can create a WhatsApp campaign. OSS: always allowed. */
export async function canCreateWhatsAppCampaign(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'whatsapp_campaigns', 'maxWhatsAppCampaigns');
}

/** Check if user can create an email campaign. OSS: always allowed. */
export async function canCreateEmailCampaign(userId: string): Promise<LimitCheckResult> {
    return checkPlanLimit(userId, 'email_campaigns', 'maxEmailCampaigns');
}

/**
 * Monthly workflow-execution quota check. OSS single-tenant: unmetered — always
 * allowed. Never throws (no DB to fail).
 */
export async function canExecuteWorkflow(_userId: string): Promise<LimitCheckResult> {
    return { ...UNLIMITED_RESULT };
}

/** Thrown when the execution-quota lookup is unavailable. Retained so core
 *  `instanceof` guards still resolve; never thrown in the unmetered OSS build. */
export class QuotaCheckUnavailableError extends Error {
    constructor(public cause?: unknown) {
        super('Execution quota check is temporarily unavailable.');
        this.name = 'QuotaCheckUnavailableError';
    }
}

/** Thrown when an execution quota is exceeded. Retained so core `instanceof`
 *  guards (queue dispatch, polling triggers) still resolve; never thrown in the
 *  unmetered OSS build. */
export class ExecutionQuotaExceededError extends Error {
    constructor(public organizationId: string, public current: number, public limit: number) {
        super(`Reached the monthly execution quota (${current}/${limit}).`);
        this.name = 'ExecutionQuotaExceededError';
    }
}

/**
 * Execution-quota check. OSS single-tenant: unmetered — always allowed. Never
 * throws (no DB to fail).
 */
export async function canExecuteWorkflowForOrg(_organizationId: string): Promise<LimitCheckResult> {
    return { ...UNLIMITED_RESULT };
}

/**
 * Check if a boolean feature is enabled. OSS: reflects the unlimited entitlement
 * set (everything granted except white-label).
 */
export async function hasFeature(
    _userId: string,
    featureName: keyof IPlanFeatures
): Promise<boolean> {
    return Boolean(UNLIMITED_PLAN_FEATURES[featureName]);
}

/**
 * Current usage statistics. OSS single-tenant: zero usage against unlimited caps.
 */
export async function getUserUsageStats(_userId: string) {
    return {
        contacts: { current: 0, limit: -1 },
        deals: { current: 0, limit: -1 },
        pipelines: { current: 0, limit: -1 },
        forms: { current: 0, limit: -1 },
        documents: { current: 0, limit: -1 },
        canvases: { current: 0, limit: -1 },
        conversations: { current: 0, limit: -1 },
        brands: { current: 0, limit: -1 },
    };
}

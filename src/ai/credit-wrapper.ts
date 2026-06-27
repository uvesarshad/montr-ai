// OSS carve stub (always-allow) of src/ai/credit-wrapper.ts — single-tenant, unmetered.

/**
 * Credit Wrapper for AI Flows
 *
 * OSS single-tenant build: credit metering is removed. Every check passes
 * (unlimited), nothing is consumed, and costs report as zero. Signatures are
 * preserved byte-for-byte so the 16 AI flows that wrap through here keep working.
 */

export interface CreditCheckResult {
    allowed: boolean;
    remaining: number;
    cost: number;
    reason?: 'insufficient_credits' | 'no_active_period';
}

/**
 * Check if user has enough credits for an AI request.
 * Always-allow: unlimited, zero cost.
 */
export async function checkAICredits(
    userId: string,
    modelId: string
): Promise<CreditCheckResult> {
    return { allowed: true, remaining: Infinity, cost: 0 };
}

/**
 * Consume credits after a successful AI request.
 * No-op in OSS single-tenant: nothing is metered.
 */
export async function consumeAICredits(
    userId: string,
    modelId: string,
    requestType: 'text' | 'image' | 'video' | 'audio',
    usingByok: boolean = false
): Promise<boolean> {
    return true;
}

/**
 * Consume credits for scraping request.
 * No-op in OSS single-tenant: nothing is metered.
 */
export async function consumeScrapingCredits(
    userId: string,
    serviceId: 'jinaai' | 'apify',
    usingByok: boolean = false
): Promise<boolean> {
    return true;
}

/**
 * Get credit cost for a model (without consuming).
 * Always free in OSS single-tenant.
 */
export async function getModelCreditCost(modelId: string): Promise<number> {
    return 0;
}

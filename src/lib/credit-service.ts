// OSS carve stub (always-allow) of src/lib/credit-service.ts — single-tenant, unmetered.
'use server';

import type { ICreditUsage, ICreditUsageHistory } from './db/models/credit-usage.model';

/**
 * Credit Service — OSS single-tenant build.
 *
 * Credit metering is removed for the source-available seed. Every check passes
 * (unlimited), nothing is consumed, allocation is a safe no-op, and all usage
 * stats report unlimited/zero. The DB-backed credit-usage record, the plan/credit
 * repositories, model cost registry, and threshold notifications are NOT queried.
 *
 * Exported signatures match the upstream module so the ~11 importers (auth.ts
 * free-plan allocation on signup, /api/credits*, renew-credits cron, etc.) keep
 * working without moving any call-site. Single-tenant: no organizationId.
 */

const UNLIMITED_CREDITS = 1_000_000_000;

interface CreditCheckResult {
    allowed: boolean;
    remaining: number;
    cost: number;
    reason?: 'insufficient_credits' | 'no_active_period';
}

interface ConsumeCreditsInput {
    userId: string;
    modelOrServiceId: string;
    requestType: 'text' | 'image' | 'video' | 'audio' | 'scraping';
    usingByok?: boolean;
    modelName?: string;
}

/**
 * Build a synthetic, always-full credit-usage record. Never persisted; returned
 * so callers expecting an ICreditUsage shape (getUsage / allocateCredits) keep
 * their typing and read an unlimited balance.
 */
function unlimitedUsage(userId: string): ICreditUsage {
    const now = new Date();
    const farFuture = new Date(now.getFullYear() + 100, 0, 1);
    return {
        userId,
        periodStart: now,
        periodEnd: farFuture,
        creditsAllocated: UNLIMITED_CREDITS,
        creditsUsed: 0,
        bonusCredits: UNLIMITED_CREDITS,
        bonusCreditsUsed: 0,
        usageByType: { text: 0, image: 0, video: 0, audio: 0, scraping: 0 },
        usageHistory: [],
        lastRequestAt: now,
        createdAt: now,
        updatedAt: now,
    } as unknown as ICreditUsage;
}

/**
 * Check if user has enough credits for a request.
 * Always-allow: unlimited remaining, zero cost.
 */
export async function checkCredits(
    userId: string,
    modelOrServiceId: string
): Promise<CreditCheckResult> {
    return { allowed: true, remaining: UNLIMITED_CREDITS, cost: 0 };
}

/**
 * Consume credits after a successful request.
 * No-op in OSS single-tenant: nothing is metered.
 */
export async function consumeCredits(input: ConsumeCreditsInput): Promise<boolean> {
    return true;
}

/**
 * Get current usage for a user.
 * Returns a synthetic unlimited record (never null) so callers never gate.
 */
export async function getUsage(userId: string): Promise<ICreditUsage | null> {
    return unlimitedUsage(userId);
}

/**
 * Allocate credits to a user (called on plan purchase/renewal and on signup).
 * Safe no-op: returns a synthetic unlimited record without touching the DB.
 * MUST NOT throw — auth.ts calls this during signup.
 */
export async function allocateCredits(
    userId: string,
    amount: number,
    periodEnd: Date
): Promise<ICreditUsage> {
    return unlimitedUsage(userId);
}

/**
 * Add bonus credits to a user (admin action).
 * No-op in OSS single-tenant: credits are already unlimited.
 */
export async function addBonusCredits(
    userId: string,
    amount: number
): Promise<boolean> {
    return true;
}

/**
 * Get usage summary for dashboards.
 * Reports unlimited allocation, zero used.
 */
export async function getUsageSummary(userId: string): Promise<{
    totalAllocated: number;
    totalUsed: number;
    remaining: number;
    usageByType: { text: number; image: number; video: number; scraping: number };
    periodEnd: Date | null;
} | null> {
    return {
        totalAllocated: UNLIMITED_CREDITS,
        totalUsed: 0,
        remaining: UNLIMITED_CREDITS,
        usageByType: { text: 0, image: 0, video: 0, scraping: 0 },
        periodEnd: new Date(new Date().getFullYear() + 100, 0, 1),
    };
}

/**
 * Check if user has any credits (quick access check).
 * Always true in OSS single-tenant.
 */
export async function hasAnyCredits(userId: string): Promise<boolean> {
    return true;
}

/**
 * Get recent usage history for a user.
 * No metering is recorded, so history is always empty.
 */
export async function getUsageHistory(
    userId: string,
    limit: number = 50
): Promise<ICreditUsageHistory[]> {
    return [];
}

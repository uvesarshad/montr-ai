/**
 * Social-account OAuth token-refresh cron (audit C6 2026-06-06).
 *
 * Social publishing relies on stored OAuth access tokens. Several platforms
 * (Pinterest, TikTok, LinkedIn, Reddit, …) issue short-lived access tokens
 * with a separate refresh token; without a background refresh those tokens
 * silently expire and every publish/analytics call starts failing with no
 * signal to the user.
 *
 * This 15-minute BullMQ repeatable cron:
 *   1. Scans active accounts whose token expires within the lookahead window
 *      (`socialAccountRepository.findAccountsNeedingRefresh`).
 *   2. For each, looks up the platform's OAuth config and calls the generic
 *      `refreshAccessToken()` (engine config-driven). Accounts without a stored
 *      refresh token, or whose platform isn't OAuth-refreshable, are skipped.
 *   3. On success: persist the new tokens + stamp `lastValidatedAt`
 *      (`markRefreshed`).
 *   4. On failure: mark `connectionStatus: 'expired'` and notify — org admins
 *      when the brand resolves to an org, else the brand owner. Deduped per
 *      account so the user isn't pinged every 15 minutes.
 *
 * Modeled exactly on `social-post-sweeper.ts`: a self-contained module with its
 * own Queue + Worker + a Redis `SET NX PX` lock (`withRedisLock`) so only one
 * worker instance refreshes per tick.
 */

import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getConnection } from './queue';
import { withRedisLock } from '../workflow/queue/redis-lock';
import { socialAccountRepository } from '../db/repository/social-account.repository';
import { getSocialOAuthPlatform } from '../social/oauth/platforms';
import { refreshAccessToken, expiresInToDate } from '../social/oauth/exchange';
import type { SocialPlatform } from '../db/models/social-account.model';

export const SOCIAL_TOKEN_REFRESH_QUEUE_NAME = 'social-token-refresh';
const REFRESH_JOB_NAME = 'refresh-social-tokens';
const REFRESH_REPEAT_JOB_ID = 'social-token-refresh-cron';

/** Distributed lock so only one worker instance refreshes per tick. */
const REFRESH_LOCK_KEY = 'social:token-refresh:lock';
const REFRESH_LOCK_TTL_MS = 13 * 60 * 1000; // 13 min — shorter than the 15-min cron.

/**
 * Refresh tokens expiring within this window. Wider than the cron interval so a
 * token can't slip past two ticks before we act on it.
 */
const REFRESH_LOOKAHEAD_MS = 30 * 60 * 1000; // 30 min

/** Cap how many accounts we touch per tick so a backlog can't blow up one run. */
const REFRESH_BATCH_LIMIT = 200;

/**
 * Map a SocialAccount platform to its OAuth engine registry key. Most are
 * identical; google_business uses a hyphenated key in the registry.
 */
function oauthPlatformKey(platform: SocialPlatform): string {
    if (platform === 'google_business') return 'google-business';
    return platform;
}

export interface SocialTokenRefreshReport {
    scanned: number;
    refreshed: number;
    skipped: number;
    expired: number;
    errors: number;
}

/**
 * Notify the right audience that an account's credentials went stale. Best
 * effort — a notification failure must never abort the refresh sweep.
 */
async function notifyAccountExpired(
    account: { _id: unknown; brandId: string; platform: string; platformUsername: string },
    reason: string
): Promise<void> {
    try {
        const accountId = String(account._id);
        const { default: brandRepository } = await import('../db/repository/brand.repository');
        const { notifyAdmins, notifyUser } = await import('../notifications/notification-service');

        const brand = await brandRepository.findById(account.brandId);
        const organizationId = brand?.userId || null;

        const payload = {
            type: 'social_account_expired',
            title: 'Social account disconnected',
            body: `${account.platformUsername || account.platform} (${account.platform}) for ${
                brand?.name || 'your brand'
            } needs to be reconnected — automatic token refresh failed (${reason}).`,
            actionUrl: '/social',
            actionLabel: 'Reconnect',
            dedupeKey: `social-account-expired:${accountId}`,
            data: {
                accountId,
                brandId: account.brandId,
                platform: account.platform,
            },
        };

        if (organizationId) {
            await notifyAdmins(payload);
        } else if (brand?.userId) {
            await notifyUser(brand.userId, payload);
        }
    } catch (err) {
        console.error(
            '[social-token-refresh] Failed to notify of expired account:',
            err instanceof Error ? err.message : err
        );
    }
}

/**
 * Scan + refresh expiring social-account tokens. Idempotent and safe to run
 * alongside live workers.
 */
export async function refreshExpiringSocialTokens(): Promise<SocialTokenRefreshReport> {
    const report: SocialTokenRefreshReport = { scanned: 0, refreshed: 0, skipped: 0, expired: 0, errors: 0 };

    let candidates;
    try {
        candidates = await socialAccountRepository.findAccountsNeedingRefresh(
            REFRESH_LOOKAHEAD_MS,
            REFRESH_BATCH_LIMIT
        );
    } catch (err) {
        report.errors++;
        console.error(
            '[social-token-refresh] Candidate scan failed:',
            err instanceof Error ? err.message : err
        );
        return report;
    }

    for (const { account, refreshToken } of candidates) {
        report.scanned++;
        const accountId = account._id.toString();

        // No refresh token → nothing we can do automatically. Leave the account
        // as-is (it may still be valid until its access token expires; the
        // analytics/publish paths surface the failure when it does).
        if (!refreshToken) {
            report.skipped++;
            continue;
        }

        const config = getSocialOAuthPlatform(oauthPlatformKey(account.platform));
        if (!config) {
            // Platform isn't OAuth-refreshable via the engine (e.g. telegram
            // bot tokens, self-hosted wordpress). Skip silently.
            report.skipped++;
            continue;
        }

        try {
            const tokens = await refreshAccessToken(config, refreshToken);
            await socialAccountRepository.updateTokens(
                accountId,
                tokens.accessToken,
                // Some providers omit a rotated refresh token — keep the existing one.
                tokens.refreshToken,
                expiresInToDate(tokens.expiresIn)
            );
            await socialAccountRepository.markRefreshed(accountId);
            report.refreshed++;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'token refresh failed';
            report.expired++;
            try {
                await socialAccountRepository.markConnectionStatus(accountId, 'expired', message);
            } catch (statusErr) {
                report.errors++;
                console.error(
                    `[social-token-refresh] Failed to flag account ${accountId} expired:`,
                    statusErr instanceof Error ? statusErr.message : statusErr
                );
            }
            await notifyAccountExpired(account, message);
        }
    }

    if (report.refreshed > 0 || report.expired > 0 || report.errors > 0) {
        console.log(
            `[social-token-refresh] Sweep complete — scanned=${report.scanned} refreshed=${report.refreshed} skipped=${report.skipped} expired=${report.expired} errors=${report.errors}`
        );
    }
    return report;
}

/**
 * Run the refresh under the distributed lock. Returns null if another worker
 * instance holds the lock this tick.
 */
export async function refreshExpiringSocialTokensLocked(): Promise<SocialTokenRefreshReport | null> {
    return withRedisLock(REFRESH_LOCK_KEY, REFRESH_LOCK_TTL_MS, refreshExpiringSocialTokens);
}

// ── BullMQ cron registration + consumer ──────────────────────────────────

let cachedRefreshQueue: Queue | null = null;

function getRefreshQueue(): Queue {
    if (!cachedRefreshQueue) {
        cachedRefreshQueue = new Queue(SOCIAL_TOKEN_REFRESH_QUEUE_NAME, {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1,
                removeOnComplete: { age: 24 * 3600, count: 100 },
                removeOnFail: { age: 7 * 24 * 3600, count: 200 },
            },
        });
    }
    return cachedRefreshQueue;
}

/**
 * Register the 15-minute refresh cron. Idempotent (fixed repeat jobId).
 */
export async function scheduleSocialTokenRefresh(): Promise<void> {
    try {
        const queue = getRefreshQueue();
        await queue.add(
            REFRESH_JOB_NAME,
            { trigger: 'cron' },
            {
                repeat: { pattern: '*/15 * * * *' }, // Every 15 minutes
                jobId: REFRESH_REPEAT_JOB_ID,
            }
        );
        console.log('[social-token-refresh] Refresh cron registered (every 15 min).');
    } catch (error: unknown) {
        console.warn(
            '[social-token-refresh] Could not register refresh cron (Redis might be down):',
            error instanceof Error ? error.message : String(error)
        );
    }
}

let cachedRefreshWorker: Worker | null = null;

/** Start the consumer that runs the refresh when the cron fires. */
export function createSocialTokenRefreshWorker(): Worker {
    if (cachedRefreshWorker) return cachedRefreshWorker;

    cachedRefreshWorker = new Worker(
        SOCIAL_TOKEN_REFRESH_QUEUE_NAME,
        async (_job: Job) => {
            const result = await refreshExpiringSocialTokensLocked();
            return result ?? { skipped: 'lock-held' };
        },
        {
            connection: getConnection(),
            concurrency: 1,
        }
    );

    cachedRefreshWorker.on('failed', (job, err) => {
        console.error(`[social-token-refresh] Refresh job ${job?.id} failed:`, err?.message || err);
    });
    cachedRefreshWorker.on('error', (err) => {
        console.error('[social-token-refresh] Worker error:', err?.message || err);
    });

    console.log('[social-token-refresh] Social token refresh worker started');

    return cachedRefreshWorker;
}

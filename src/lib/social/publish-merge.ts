/**
 * Pure helpers for merging social publish results across publish/retry attempts
 * (audit §D — "Retry double-publish"). Kept dependency-free (no DB/mongoose
 * imports) so the merge/skip logic is unit-testable in isolation with
 * `npx tsx --test`.
 *
 * Identity of a publish target is (platform, accountId): a single post can fan
 * out to several accounts on the same platform, and each is published once.
 */

export interface PublishResultLike {
    platform: string;
    accountId: string;
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
    publishedAt?: Date;
}

/** Stable key for a publish result / platform config. */
export function publishTargetKey(r: { platform: string; accountId: string }): string {
    return `${r.platform}::${r.accountId}`;
}

/**
 * The synthetic `system` entry markAsFailed $pushes (a whole-post failure note,
 * not a per-platform result) must never count as a "succeeded platform".
 */
export function isSystemResult(r: { platform: string }): boolean {
    return r.platform === 'system';
}

/**
 * Set of (platform::account) keys that have ALREADY published successfully,
 * derived from a post's existing publishResults. `system` entries excluded.
 */
export function successfulTargetKeys<T extends PublishResultLike>(prior: T[]): Set<string> {
    return new Set(
        prior.reduce<string[]>((acc, r) => {
            if (r.success && !isSystemResult(r)) {
                acc.push(publishTargetKey(r));
            }
            return acc;
        }, [])
    );
}

/**
 * Merge prior publish results with the results of a fresh (retry) attempt that
 * only re-ran the previously-failed targets.
 *
 * Rules:
 *  - Carry forward every prior SUCCESS that was NOT re-attempted.
 *  - Each fresh result replaces any prior entry for the same target (a now-
 *    successful retry overwrites the old failure; a still-failing retry
 *    overwrites it with the latest error).
 *  - Prior `system` failure notes are dropped — they describe a past whole-post
 *    failure the retry supersedes; a fresh whole-post failure (if any) is
 *    recorded separately by markAsFailed.
 */
export function mergePublishResults<T extends PublishResultLike>(prior: T[], fresh: T[]): T[] {
    const freshKeys = new Set(fresh.map(r => publishTargetKey(r)));

    const carried = prior.filter(
        r => r.success && !isSystemResult(r) && !freshKeys.has(publishTargetKey(r))
    );

    return [...carried, ...fresh];
}

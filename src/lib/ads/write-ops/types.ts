/**
 * Ads write-ops — the ONLY module allowed to perform write calls against
 * ads platforms.
 *
 * HARD GUARDRAILS (docs/ads-analytics-plan.md §3.3–3.4 — do not relax):
 *  - Create-only. No update/delete/pause-toggle operations exist here, and
 *    none may be added without an explicit product decision.
 *  - Everything is created PAUSED (campaign level) — the platform never
 *    spends until the user activates the campaign themselves.
 *  - Every operation requires the acting user's context and writes an
 *    AdWriteAudit row, success or failure.
 *  - Never called from background jobs — only from API routes handling an
 *    explicit user action.
 */
import { connectDB } from '@/lib/mongodb';
import AdWriteAudit from '@/lib/db/models/ad-write-audit.model';
import type { IAdAccount } from '@/lib/db/models/ad-account.model';

export interface WriteContext {
    /** The user whose explicit action triggered the write */
    userId: string;
    brandId: string;
    account: IAdAccount;
    accessToken: string;
}

/**
 * Run one platform write inside an audit envelope. `request` must already
 * be sanitized (no tokens). Rethrows after logging.
 */
export async function audited<T extends Record<string, unknown>>(
    context: WriteContext,
    operation: string,
    request: Record<string, unknown>,
    run: () => Promise<T>,
): Promise<T> {
    await connectDB();

    try {
        const result = await run();
        await AdWriteAudit.create({
            brandId: context.brandId,
            userId: context.userId,
            adAccountId: context.account._id.toString(),
            platform: context.account.platform,
            operation,
            request,
            result,
            status: 'success',
        });
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await AdWriteAudit.create({
            brandId: context.brandId,
            userId: context.userId,
            adAccountId: context.account._id.toString(),
            platform: context.account.platform,
            operation,
            request,
            status: 'error',
            error: message.slice(0, 2000),
        }).catch(() => undefined);
        throw error;
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { analyticsSourceRepository } from '@/lib/db/repository/analytics-source.repository';
import { enqueueSourceMetricsSync } from '@/lib/queue/queue';
import { analyticsSyncRequestSchema } from '@/validations/analytics';

/**
 * Manual "Sync now".
 * POST /api/v2/analytics/sync  { connectionId?, sourceType?, days? }
 *
 * With connectionId: syncs that one connection (must belong to the org).
 * Without: enqueues a sync for every ad account + analytics source in the
 * org. Account-level social syncs are handled by the recurring cron.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const parsed = analyticsSyncRequestSchema.safeParse(await req.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request' },
                { status: 400 },
            );
        }

        const { connectionId, sourceType, days = 7 } = parsed.data;

        if (connectionId && sourceType) {
            // Verify the connection belongs to this organization
            const isAds = sourceType === 'google_ads' || sourceType === 'meta_ads';
            const connection = isAds
                ? await adAccountRepository.findById(connectionId)
                : await analyticsSourceRepository.findById(connectionId);

            if (!connection) {
                return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
            }

            const job = await enqueueSourceMetricsSync(sourceType, connectionId, days, 'manual');
            if (!job) {
                return NextResponse.json({ error: 'Sync queue unavailable' }, { status: 503 });
            }
            return NextResponse.json({ enqueued: 1 });
        }

        // Org-wide: every ad account + analytics source
        const [adAccounts, sources] = await Promise.all([
            adAccountRepository.findByOrganizationId(),
            analyticsSourceRepository.findByOrganizationId(),
        ]);

        let enqueued = 0;
        for (const account of adAccounts) {
            const job = await enqueueSourceMetricsSync(account.platform, account._id.toString(), days, 'manual');
            if (job) enqueued += 1;
        }
        for (const source of sources) {
            const job = await enqueueSourceMetricsSync(source.sourceType, source._id.toString(), days, 'manual');
            if (job) enqueued += 1;
        }

        if (enqueued === 0 && (adAccounts.length > 0 || sources.length > 0)) {
            return NextResponse.json({ error: 'Sync queue unavailable' }, { status: 503 });
        }

        return NextResponse.json({ enqueued });
    } catch (error) {
        console.error('Analytics sync trigger error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

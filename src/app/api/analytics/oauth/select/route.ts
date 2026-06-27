import { NextRequest, NextResponse } from 'next/server';
import { analyticsSourceRepository } from '@/lib/db/repository/analytics-source.repository';
import { enqueueSourceMetricsSync } from '@/lib/queue/queue';
import {
    clearAnalyticsPickerCookies,
    parseAnalyticsSourceType,
    resolveAnalyticsPickerSession,
} from '@/lib/analytics/analytics-oauth-picker';
import {
    fetchGa4Properties,
    fetchSearchConsoleSites,
    GA4_SCOPE,
    SEARCH_CONSOLE_SCOPE,
} from '@/lib/analytics/analytics-oauth';

// The Google access token was minted minutes ago (picker cookies live 10
// minutes); a conservative remaining lifetime keeps the first sync from
// using a stale token while avoiding an immediate refresh.
const GOOGLE_ACCESS_TOKEN_REMAINING_TTL_MS = 45 * 60 * 1000; // 45 minutes

/**
 * Finalizes an analytics-source connection after the user picks a
 * GA4 property / Search Console site.
 * POST /api/analytics/oauth/select  { platform, assetId }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const sourceType = parseAnalyticsSourceType(body.platform);
        const assetId = typeof body.assetId === 'string' ? body.assetId : null;

        if (!sourceType || !assetId) {
            return NextResponse.json({ error: 'Invalid selection payload' }, { status: 400 });
        }

        const resolution = await resolveAnalyticsPickerSession(sourceType);
        if (!resolution.ok) {
            return NextResponse.json({ error: resolution.error }, { status: resolution.status });
        }

        const { userId, brandId, accessToken, refreshToken } = resolution.data;

        // Re-fetch server-side and locate the selected asset — the client
        // only ever sends an ID, never source data or tokens.
        const assets = sourceType === 'ga4'
            ? await fetchGa4Properties(accessToken)
            : await fetchSearchConsoleSites(accessToken);
        const asset = assets.find((candidate) => candidate.id === assetId);

        if (!asset) {
            return NextResponse.json({ error: 'Selected source not found' }, { status: 404 });
        }

        const tokenExpiresAt = new Date(Date.now() + GOOGLE_ACCESS_TOKEN_REMAINING_TTL_MS);
        const metadata = sourceType === 'ga4'
            ? { accountName: asset.detail }
            : { permissionLevel: asset.detail };

        const existingSource = await analyticsSourceRepository.findByExternalId(sourceType, asset.id);
        if (existingSource && existingSource.brandId !== brandId) {
            return NextResponse.json(
                { error: 'This source is already connected to another brand' },
                { status: 409 },
            );
        }

        let connectionId: string;
        if (existingSource) {
            await analyticsSourceRepository.update(existingSource._id.toString(), {
                accessToken,
                refreshToken,
                tokenExpiresAt,
                displayName: asset.name,
                metadata,
                isActive: true,
                lastError: '',
            });
            connectionId = existingSource._id.toString();
        } else {
            const created = await analyticsSourceRepository.create({
                brandId,
                userId,
                sourceType,
                externalId: asset.id,
                displayName: asset.name,
                accessToken,
                refreshToken,
                tokenExpiresAt,
                scopes: [sourceType === 'ga4' ? GA4_SCOPE : SEARCH_CONSOLE_SCOPE],
                metadata,
            });
            connectionId = created._id.toString();
        }

        // Kick off the initial 90-day backfill (no-op if Redis is down;
        // the 6-hourly cron will still pick the source up go-forward)
        await enqueueSourceMetricsSync(sourceType, connectionId, 90, 'backfill');

        await clearAnalyticsPickerCookies(sourceType);

        return NextResponse.json({ connected: sourceType });
    } catch (error) {
        console.error('Analytics OAuth selection error:', error);
        return NextResponse.json({ error: 'Failed to finalize source connection' }, { status: 500 });
    }
}

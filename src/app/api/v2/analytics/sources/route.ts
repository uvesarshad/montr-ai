import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { analyticsSourceRepository } from '@/lib/db/repository/analytics-source.repository';

/**
 * Lists the organization's connected analytics sources (GA4 / Search Console).
 * GET /api/v2/analytics/sources?brandId=xxx (brandId optional filter)
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const brandId = new URL(req.url).searchParams.get('brandId');

        const sources = await analyticsSourceRepository.findByOrganizationId();
        const filtered = brandId ? sources.filter((source) => source.brandId === brandId) : sources;

        // Encrypted token fields are select:false and never reach this payload
        return NextResponse.json({
            sources: filtered.map((source) => ({
                _id: source._id,
                sourceType: source.sourceType,
                externalId: source.externalId,
                displayName: source.displayName,
                brandId: source.brandId,
                isActive: source.isActive,
                lastSyncedAt: source.lastSyncedAt,
                lastError: source.lastError,
                metadata: source.metadata,
                createdAt: source.createdAt,
            })),
        });
    } catch (error) {
        console.error('Error listing analytics sources:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

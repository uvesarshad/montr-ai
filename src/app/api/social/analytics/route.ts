// OSS single-tenant override of src/app/api/social/analytics/route.ts — CP-2 hand-patch; org-stripped.
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { analyticsRepository } from '@/lib/db/repository/analytics.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';
import { knowledgeIngestionService } from '@/lib/knowledge-base/knowledge-ingestion.service';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import type { MetricsSourceType, MetricsEntityType } from '@/lib/db/models/metrics-snapshot.model';
import { buildSocialBenchmark } from '@/lib/social/benchmark';
import { getEffectivePlanFeatures } from '@/lib/plan-enforcement';
import { brandRepository } from '@/lib/db/repository/brand.repository';

// Account-level social sources that record a follower time series in
// MetricsSnapshot (via the source-metrics fetchers). Platforms without an
// account-level fetcher (reddit, dribbble, google_business, pinterest) simply
// won't appear in the response — no fabricated series.
const FOLLOWER_SOURCE_TYPES: MetricsSourceType[] = [
    'facebook', 'instagram', 'threads', 'linkedin', 'tiktok', 'x', 'youtube',
];
const FOLLOWER_ENTITY_TYPES: MetricsEntityType[] = ['account', 'page', 'channel'];

/** Coerce a YYYY-MM-DD bucket from a Date in UTC */
function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

// GET - Get analytics data with various options
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const view = searchParams.get('view') || 'summary'; // summary, posts, trends, platforms
        const fromDate = searchParams.get('fromDate');
        const toDate = searchParams.get('toDate');
        const platform = searchParams.get('platform');
        const groupBy = searchParams.get('groupBy') as 'day' | 'week' | 'month' | null;

        if (!brandId) {
            return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
        }

        // Ownership: confirm the brand belongs to the caller (audit C4).
        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Default to last 30 days if no date range provided
        const from = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const to = toDate ? new Date(toDate) : new Date();

        switch (view) {
            case 'summary': {
                const summary = await analyticsRepository.getSummary(brandId, from, to);
                return NextResponse.json(summary);
            }

            case 'posts': {
                const posts = await analyticsRepository.getByBrand(brandId, {
                    fromDate: from,
                    toDate: to,
                    platform: platform as MetricPlatform | undefined,
                    limit: parseInt(searchParams.get('limit') || '50'),
                });
                return NextResponse.json({ posts });
            }

            case 'trends': {
                const trends = await analyticsRepository.getTrends(
                    brandId,
                    from,
                    to,
                    groupBy || 'day'
                );
                return NextResponse.json({ trends });
            }

            case 'platforms': {
                const platforms = await analyticsRepository.getPlatformComparison(brandId, from, to);
                return NextResponse.json({ platforms });
            }

            case 'followers': {
                // Account-level follower time series, sourced ONLY from real
                // MetricsSnapshot rows written by the source-metrics fetchers.
                const rows = await metricsSnapshotRepository.findRange({
                    brandId,
                    sourceType: FOLLOWER_SOURCE_TYPES,
                    entityType: FOLLOWER_ENTITY_TYPES,
                    dateFrom: toDateKey(from),
                    dateTo: toDateKey(to),
                });

                // Pivot to one series per platform: { platform, points: [{date, followers}] }.
                // `followers_total` is an absolute snapshot (fb/threads/linkedin/tiktok/x/youtube);
                // instagram only reports `new_followers` (daily delta) — surface it as `newFollowers`.
                const byPlatform = new Map<string, Map<string, { followers: number | null; newFollowers: number | null }>>();

                for (const row of rows) {
                    const total = (row.metrics as Record<string, number>).followers_total;
                    const delta = (row.metrics as Record<string, number>).new_followers;
                    if (total === undefined && delta === undefined) continue;

                    let series = byPlatform.get(row.sourceType);
                    if (!series) {
                        series = new Map();
                        byPlatform.set(row.sourceType, series);
                    }
                    // Multiple accounts on one platform → sum same-day values
                    const existing = series.get(row.date) || { followers: null, newFollowers: null };
                    if (total !== undefined) existing.followers = (existing.followers ?? 0) + total;
                    if (delta !== undefined) existing.newFollowers = (existing.newFollowers ?? 0) + delta;
                    series.set(row.date, existing);
                }

                const followers = Array.from(byPlatform.entries()).map(([platform, series]) => {
                    const points = Array.from(series.entries())
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([date, value]) => ({
                            date,
                            followers: value.followers,
                            newFollowers: value.newFollowers,
                        }));
                    return { platform, points };
                });

                return NextResponse.json({ followers, available: followers.length > 0 });
            }

            case 'benchmark': {
                // Competitor / industry-benchmark comparison (Epic 7.2).
                // Gated behind the `analytics` plan feature, resolved from the
                // session user's plan. Industry comes from the brand record, with
                // an optional `?industry=` query override for previewing a
                // different vertical.
                const features = await getEffectivePlanFeatures(session.user.id);
                if (!features.analytics) {
                    return NextResponse.json(
                        { error: 'Benchmark analytics is not included in your current plan.' },
                        { status: 402 }
                    );
                }

                const industryOverride = searchParams.get('industry');
                let industry: string | null = industryOverride;
                if (!industry) {
                    const brand = await brandRepository.findById(brandId);
                    industry = brand?.industry ?? null;
                }

                const benchmark = await buildSocialBenchmark({
                    brandId,
                    industry,
                    fromDate: from,
                    toDate: to,
                });

                return NextResponse.json({
                    benchmark: { industry: benchmark.industry, cards: benchmark.cards },
                });
            }

            default:
                return NextResponse.json({ error: 'Invalid view type' }, { status: 400 });
        }
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch analytics' },
            { status: 500 }
        );
    }
}

// POST - Record new analytics data (typically called after publishing)
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            scheduledPostId,
            externalPostId,
            brandId,
            platform,
            platformAccountId,
            postUrl,
            publishedAt,
            contentPreview,
            hasMedia,
            metrics,
        } = body;

        if (!brandId || !platform || !contentPreview) {
            return NextResponse.json(
                { error: 'Missing required fields: brandId, platform, contentPreview' },
                { status: 400 }
            );
        }

        // Ownership: confirm the brand belongs to the caller (audit C4).
        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const analytics = await analyticsRepository.createPostAnalytics({
            scheduledPostId,
            externalPostId,
            brandId,
            userId: session.user.id,
            platform,
            platformAccountId,
            postUrl,
            publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
            contentPreview,
            hasMedia: hasMedia || false,
            metrics,
        });

        // Background sync to Knowledge Base (Non-blocking)
        knowledgeIngestionService.ingestSocialPostReport(
            session.user.id,
            analytics._id.toString(),
            platform,
            contentPreview,
            metrics
        ).catch(err => console.error('Knowledge Base ingestion failed:', err));

        return NextResponse.json({
            success: true,
            analytics: {
                id: analytics._id,
                platform: analytics.platform,
                metrics: analytics.metrics,
            },
        });
    } catch (error) {
        console.error('Error creating analytics:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to create analytics' },
            { status: 500 }
        );
    }
}

// PATCH - Update metrics for a post
export async function PATCH(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, metrics, saveHistory } = body;

        if (!id || !metrics) {
            return NextResponse.json(
                { error: 'Missing required fields: id, metrics' },
                { status: 400 }
            );
        }

        // Ownership: load the record and confirm its brand belongs to the caller (audit C4).
        const existing = await analyticsRepository.findById(id);
        if (!existing) {
            return NextResponse.json({ error: 'Analytics record not found' }, { status: 404 });
        }
        try {
            await assertBrandAccess(session.user.id, existing.brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const updated = await analyticsRepository.updateMetrics(id, {
            metrics,
            saveHistory: saveHistory || false,
        });

        if (!updated) {
            return NextResponse.json({ error: 'Analytics record not found' }, { status: 404 });
        }

        // Background sync to Knowledge Base (Non-blocking)
        knowledgeIngestionService.ingestSocialPostReport(
            session.user.id,
            updated._id.toString(),
            updated.platform,
            updated.contentPreview || 'Updated analytics report',
            updated.metrics
        ).catch(err => console.error('Knowledge Base ingestion failed:', err));

        return NextResponse.json({
            success: true,
            analytics: {
                id: updated._id,
                metrics: updated.metrics,
                lastFetchedAt: updated.lastFetchedAt,
            },
        });
    } catch (error) {
        console.error('Error updating analytics:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to update analytics' },
            { status: 500 }
        );
    }
}

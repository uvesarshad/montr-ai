/**
 * AI ads recommendations — READ-ONLY analysis over the metrics store.
 *
 * GUARDRAIL: recommendations are suggestions rendered to the user; nothing
 * here (or downstream of here) mutates campaigns. See docs/ads-analytics-plan.md §3.5.
 */
import { getSession } from '@/lib/get-session';
import { generateTextWithClient } from '@/ai/client';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';
import type { ApiKeys, RouteHint } from '@/ai/types';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import { toDateKey } from '@/lib/analytics/fetchers';

export interface AdsRecommendation {
    title: string;
    detail: string;
    kind: 'budget' | 'fatigue' | 'performer' | 'anomaly' | 'opportunity';
    severity: 'info' | 'warn' | 'critical';
    entityName?: string;
}

interface CampaignStat {
    name: string;
    platform: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
}

function windowFor(daysAgoStart: number, daysAgoEnd: number): { dateFrom: string; dateTo: string } {
    const day = 24 * 60 * 60 * 1000;
    return {
        dateFrom: toDateKey(new Date(Date.now() - daysAgoStart * day)),
        dateTo: toDateKey(new Date(Date.now() - daysAgoEnd * day)),
    };
}

async function campaignStats(
    brandId: string | undefined,
    range: { dateFrom: string; dateTo: string },
): Promise<CampaignStat[]> {
    const rows = await metricsSnapshotRepository.aggregateByEntity({
        brandId,
        sourceType: ['meta_ads', 'google_ads'],
        entityType: 'campaign',
        ...range,
    });

    return rows
        .map((row) => ({
            name: row.entityName || row.entityId,
            platform: row.sourceType === 'meta_ads' ? 'Meta' : 'Google',
            spend: row.metrics.spend || 0,
            impressions: row.metrics.impressions || 0,
            clicks: row.metrics.clicks || 0,
            conversions: row.metrics.conversions || 0,
        }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 20);
}

function statLine(stat: CampaignStat): string {
    const ctr = stat.impressions > 0 ? ((stat.clicks / stat.impressions) * 100).toFixed(2) : '0';
    const cpc = stat.clicks > 0 ? (stat.spend / stat.clicks).toFixed(2) : '—';
    return `${stat.name} [${stat.platform}]: spend ${stat.spend.toFixed(2)}, impr ${stat.impressions}, clicks ${stat.clicks}, CTR ${ctr}%, CPC ${cpc}, conv ${stat.conversions}`;
}

function parseRecommendations(raw: string): AdsRecommendation[] {
    const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return [];

    try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        const items = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
        return items
            .map((item: Record<string, unknown>) => ({
                title: String(item?.title ?? '').trim(),
                detail: String(item?.detail ?? '').trim(),
                kind: (['budget', 'fatigue', 'performer', 'anomaly', 'opportunity'].includes(String(item?.kind))
                    ? item?.kind
                    : 'opportunity') as AdsRecommendation['kind'],
                severity: (['info', 'warn', 'critical'].includes(String(item?.severity))
                    ? item?.severity
                    : 'info') as AdsRecommendation['severity'],
                entityName: item?.entityName ? String(item.entityName) : undefined,
            }))
            .filter((item: AdsRecommendation) => item.title && item.detail)
            .slice(0, 8);
    } catch {
        return [];
    }
}

export async function generateAdsRecommendations(params: {
    brandId?: string;
    days?: number;
    model: string;
    userApiKeys: ApiKeys;
    routeHint?: RouteHint | null;
}): Promise<{ recommendations: AdsRecommendation[]; hasData: boolean; creditsUsed?: number }> {
    const { brandId, days = 14, model, userApiKeys, routeHint } = params;

    const [current, previous] = await Promise.all([
        campaignStats(brandId, windowFor(days, 1)),
        campaignStats(brandId, windowFor(days * 2, days + 1)),
    ]);

    if (current.length === 0) {
        return { recommendations: [], hasData: false };
    }

    const session = await getSession();
    if (!session?.user?.id) throw new Error('Unauthorized');
    const creditCheck = await checkAICredits(session.user.id, model);
    if (!creditCheck.allowed) {
        throw new Error(
            creditCheck.reason === 'insufficient_credits'
                ? `Insufficient credits. You need ${creditCheck.cost} credits but have ${creditCheck.remaining}.`
                : 'No active subscription. Please subscribe to use AI features.'
        );
    }
    const usingByok = routeHint?.keySource === 'user';

    const systemMessage = `You are a performance-marketing analyst reviewing paid campaign data.
Identify the most actionable observations: budget pacing issues, creative/audience fatigue (CTR decay vs the previous period), top and bottom performers, anomalies, and opportunities.
You only RECOMMEND — never instruct automated changes; every suggestion is for a human to apply manually.

Respond with ONLY this JSON shape, no commentary:
{"recommendations": [{"title": "...", "detail": "...", "kind": "budget|fatigue|performer|anomaly|opportunity", "severity": "info|warn|critical", "entityName": "campaign name if specific"}]}

Return 3-6 recommendations, most important first. Keep each detail under 280 characters and reference concrete numbers.`;

    const prompt = `Campaign performance, last ${days} days:
${current.map(statLine).join('\n')}

Previous ${days} days (for comparison):
${previous.length ? previous.map(statLine).join('\n') : '(no data)'}`;

    const response = await generateTextWithClient({
        model,
        system: systemMessage,
        messages: [{ role: 'user', content: prompt }],
        userApiKeys,
        routeHint,
        temperature: 0.4,
    });

    await consumeAICredits(session.user.id, model, 'text', usingByok);

    return {
        recommendations: parseRecommendations(response),
        hasData: true,
        creditsUsed: creditCheck.cost,
    };
}

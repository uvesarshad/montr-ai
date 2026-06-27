import { NextRequest, NextResponse } from 'next/server';
import { parseAnalyticsSourceType, resolveAnalyticsPickerSession } from '@/lib/analytics/analytics-oauth-picker';
import { fetchGa4Properties, fetchSearchConsoleSites } from '@/lib/analytics/analytics-oauth';

/**
 * Lists the GA4 properties / Search Console sites the user can connect after OAuth.
 * GET /api/analytics/oauth/assets?platform=ga4|search_console
 */
export async function GET(request: NextRequest) {
    try {
        const sourceType = parseAnalyticsSourceType(new URL(request.url).searchParams.get('platform'));
        if (!sourceType) {
            return NextResponse.json({ error: 'Invalid analytics source' }, { status: 400 });
        }

        const resolution = await resolveAnalyticsPickerSession(sourceType);
        if (!resolution.ok) {
            return NextResponse.json({ error: resolution.error }, { status: resolution.status });
        }

        const assets = sourceType === 'ga4'
            ? await fetchGa4Properties(resolution.data.accessToken)
            : await fetchSearchConsoleSites(resolution.data.accessToken);

        return NextResponse.json({ assets });
    } catch (error) {
        console.error('Analytics OAuth assets error:', error);
        return NextResponse.json({ error: 'Failed to fetch connectable analytics sources' }, { status: 500 });
    }
}

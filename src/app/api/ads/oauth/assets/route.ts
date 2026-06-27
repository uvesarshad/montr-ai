import { NextRequest, NextResponse } from 'next/server';
import { parseAdPlatform, resolveAdsPickerSession } from '@/lib/ads/ads-oauth-picker';
import { fetchMetaAdAccounts } from '@/lib/ads/meta-ads-oauth';
import { discoverGoogleAdsAccounts } from '@/lib/ads/google-ads-oauth';

export interface AdAccountAssetDto {
    id: string;
    name: string;
    currencyCode?: string;
    timezone?: string;
    /** google_ads only — manager (MCC) accounts can be listed but not connected */
    isManager?: boolean;
    isTestAccount?: boolean;
    /** meta_ads only */
    businessName?: string;
    accountStatus?: number;
}

/**
 * Lists the ad accounts the user can connect after OAuth.
 * GET /api/ads/oauth/assets?platform=google_ads|meta_ads
 */
export async function GET(request: NextRequest) {
    try {
        const platform = parseAdPlatform(new URL(request.url).searchParams.get('platform'));
        if (!platform) {
            return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
        }

        const resolution = await resolveAdsPickerSession(platform);
        if (!resolution.ok) {
            return NextResponse.json({ error: resolution.error }, { status: resolution.status });
        }

        let assets: AdAccountAssetDto[];

        if (platform === 'meta_ads') {
            const accounts = await fetchMetaAdAccounts(resolution.data.accessToken);
            assets = accounts.map((account) => ({
                id: account.id,
                name: account.name,
                currencyCode: account.currencyCode,
                timezone: account.timezone,
                businessName: account.businessName,
                accountStatus: account.accountStatus,
            }));
        } else {
            const accounts = await discoverGoogleAdsAccounts(resolution.data.accessToken);
            assets = accounts.map((account) => ({
                id: account.id,
                name: account.name,
                currencyCode: account.currencyCode,
                timezone: account.timezone,
                isManager: account.isManager,
                isTestAccount: account.isTestAccount,
            }));
        }

        return NextResponse.json({ assets });
    } catch (error) {
        console.error('Ads OAuth assets error:', error);
        return NextResponse.json({ error: 'Failed to fetch connectable ad accounts' }, { status: 500 });
    }
}

import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';

/**
 * Lists the organization's connected ad accounts.
 * GET /api/v2/ads/accounts?brandId=xxx (brandId optional filter)
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const brandId = new URL(req.url).searchParams.get('brandId');

        const accounts = await adAccountRepository.findByOrganizationId();
        const filtered = brandId ? accounts.filter((account) => account.brandId === brandId) : accounts;

        // Encrypted token fields are select:false and never reach this payload
        return NextResponse.json({
            accounts: filtered.map((account) => ({
                _id: account._id,
                platform: account.platform,
                externalAccountId: account.externalAccountId,
                accountName: account.accountName,
                currencyCode: account.currencyCode,
                timezone: account.timezone,
                brandId: account.brandId,
                isActive: account.isActive,
                lastSyncedAt: account.lastSyncedAt,
                lastError: account.lastError,
                // google_ads only: the "Google key" for lead-form webhooks —
                // shown in Ads ▸ Leads setup, safe for org members to see
                webhookKey: account.platform === 'google_ads' ? account.webhookKey : undefined,
                createdAt: account.createdAt,
            })),
        });
    } catch (error) {
        console.error('Error listing ad accounts:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

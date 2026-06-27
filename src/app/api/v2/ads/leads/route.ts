import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { adLeadRepository } from '@/lib/db/repository/ad-lead.repository';
import type { AdPlatform } from '@/lib/db/models/ad-account.model';
import type { AdLeadStatus } from '@/lib/db/models/ad-lead.model';

function parsePlatform(value: string | null): AdPlatform | undefined {
    return value === 'google_ads' || value === 'meta_ads' ? value : undefined;
}

function parseStatus(value: string | null): AdLeadStatus | undefined {
    return value === 'received' || value === 'synced' || value === 'failed' || value === 'skipped'
        ? value
        : undefined;
}

/**
 * Lists captured ad leads with CRM mapping status.
 * GET /api/v2/ads/leads?brandId=&platform=&status=&limit=&skip=
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { searchParams } = new URL(req.url);
        const limitRaw = parseInt(searchParams.get('limit') || '50', 10);
        const skipRaw = parseInt(searchParams.get('skip') || '0', 10);

        const { leads, total } = await adLeadRepository.list({
            brandId: searchParams.get('brandId') || undefined,
            platform: parsePlatform(searchParams.get('platform')),
            status: parseStatus(searchParams.get('status')),
            limit: Number.isFinite(limitRaw) ? limitRaw : 50,
            skip: Number.isFinite(skipRaw) ? Math.max(0, skipRaw) : 0,
        });

        const statusCounts = await adLeadRepository.countByStatus();

        return NextResponse.json({
            leads: leads.map((lead) => ({
                _id: lead._id,
                platform: lead.platform,
                campaignName: lead.campaignName,
                campaignId: lead.campaignId,
                formId: lead.formId,
                email: lead.email,
                phone: lead.phone,
                firstName: lead.firstName,
                lastName: lead.lastName,
                fields: lead.fields,
                status: lead.status,
                error: lead.error,
                contactId: lead.contactId,
                isTest: lead.isTest,
                receivedAt: lead.receivedAt,
                syncedAt: lead.syncedAt,
            })),
            total,
            statusCounts,
        });
    } catch (error) {
        console.error('Error listing ad leads:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

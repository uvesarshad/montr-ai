import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { adLeadRepository } from '@/lib/db/repository/ad-lead.repository';
import { ingestAdLeadToCrm } from '@/lib/ads/crm-intake';

/**
 * Re-runs the CRM intake for a failed/skipped lead.
 * POST /api/v2/ads/leads/[id]/retry
 */
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { id } = await params;
        const lead = await adLeadRepository.findById(id);
        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        if (lead.status === 'synced') {
            return NextResponse.json({ status: 'synced', contactId: lead.contactId });
        }

        const result = await ingestAdLeadToCrm(lead);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error retrying ad lead:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import MarketingCampaign from '@/lib/db/models/marketing-email/campaign.model';

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();

        const campaign = await MarketingCampaign.findOne({
            _id: params.id
        });

        if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

        if (campaign.status !== 'sending' && campaign.status !== 'scheduled') {
            return NextResponse.json({ error: 'Campaign is not active' }, { status: 400 });
        }

        campaign.status = 'paused';
        await campaign.save();

        return NextResponse.json({ success: true, status: campaign.status });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

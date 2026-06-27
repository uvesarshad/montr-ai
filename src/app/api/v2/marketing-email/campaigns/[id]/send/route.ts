
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import MarketingCampaign from '@/lib/db/models/marketing-email/campaign.model';
import { scheduleCampaignProcessing } from '@/lib/marketing-email/jobs/campaign-processor.job';

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

        if (campaign.status !== 'draft' && campaign.status !== 'scheduled' && campaign.status !== 'paused' && campaign.status !== 'failed') {
            return NextResponse.json({ error: 'Campaign is already processing or completed' }, { status: 400 });
        }

        if (!campaign.templateId || !campaign.providerId) {
            return NextResponse.json({ error: 'Campaign missing template or provider' }, { status: 400 });
        }

        campaign.status = 'scheduled'; // Will change to 'sending' when processor picks it up
        campaign.scheduledAt = new Date(); // Send now
        await campaign.save();

        // Trigger job
        await scheduleCampaignProcessing(campaign._id.toString());

        return NextResponse.json({ success: true, status: campaign.status });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

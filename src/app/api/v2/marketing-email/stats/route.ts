
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import MarketingCampaign from '@/lib/db/models/marketing-email/campaign.model';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();
        const { searchParams } = new URL(req.url);
        const campaignId = searchParams.get('campaignId');

        if (campaignId) {
            // Detailed stats for a single campaign
            const campaign = await MarketingCampaign.findOne({
                _id: campaignId
            });

            if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

            return NextResponse.json(campaign.stats);
        } else {
            // Overall dashboard stats
            const campaigns = await MarketingCampaign.find({
});

            // Aggregate stats
            const stats = {
                totalSent: 0,
                totalOpened: 0,
                totalClicked: 0,
                recentCampaigns: campaigns.slice(0, 5) // Last 5
            };

            campaigns.forEach(c => {
                stats.totalSent += c.stats?.sent || 0;
                stats.totalOpened += c.stats?.opened || 0;
                stats.totalClicked += c.stats?.clicked || 0;
            });

            return NextResponse.json(stats);
        }

    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

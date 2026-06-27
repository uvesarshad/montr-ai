
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import MarketingCampaign from '@/lib/db/models/marketing-email/campaign.model';
import { updateMarketingCampaignSchema } from '@/validations/marketing-email/campaign.schema';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();
        const campaign = await MarketingCampaign.findOne({
            _id: params.id
        }).populate('templateId').populate('providerId');

        if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

        return NextResponse.json(campaign);
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const validated = updateMarketingCampaignSchema.safeParse(body);
        if (!validated.success) return NextResponse.json({ error: validated.error.flatten() }, { status: 400 });

        await connectDB();

        // Check status transition validity if status is changing
        // e.g. cannot edit if sending

        const campaign = await MarketingCampaign.findOneAndUpdate(
            { _id: params.id },
            { ...validated.data },
            { new: true }
        );

        if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

        return NextResponse.json(campaign);
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();
        const campaign = await MarketingCampaign.findOneAndDelete({
            _id: params.id,
            status: { $in: ['draft', 'failed', 'cancelled', 'completed'] } // Prevent deleting active campaigns?
        });

        if (!campaign) return NextResponse.json({ error: 'Campaign not found or cannot be deleted' }, { status: 404 });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

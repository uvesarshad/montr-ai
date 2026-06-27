import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';

// GET - Get campaign details
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const campaign = await whatsappCampaignRepository.findById(params.id);

        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        // Verify ownership
        return NextResponse.json({ campaign });
    } catch (error) {
        console.error('Error fetching campaign:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// PATCH - Update campaign
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const campaign = await whatsappCampaignRepository.findById(params.id);

        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        // Verify ownership
        const body = await req.json();

        // Only allow updating certain fields
        const allowedUpdates = ['name', 'status', 'scheduledAt'];
        const updates: Record<string, unknown> = {};

        for (const key of allowedUpdates) {
            if (body[key] !== undefined) {
                updates[key] = body[key];
            }
        }

        const updatedCampaign = await whatsappCampaignRepository.update(params.id, updates);

        return NextResponse.json({ campaign: updatedCampaign });
    } catch (error) {
        console.error('Error updating campaign:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// DELETE - Delete campaign
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const campaign = await whatsappCampaignRepository.findById(params.id);

        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        // Verify ownership
        // Don't allow deleting campaigns that are processing
        if (campaign.status === 'processing') {
            return NextResponse.json(
                { error: 'Cannot delete campaign that is currently processing' },
                { status: 400 }
            );
        }

        await whatsappCampaignRepository.delete(params.id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting campaign:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

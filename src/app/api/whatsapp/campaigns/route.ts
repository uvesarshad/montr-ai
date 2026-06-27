import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { whatsappTemplateRepository } from '@/lib/db/repository/whatsapp-template.repository';

// GET - List campaigns
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = req.nextUrl.searchParams;
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');

        const campaigns = await whatsappCampaignRepository.findByOrganizationId(
            limit,
            offset
        );

        return NextResponse.json({ campaigns });
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// POST - Create campaign
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check plan limit before creating campaign
        const { checkPlanLimit } = await import('@/lib/plan-enforcement');
        const canCreate = await checkPlanLimit(session.user.id!, 'whatsapp_campaigns', 'maxWhatsAppCampaigns');

        if (!canCreate.allowed) {
            return NextResponse.json({
                error: 'Plan limit reached',
                message: canCreate.message,
                current: canCreate.current,
                limit: canCreate.limit,
                upgradeRequired: true
            }, { status: 403 });
        }

        const {
            name,
            accountId,
            templateId,
            audienceType,
            audienceFilter,
            scheduledAt,
        } = await req.json();

        // Validate required fields
        if (!name || !accountId || !templateId || !audienceType) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Verify account and template belong to organization
        const account = await whatsappAccountRepository.findById(accountId);
        if (!account) {
            return NextResponse.json({ error: 'Invalid account' }, { status: 400 });
        }

        const template = await whatsappTemplateRepository.findById(templateId);
        if (!template) {
            return NextResponse.json({ error: 'Invalid template' }, { status: 400 });
        }

        // Create campaign
        const campaign = await whatsappCampaignRepository.create({
            whatsappAccountId: accountId,
            templateId,
            name,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
            audienceType,
            audienceFilter,
            createdById: session.user.id,
        });

        // Enqueue campaign if scheduled for now or past
        const { enqueueWhatsAppCampaign } = await import('@/lib/queue/whatsapp-queue');

        if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
            await enqueueWhatsAppCampaign(campaign._id.toString());
            console.log(`Enqueued campaign ${campaign._id} for immediate processing`);
        }

        return NextResponse.json({ campaign }, { status: 201 });
    } catch (error) {
        console.error('Error creating campaign:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

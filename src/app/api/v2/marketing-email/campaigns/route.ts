
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import MarketingCampaign from '@/lib/db/models/marketing-email/campaign.model';
import { createMarketingCampaignSchema } from '@/validations/marketing-email/campaign.schema';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const status = searchParams.get('status');
        const search = searchParams.get('search');

        const query: Record<string, unknown> = { };

        if (status) {
            query.status = status;
        }

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        const campaigns = await MarketingCampaign.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('templateId', 'name')
            .populate('providerId', 'name type');

        const total = await MarketingCampaign.countDocuments(query);

        return NextResponse.json({
            data: campaigns,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const validated = createMarketingCampaignSchema.safeParse(body);

        if (!validated.success) {
            return NextResponse.json({ error: validated.error.flatten() }, { status: 400 });
        }

        await connectDB();

        const campaign = await MarketingCampaign.create({
            ...validated.data,
            createdById: session.user.id,
            status: 'draft',
        });

        return NextResponse.json(campaign, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

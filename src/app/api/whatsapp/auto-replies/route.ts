import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappAutoReplyRepository } from '@/lib/db/repository/whatsapp-auto-reply.repository';

/**
 * GET /api/whatsapp/auto-replies
 * List all auto-replies for the organization
 */
export async function GET(_req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const autoReplies = await whatsappAutoReplyRepository.findByOrganization(
);

        return NextResponse.json({ autoReplies });
    } catch (error) {
        console.error('Error fetching auto-replies:', error);
        return NextResponse.json(
            { error: 'Failed to fetch auto-replies' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/whatsapp/auto-replies
 * Create a new auto-reply
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { whatsappAccountId, name, trigger, conditions, response, priority } = body;

        if (!whatsappAccountId || !name || !trigger || !response) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const autoReply = await whatsappAutoReplyRepository.create({
            whatsappAccountId,
            name,
            trigger,
            conditions,
            response,
            priority: priority || 0,
            createdById: session.user.id,
        });

        return NextResponse.json({ autoReply }, { status: 201 });
    } catch (error) {
        console.error('Error creating auto-reply:', error);
        return NextResponse.json(
            { error: 'Failed to create auto-reply' },
            { status: 500 }
        );
    }
}

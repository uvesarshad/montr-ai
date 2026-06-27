import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { inboxService } from '@/lib/inbox/inbox.service';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import { Types } from 'mongoose';

/**
 * GET /api/inbox/channels
 * List all inbox channels for the organization
 */
export async function GET(_req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const channels = await InboxChannel.find({
}).sort({ createdAt: -1 });

        return NextResponse.json({ channels });
    } catch (error) {
        console.error('Error fetching inbox channels:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

/**
 * POST /api/inbox/channels
 * Create a new inbox channel
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, channelType, config } = body;

        if (!name || !channelType || !config) {
            return NextResponse.json(
                { error: 'Missing required fields: name, channelType, config' },
                { status: 400 }
            );
        }

        const channel = await inboxService.createChannel({
            name,
            channelType,
            config,
            createdById: new Types.ObjectId(session.user.id!),
        });

        return NextResponse.json({ channel }, { status: 201 });
    } catch (error) {
        console.error('Error creating inbox channel:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

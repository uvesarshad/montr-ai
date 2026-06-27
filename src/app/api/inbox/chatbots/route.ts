import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';

import InboxChannel from '@/lib/db/models/inbox-channel.model';
import { buildCreateChatbotPayload, buildChatbotWidgetToken } from '@/lib/inbox/chatbots';

interface SessionUser {
    id?: string;
}

/**
 * GET /api/inbox/chatbots
 * List all website chatbot channels
 */
export async function GET() {
    try {
        await dbConnect();
        const session = await getSession();
        const user = session?.user as SessionUser | undefined;

        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const chatbots = await InboxChannel.find({
            channelType: 'website',
        }).sort({ createdAt: -1 });

        return NextResponse.json({ chatbots });
    } catch (error: unknown) {
        console.error('Error fetching chatbots:', error);
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/inbox/chatbots
 * Create a new chatbot
 */
export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const session = await getSession();
        const user = session?.user as SessionUser | undefined;

        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const payload = buildCreateChatbotPayload(
            body,
            user.id,
        );

        // Generate a separate staging token for testing before going live
        const chatbot = await InboxChannel.create({
            ...payload,
            config: {
                ...payload.config,
                stagingWidgetToken: buildChatbotWidgetToken(),
                deploymentStatus: 'live',
            },
        });

        return NextResponse.json({ chatbot }, { status: 201 });
    } catch (error: unknown) {
        console.error('Error creating chatbot:', error);
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: message }, { status: message === 'Chatbot name is required' ? 400 : 500 });
    }
}

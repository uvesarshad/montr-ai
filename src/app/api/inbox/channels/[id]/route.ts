import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import { Types } from 'mongoose';

interface SessionUser {
}

/**
 * GET /api/inbox/channels/[id]
 * Get a single inbox channel
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        await dbConnect();
        const session = await getSession();
        const user = session?.user as SessionUser | undefined;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const channel = await InboxChannel.findOne({
            _id: new Types.ObjectId(params.id)
        });

        if (!channel) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        return NextResponse.json({ channel });
    } catch (error: unknown) {
        console.error('Error fetching inbox channel:', error);
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * PATCH /api/inbox/channels/[id]
 * Update an inbox channel
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        await dbConnect();
        const session = await getSession();
        const user = session?.user as SessionUser | undefined;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, config, isActive } = body;

        const channel = await InboxChannel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(params.id)
            },
            {
                ...(name && { name }),
                ...(config && { config }),
                ...(isActive !== undefined && { isActive }),
            },
            { new: true }
        );

        if (!channel) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        return NextResponse.json({ channel });
    } catch (error: unknown) {
        console.error('Error updating inbox channel:', error);
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * DELETE /api/inbox/channels/[id]
 * Delete an inbox channel
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        await dbConnect();
        const session = await getSession();
        const user = session?.user as SessionUser | undefined;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const channel = await InboxChannel.findOneAndDelete({
            _id: new Types.ObjectId(params.id)
        });

        if (!channel) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('Error deleting inbox channel:', error);
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

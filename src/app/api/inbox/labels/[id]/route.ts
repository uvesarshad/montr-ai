import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import InboxLabel from '@/lib/db/models/inbox-label.model';
import { Types } from 'mongoose';

/**
 * PATCH /api/inbox/labels/[id]
 * Update a label
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, color, description } = body;

        const label = await InboxLabel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(params.id)
            },
            {
                ...(name && { name }),
                ...(color && { color }),
                ...(description !== undefined && { description }),
            },
            { new: true }
        );

        if (!label) {
            return NextResponse.json({ error: 'Label not found' }, { status: 404 });
        }

        return NextResponse.json({ label });
    } catch (error) {
        console.error('Error updating label:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

/**
 * DELETE /api/inbox/labels/[id]
 * Delete a label
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const label = await InboxLabel.findOneAndDelete({
            _id: new Types.ObjectId(params.id)
        });

        if (!label) {
            return NextResponse.json({ error: 'Label not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting label:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

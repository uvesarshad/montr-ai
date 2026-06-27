import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappAutoReplyRepository } from '@/lib/db/repository/whatsapp-auto-reply.repository';

/**
 * GET /api/whatsapp/auto-replies/[id]
 * Get a specific auto-reply
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const autoReply = await whatsappAutoReplyRepository.findById(params.id);

        if (!autoReply) {
            return NextResponse.json({ error: 'Auto-reply not found' }, { status: 404 });
        }

        // Verify ownership
        return NextResponse.json({ autoReply });
    } catch (error) {
        console.error('Error fetching auto-reply:', error);
        return NextResponse.json(
            { error: 'Failed to fetch auto-reply' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/whatsapp/auto-replies/[id]
 * Update an auto-reply
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const autoReply = await whatsappAutoReplyRepository.findById(params.id);

        if (!autoReply) {
            return NextResponse.json({ error: 'Auto-reply not found' }, { status: 404 });
        }

        // Verify ownership
        const body = await req.json();
        const updated = await whatsappAutoReplyRepository.update(params.id, body);

        return NextResponse.json({ autoReply: updated });
    } catch (error) {
        console.error('Error updating auto-reply:', error);
        return NextResponse.json(
            { error: 'Failed to update auto-reply' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/whatsapp/auto-replies/[id]
 * Delete an auto-reply
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const autoReply = await whatsappAutoReplyRepository.findById(params.id);

        if (!autoReply) {
            return NextResponse.json({ error: 'Auto-reply not found' }, { status: 404 });
        }

        // Verify ownership
        await whatsappAutoReplyRepository.delete(params.id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting auto-reply:', error);
        return NextResponse.json(
            { error: 'Failed to delete auto-reply' },
            { status: 500 }
        );
    }
}

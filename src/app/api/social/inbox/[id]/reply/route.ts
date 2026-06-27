/**
 * Social inbox reply (Epic 3).
 *
 * POST /api/social/inbox/[id]/reply  body: { text: string }
 *   → posts a reply to the interaction via the platform API and marks it replied.
 *
 * Access: the interaction is loaded, its brandId verified via
 * `assertBrandAccess`, and the org cross-checked before any outbound call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import {
    assertBrandAccess,
    BrandAccessError,
    brandAccessErrorResponse,
} from '@/lib/social/brand-access';
import { socialInteractionRepository } from '@/lib/db/repository/social-interaction.repository';
import { replyToInteraction, ReplyNotSupportedError } from '@/lib/social/inbox';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        let body: { text?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const text = (body?.text || '').trim();
        if (!text) {
            return NextResponse.json({ error: 'text is required' }, { status: 400 });
        }

        const interaction = await socialInteractionRepository.findById(id);
        if (!interaction) {
            return NextResponse.json({ error: 'Interaction not found' }, { status: 404 });
        }

        await assertBrandAccess(session.user.id, interaction.brandId);
        const result = await replyToInteraction(id, text, session.user.id);

        return NextResponse.json({
            interaction: result.interaction,
            externalReplyId: result.externalReplyId,
        });
    } catch (error) {
        if (error instanceof BrandAccessError) {
            return brandAccessErrorResponse(error);
        }
        if (error instanceof ReplyNotSupportedError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const message = error instanceof Error ? error.message : 'Failed to send reply';
        console.error('[social.inbox] reply error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

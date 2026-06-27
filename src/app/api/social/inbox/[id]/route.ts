/**
 * Social inbox item actions (Epic 3).
 *
 * PATCH /api/social/inbox/[id]  body: { action: 'read' | 'archive' }
 *
 * Access: the interaction is loaded, then its brandId is run through
 * `assertBrandAccess` against the session user so a caller can only mutate
 * interactions in a brand they own / share. organizationId is re-derived and
 * cross-checked against the stored interaction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import {
    assertBrandAccess,
    BrandAccessError,
    brandAccessErrorResponse,
} from '@/lib/social/brand-access';
import { socialInteractionRepository } from '@/lib/db/repository/social-interaction.repository';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        let body: { action?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const action = body?.action;
        if (action !== 'read' && action !== 'archive') {
            return NextResponse.json(
                { error: "action must be 'read' or 'archive'" },
                { status: 400 }
            );
        }

        const interaction = await socialInteractionRepository.findById(id);
        if (!interaction) {
            return NextResponse.json({ error: 'Interaction not found' }, { status: 404 });
        }

        // Verify the caller can access the interaction's brand (and re-derive org).
        await assertBrandAccess(session.user.id, interaction.brandId);
        const updated =
            action === 'read'
                ? await socialInteractionRepository.markRead(id)
                : await socialInteractionRepository.archive(id);

        return NextResponse.json({ interaction: updated });
    } catch (error) {
        if (error instanceof BrandAccessError) {
            return brandAccessErrorResponse(error);
        }
        console.error('[social.inbox] PATCH error:', error);
        return NextResponse.json({ error: 'Failed to update interaction' }, { status: 500 });
    }
}

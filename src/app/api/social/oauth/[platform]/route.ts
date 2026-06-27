import { NextRequest, NextResponse } from 'next/server';
import { initiateSocialOAuth } from '@/lib/social/oauth/engine';
import { getSession } from '@/lib/get-session';

/**
 * Generic social OAuth initiation — serves every platform registered in
 * src/lib/social/oauth/platforms/. Static sibling directories (telegram's
 * bot-token POST, the meta asset-selector sub-routes) take precedence over
 * this dynamic segment, so they are unaffected.
 *
 * GET /api/social/oauth/[platform]?brandId=…(&type=…&source=…)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    // Require an authenticated session before starting an OAuth dance (audit
    // C7). The callback already authenticates (engine.ts) and binds the
    // connection to the session user; guarding initiate too prevents anonymous
    // requests from spending state cookies / hitting provider auth URLs.
    const session = await getSession();
    if (!(session?.user as { id?: string } | undefined)?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { platform } = await params;
    return initiateSocialOAuth(platform, request);
}

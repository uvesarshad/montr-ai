import { NextRequest } from 'next/server';
import { handleSocialOAuthCallback } from '@/lib/social/oauth/engine';

/**
 * Generic social OAuth callback — the redirect URI registered with every
 * provider keeps its per-platform path, served by this dynamic segment.
 *
 * GET /api/social/oauth/[platform]/callback?code=…&state=…
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    const { platform } = await params;
    return handleSocialOAuthCallback(platform, request);
}

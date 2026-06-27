import { NextRequest, NextResponse } from 'next/server';

import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import { loadCallSessionOrFail, requireOrgUser } from '@/lib/voice/api-helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v2/voice/calls/[id]/recording — proxied download.
 *
 * The stored `recordingUrl` points to MontrAI's storage. This handler proxies
 * the byte stream so the client doesn't need direct credentials to the
 * storage layer.
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  const session = await loadCallSessionOrFail(id);
  if (session instanceof NextResponse) return session;

  if (!session.recordingUrl) {
    return NextResponse.json({ error: 'No recording available' }, { status: 404 });
  }

  try {
    const upstream = await safeOutboundFetch(session.recordingUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch recording', status: upstream.status },
        { status: 502 },
      );
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type') ?? 'audio/mpeg';
    headers.set('content-type', contentType);
    headers.set('content-disposition', `inline; filename="${id}.mp3"`);
    headers.set('cache-control', 'private, max-age=3600');
    headers.set('content-length', buffer.byteLength.toString());

    return new Response(buffer, { status: 200, headers });
  } catch (error) {
    console.error('recording fetch failed:', error);
    return NextResponse.json(
      { error: 'Recording fetch failed' },
      { status: 502 },
    );
  }
}

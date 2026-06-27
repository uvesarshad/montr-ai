import { NextRequest, NextResponse } from 'next/server';

import { callTranscriptRepository } from '@/lib/db/repository/voice';
import { loadCallSessionOrFail, requireOrgUser } from '@/lib/voice/api-helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  const session = await loadCallSessionOrFail(id);
  if (session instanceof NextResponse) return session;

  const transcript = await callTranscriptRepository.findByCallSessionId(
    id
  );
  if (!transcript) {
    return NextResponse.json(
      {
        error: 'No transcript available',
        message:
          session.status === 'completed'
            ? 'Transcription may still be in progress.'
            : 'Transcripts are generated after the call completes.',
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ transcript });
}

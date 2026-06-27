import { NextRequest, NextResponse } from 'next/server';

import { callSessionRepository } from '@/lib/db/repository/voice';
import {
  loadCallSessionOrFail,
  requireOrgUser,
  resolveProviderForSession,
} from '@/lib/voice/api-helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, ctx: Ctx) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  const session = await loadCallSessionOrFail(id);
  if (session instanceof NextResponse) return session;

  if (!session.providerCallId) {
    return NextResponse.json(
      { error: 'Call has not started yet — nothing to hang up' },
      { status: 409 },
    );
  }

  const selection = await resolveProviderForSession(session, authResult.userId);
  if (!selection) {
    return NextResponse.json(
      { error: 'Provider credential no longer available' },
      { status: 502 },
    );
  }

  try {
    await selection.provider.hangup(session.providerCallId, selection.credential);
    const updated = await callSessionRepository.updateStatus(id, {
      status: 'completed',
      endedAt: new Date(),
      endReason: 'hangup_by_caller',
    });
    return NextResponse.json({ ok: true, call: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider error';
    console.error('hangup failed:', error);
    return NextResponse.json(
      { error: 'Hangup failed', message },
      { status: 502 },
    );
  }
}

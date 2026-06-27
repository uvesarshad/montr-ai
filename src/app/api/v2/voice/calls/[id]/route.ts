import { NextRequest, NextResponse } from 'next/server';

import { callSessionRepository, callTranscriptRepository } from '@/lib/db/repository/voice';
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

  return NextResponse.json({ call: session, transcript });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  // Soft-delete: mark cancelled, keep row for audit. We don't actually delete
  // call sessions — they're auditable artifacts of customer comms.
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  const session = await loadCallSessionOrFail(id);
  if (session instanceof NextResponse) return session;

  if (session.status === 'completed' || session.status === 'cancelled') {
    return NextResponse.json({ ok: true, alreadyTerminal: true });
  }

  const updated = await callSessionRepository.updateStatus(id, {
    status: 'cancelled',
    endedAt: new Date(),
    endReason: 'cancelled',
  });
  return NextResponse.json({ ok: true, call: updated });
}

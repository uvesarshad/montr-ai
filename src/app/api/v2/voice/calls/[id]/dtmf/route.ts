import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  loadCallSessionOrFail,
  requireOrgUser,
  resolveProviderForSession,
} from '@/lib/voice/api-helpers';
import { sendDtmfSchema } from '@/validations/voice/call.schema';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  const session = await loadCallSessionOrFail(id);
  if (session instanceof NextResponse) return session;

  if (!session.providerCallId) {
    return NextResponse.json(
      { error: 'Call has not started yet' },
      { status: 409 },
    );
  }

  try {
    const input = sendDtmfSchema.parse(await request.json());
    const selection = await resolveProviderForSession(session, authResult.userId);
    if (!selection) {
      return NextResponse.json(
        { error: 'Provider credential no longer available' },
        { status: 502 },
      );
    }
    await selection.provider.sendDTMF(
      { providerCallId: session.providerCallId, digits: input.digits },
      selection.credential,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : 'Provider error';
    console.error('sendDTMF failed:', error);
    return NextResponse.json(
      { error: 'Send DTMF failed', message },
      { status: 502 },
    );
  }
}

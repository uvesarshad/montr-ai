import { NextRequest, NextResponse } from 'next/server';

import { voicePhoneNumberRepository } from '@/lib/db/repository/voice';
import { requireOrgUser } from '@/lib/voice/api-helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  const number = await voicePhoneNumberRepository.findById(id);
  if (!number) {
    return NextResponse.json({ error: 'Number not found' }, { status: 404 });
  }
  return NextResponse.json({ data: number });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  const released = await voicePhoneNumberRepository.release(id);
  if (!released) {
    return NextResponse.json({ error: 'Number not found' }, { status: 404 });
  }
  // TODO: actually call provider.releaseNumber once the interface adds it.
  // For now, marking as released in our DB is enough to stop routing.
  return NextResponse.json({ data: released });
}

/**
 * User-scoped voice provider config PATCH/DELETE.
 *
 * Users can toggle or delete their own BYOK credentials. Cross-user access
 * is denied — we check ownership before mutating.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { voiceProviderConfigRepository } from '@/lib/db/repository/voice';
import { requireOrgUser } from '@/lib/voice/api-helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

async function loadUserConfig(id: string, userId: string) {
  const doc = await voiceProviderConfigRepository.findById(id);
  if (!doc) return null;
  if (doc.scope !== 'user') return null;
  if (!doc.userId || doc.userId.toString() !== userId) return null;
  return doc;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const existing = await loadUserConfig(id, authResult.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json()) as { enabled?: boolean };
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Only `enabled` toggle supported' },
      { status: 400 },
    );
  }
  const updated = await voiceProviderConfigRepository.setEnabled(id, body.enabled);
  return NextResponse.json({ data: { _id: updated?._id, enabled: updated?.enabled } });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const existing = await loadUserConfig(id, authResult.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ok = await voiceProviderConfigRepository.deleteById(id);
  return NextResponse.json({ ok });
}

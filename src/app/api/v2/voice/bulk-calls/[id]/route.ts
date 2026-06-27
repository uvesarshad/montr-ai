import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { requireOrgUser } from '@/lib/voice/api-helpers';
import VoiceBulkBatch from '@/lib/db/models/voice/voice-bulk-batch.model';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const auth = await requireOrgUser();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const batch = await VoiceBulkBatch.findOne({
    _id: id
  }).exec();
  if (!batch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ data: batch });
}

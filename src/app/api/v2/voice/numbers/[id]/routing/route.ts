import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { voicePhoneNumberRepository } from '@/lib/db/repository/voice';
import { requireOrgUser } from '@/lib/voice/api-helpers';
import { inboundRoutingSchema } from '@/validations/voice/phone-number.schema';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const input = inboundRoutingSchema.parse(await request.json());
    const { id } = await ctx.params;
    const updated = await voicePhoneNumberRepository.setInboundRouting(
      id,
      input,
    );
    if (!updated) {
      return NextResponse.json({ error: 'Number not found' }, { status: 404 });
    }
    return NextResponse.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.errors },
        { status: 400 },
      );
    }
    console.error('routing update failed:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

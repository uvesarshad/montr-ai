import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/get-session';
import { delegateAction } from '@/lib/agent/hitl-gateway';

const bodySchema = z.object({
  delegateTo: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    const action = await delegateAction(id, body.delegateTo, userId, { });
    if (!action) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    return NextResponse.json({ approval: action });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error delegating agent action:', error);
    return NextResponse.json({ error: 'Failed to delegate action' }, { status: 500 });
  }
}

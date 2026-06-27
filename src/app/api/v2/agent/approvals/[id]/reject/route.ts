import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import { rejectAction } from '@/lib/agent/hitl-gateway';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason : undefined;

    // Scope to caller's org+user so a user can only reject their own pending actions.
    const action = await rejectAction(id, userId, reason, { userId });

    if (!action) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    return NextResponse.json({ approval: action });
  } catch (error) {
    console.error('Error rejecting agent action:', error);
    return NextResponse.json({ error: 'Failed to reject action' }, { status: 500 });
  }
}

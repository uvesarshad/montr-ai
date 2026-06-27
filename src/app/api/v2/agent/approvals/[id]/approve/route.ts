import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import { approveAction } from '@/lib/agent/hitl-gateway';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const { id } = await params;
    // Scope to caller's org+user so an attacker cannot approve another user's
    // (or another org's) pending action by guessing its ObjectId.
    const action = await approveAction(id, userId, { userId });

    if (!action) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    return NextResponse.json({ approval: action });
  } catch (error) {
    console.error('Error approving agent action:', error);
    return NextResponse.json({ error: 'Failed to approve action' }, { status: 500 });
  }
}

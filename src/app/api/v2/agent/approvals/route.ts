import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import { getPendingActions } from '@/lib/agent/hitl-gateway';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get('missionId') || undefined;
    const brandId = searchParams.get('brandId') || undefined;

    const actions = await getPendingActions(session.user.id!, missionId, brandId);
    return NextResponse.json({ approvals: actions });
  } catch (error) {
    console.error('Error fetching agent approvals:', error);
    return NextResponse.json({ error: 'Failed to fetch agent approvals' }, { status: 500 });
  }
}

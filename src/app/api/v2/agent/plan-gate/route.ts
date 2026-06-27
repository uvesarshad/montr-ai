import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { checkAgentGate } from '@/lib/agent/plan-gate';

/**
 * GET /api/v2/agent/plan-gate
 * Returns the agent plan-gate result for the current user.
 * Used by the agent settings page to show plan limits.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await checkAgentGate({ userId: session.user.id });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check plan gate' },
      { status: 500 }
    );
  }
}

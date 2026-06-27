import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { terminateMission } from '@/lib/agent/mission-budget';

function getOrganizationId(session: { user?: { id?: string; } } | null) {
  return session?.user?.id || session?.user?.id || '';
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id!;

    const mission = await agentMissionRepository.findById(id, userId);
    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    if (mission.status === 'completed' || mission.status === 'blocked') {
      return NextResponse.json({
        success: true,
        alreadyTerminated: true,
        status: mission.status,
        terminatedReason: mission.terminatedReason,
      });
    }

    await terminateMission(
      { _id: mission.id, brandId: mission.brandId, userId },
      mission.id,
      'manual_kill',
      'Mission stopped by user',
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error killing agent mission:', error);
    return NextResponse.json({ error: 'Failed to kill mission' }, { status: 500 });
  }
}

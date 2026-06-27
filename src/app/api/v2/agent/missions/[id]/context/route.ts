import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import { buildMissionContextSummary } from '@/lib/agent/mission-context';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import PendingAgentAction from '@/lib/db/models/pending-agent-action.model';
import AgentScheduledTask from '@/lib/db/models/agent-scheduled-task.model';
import { connectMongoose } from '@/lib/mongodb';

function getOrganizationId(session: { user?: { id?: string; } } | null) {
  return session?.user?.id || session?.user?.id || '';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id!;

    await connectMongoose();

    const mission = await agentMissionRepository.findById(id, userId);
    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    const [approvals, scheduledTasks, links] = await Promise.all([
      PendingAgentAction.find({
        userId,
        missionId: id,
      })
        .sort({ createdAt: -1 })
        .lean(),
      AgentScheduledTask.find({
        userId,
        missionId: id,
      })
        .sort({ nextRunAt: 1 })
        .lean(),
      agentMissionRepository.listLinks(id, userId),
    ]);

    const summary = buildMissionContextSummary({
      missionStatus: mission.status,
      approvals: approvals.map((approval) => ({
        _id: approval._id.toString(),
        toolName: approval.toolName,
        toolDescription: approval.toolDescription,
        status: approval.status,
        createdAt: approval.createdAt,
        expiresAt: approval.expiresAt,
      })),
      scheduledTasks: scheduledTasks.map((task) => ({
        _id: task._id.toString(),
        name: task.name,
        description: task.description,
        status: task.status,
        nextRunAt: task.nextRunAt,
      })),
      links: links.map((link) => ({
        _id: link._id.toString(),
        targetType: link.targetType,
        targetId: link.targetId,
        targetLabel: link.targetLabel || undefined,
        targetRoute: link.targetRoute || undefined,
      })),
    });

    return NextResponse.json({
      summary,
      approvals,
      scheduledTasks,
    });
  } catch (error) {
    console.error('Error fetching mission context:', error);
    return NextResponse.json({ error: 'Failed to fetch mission context' }, { status: 500 });
  }
}

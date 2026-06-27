import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/get-session';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { AgentMissionStatus } from '@/lib/db/models/agent-mission.model';
import { checkAgentGate } from '@/lib/agent/plan-gate';

const createMissionSchema = z.object({
  brandId: z.string().min(1).optional(),
  title: z.string().min(1).max(160).optional(),
  summary: z.string().min(1).max(400).optional(),
  status: z.enum(['draft', 'active', 'waiting', 'scheduled', 'blocked', 'completed']).optional(),
  mode: z.enum(['mixed', 'approval-first', 'autonomous', 'watch', 'autopilot']).optional(),
});

const missionStatuses: AgentMissionStatus[] = ['draft', 'active', 'waiting', 'scheduled', 'blocked', 'completed'];

function getOrganizationId(session: { user?: { id?: string; } } | null) {
  return session?.user?.id || session?.user?.id || '';
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id!;
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId') || undefined;
    const search = searchParams.get('search') || undefined;
    const statusParam = searchParams.get('status');
    const limit = searchParams.get('limit') ? Number.parseInt(searchParams.get('limit') || '', 10) : 50;
    const offset = searchParams.get('offset') ? Number.parseInt(searchParams.get('offset') || '', 10) : 0;

    const statuses = missionStatuses.filter((status) =>
      statusParam
        ? statusParam.split(',').map((value) => value.trim()).includes(status)
        : false
    );

    const [missions, statusCounts] = await Promise.all([
      agentMissionRepository.findByUserContext(userId, {
        brandId,
        search,
        statuses: statuses.length > 0 ? statuses : undefined,
        limit,
        offset,
      }),
      Promise.all([
        agentMissionRepository.countByUserContext(userId, { brandId, search }),
        ...missionStatuses.map((status) =>
          agentMissionRepository.countByUserContext(userId, {
            brandId,
            search,
            statuses: [status],
          })
        ),
      ]),
    ]);

    const [allCount, ...specificCounts] = statusCounts;

    return NextResponse.json({
      missions: missions.map((mission) => ({
        _id: mission._id.toString(),
        title: mission.title,
        summary: mission.summary,
        status: mission.status,
        mode: mission.mode,
        brandId: mission.brandId,
        activeAgentId: mission.activeAgentId,
        currentSessionId: mission.currentSessionId,
        messageCount: mission.messageCount,
        eventCount: mission.eventCount,
        lastActivityAt: mission.lastActivityAt,
        createdAt: mission.createdAt,
        updatedAt: mission.updatedAt,
      })),
      count: missions.length,
      total: allCount,
      statusCounts: missionStatuses.reduce<Record<string, number>>((accumulator, status, index) => {
        accumulator[status] = specificCounts[index] || 0;
        return accumulator;
      }, {}),
    });
  } catch (error) {
    console.error('Error fetching agent missions:', error);
    return NextResponse.json({ error: 'Failed to fetch agent missions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validatedData = createMissionSchema.parse(await request.json());
    const userId = session.user.id!;

    const gate = await checkAgentGate({ userId });
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason ?? 'Agent features not available on your plan.' }, { status: 403 });
    }

    const mission = await agentMissionRepository.create({
      userId,
      brandId: validatedData.brandId || 'default-brand-id',
      title: validatedData.title,
      summary: validatedData.summary,
      status: validatedData.status,
      mode: validatedData.mode,
    });

    return NextResponse.json(mission, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    console.error('Error creating agent mission:', error);
    return NextResponse.json({ error: 'Failed to create agent mission' }, { status: 500 });
  }
}

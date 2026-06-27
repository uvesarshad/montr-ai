import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/get-session';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { onMissionComplete } from '@/lib/agent/mission-lifecycle';

const updateMissionSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  summary: z.string().min(1).max(400).optional(),
  status: z.enum(['draft', 'active', 'waiting', 'scheduled', 'blocked', 'completed']).optional(),
  mode: z.enum(['mixed', 'approval-first', 'autonomous', 'watch', 'autopilot']).optional(),
});

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

    const [mission, events, links] = await Promise.all([
      agentMissionRepository.findById(id, userId),
      agentMissionRepository.listEvents(id, userId),
      agentMissionRepository.listLinks(id, userId),
    ]);

    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    const subMissions = await agentMissionRepository.findByParentId(id);

    return NextResponse.json({
      mission,
      events,
      links,
      subMissions,
    });
  } catch (error) {
    console.error('Error fetching agent mission:', error);
    return NextResponse.json({ error: 'Failed to fetch agent mission' }, { status: 500 });
  }
}

export async function DELETE(
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

    const mission = await agentMissionRepository.delete(id, userId);
    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent mission:', error);
    return NextResponse.json({ error: 'Failed to delete mission' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const validatedData = updateMissionSchema.parse(await request.json());
    const organizationId = getOrganizationId(session);
    const userId = session.user.id!;

    const mission = await agentMissionRepository.update(id, userId, validatedData);
    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    // Fire lifecycle hooks asynchronously when mission completes.
    if (validatedData.status === 'completed') {
      onMissionComplete(id, organizationId).catch(() => {/* swallowed */});
    }

    return NextResponse.json(mission);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    console.error('Error updating agent mission:', error);
    return NextResponse.json({ error: 'Failed to update agent mission' }, { status: 500 });
  }
}

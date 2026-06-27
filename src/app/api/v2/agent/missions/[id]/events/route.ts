import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/get-session';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';

const appendEventSchema = z.object({
  type: z.enum(['message', 'plan_step', 'tool_call', 'tool_result', 'approval_request', 'artifact_created', 'scheduled_action', 'status_change', 'error']),
  role: z.enum(['user', 'assistant', 'system']).optional(),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  brandId: z.string().optional(),
  sessionId: z.string().optional(),
});

function getOrganizationId(session: { user?: { id?: string; } } | null) {
  return session?.user?.id || session?.user?.id || '';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id!;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? Number.parseInt(searchParams.get('limit') || '', 10) : 100;

    const events = await agentMissionRepository.listEvents(id, userId, limit);
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching mission events:', error);
    return NextResponse.json({ error: 'Failed to fetch mission events' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const validatedData = appendEventSchema.parse(await request.json());
    const userId = session.user.id!;

    const mission = await agentMissionRepository.findById(id, userId);
    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    const event = await agentMissionRepository.appendEvent({
      missionId: id,
      userId,
      brandId: validatedData.brandId || mission.brandId,
      sessionId: validatedData.sessionId,
      type: validatedData.type,
      role: validatedData.role,
      content: validatedData.content,
      metadata: validatedData.metadata,
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    console.error('Error creating mission event:', error);
    return NextResponse.json({ error: 'Failed to create mission event' }, { status: 500 });
  }
}

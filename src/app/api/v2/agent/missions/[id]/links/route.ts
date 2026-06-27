import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/get-session';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';

const createLinkSchema = z.object({
  targetType: z.string().min(1).max(80),
  targetId: z.string().min(1).max(120),
  targetLabel: z.string().max(160).optional(),
  targetRoute: z.string().max(240).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

    const links = await agentMissionRepository.listLinks(id, userId);
    return NextResponse.json({ links });
  } catch (error) {
    console.error('Error fetching mission links:', error);
    return NextResponse.json({ error: 'Failed to fetch mission links' }, { status: 500 });
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
    const validatedData = createLinkSchema.parse(await request.json());
    const userId = session.user.id!;

    const mission = await agentMissionRepository.findById(id, userId);
    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    const link = await agentMissionRepository.createLink({
      missionId: id,
      userId,
      brandId: mission.brandId,
      targetType: validatedData.targetType,
      targetId: validatedData.targetId,
      targetLabel: validatedData.targetLabel,
      targetRoute: validatedData.targetRoute,
      metadata: validatedData.metadata,
    });

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    console.error('Error creating mission link:', error);
    return NextResponse.json({ error: 'Failed to create mission link' }, { status: 500 });
  }
}

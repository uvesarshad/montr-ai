import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import { reorderStagesSchema } from '@/validations/crm/pipeline.schema';
import { z } from 'zod';

/**
 * POST /api/v2/crm/pipelines/[id]/stages/reorder
 * Reorder stages in a pipeline
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);
    const pipelineId = params.id;
    const body = await request.json();

    // Validate input
    const validatedData = reorderStagesSchema.parse(body);

    // Check if pipeline exists
    const pipeline = await pipelineRepository.findById(pipelineId);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Prepare stage order for update
    const stageOrder = validatedData.stages.map(s => ({
      stageId: s._id,
      order: s.order,
    }));

    // Reorder stages
    const updatedPipeline = await pipelineRepository.reorderStages(
      pipelineId,
      stageOrder
    );

    if (!updatedPipeline) {
      return NextResponse.json({ error: 'Failed to reorder stages' }, { status: 500 });
    }

    return NextResponse.json(updatedPipeline);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error reordering stages:', error);
    return NextResponse.json(
      { error: 'Failed to reorder stages', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

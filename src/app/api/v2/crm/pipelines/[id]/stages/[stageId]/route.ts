import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { updateStageSchema } from '@/validations/crm/pipeline.schema';
import { z } from 'zod';

/**
 * PATCH /api/v2/crm/pipelines/[id]/stages/[stageId]
 * Update a stage in a pipeline
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; stageId: string }> }
) {
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
    const { id: pipelineId, stageId } = params;
    const body = await request.json();

    // Validate input
    const validatedData = updateStageSchema.parse(body);

    // Check if pipeline exists
    const pipeline = await pipelineRepository.findById(pipelineId);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Check if stage exists
    const stageExists = pipeline.stages.some(s => s._id.toString() === stageId);
    if (!stageExists) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // Update stage
    const updatedPipeline = await pipelineRepository.updateStage(
      pipelineId,
      stageId,
      validatedData
    );

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
    console.error('Error updating stage:', error);
    return NextResponse.json(
      { error: 'Failed to update stage', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/pipelines/[id]/stages/[stageId]
 * Delete a stage from a pipeline (only if it has no deals)
 */
export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string; stageId: string }> }
) {
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
    const { id: pipelineId, stageId } = params;

    // Check if pipeline exists
    const pipeline = await pipelineRepository.findById(pipelineId);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Check if stage exists
    const stageExists = pipeline.stages.some(s => s._id.toString() === stageId);
    if (!stageExists) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // Check if stage has deals
    const deals = await dealRepository.findByStage(stageId);
    if (deals.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete stage with existing deals',
          details: `This stage has ${deals.length} deal(s). Please move or delete them first.`,
        },
        { status: 400 }
      );
    }

    // Delete stage
    const updatedPipeline = await pipelineRepository.removeStage(
      pipelineId,
      stageId
    );

    return NextResponse.json(updatedPipeline);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting stage:', error);
    return NextResponse.json(
      { error: 'Failed to delete stage', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

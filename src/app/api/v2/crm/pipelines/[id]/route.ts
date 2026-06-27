import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { updatePipelineSchema } from '@/validations/crm/pipeline.schema';
import { z } from 'zod';

/**
 * GET /api/v2/crm/pipelines/[id]
 * Get a single pipeline by ID
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const pipelineId = params.id;

    const pipeline = await pipelineRepository.findById(pipelineId);

    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    return NextResponse.json(pipeline);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching pipeline:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pipeline', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/pipelines/[id]
 * Update a pipeline
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const validatedData = updatePipelineSchema.parse(body);

    // Check if pipeline exists
    const existingPipeline = await pipelineRepository.findById(pipelineId);
    if (!existingPipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Update pipeline
    const updatedPipeline = await pipelineRepository.update(
      pipelineId,
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
    console.error('Error updating pipeline:', error);
    return NextResponse.json(
      { error: 'Failed to update pipeline', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/pipelines/[id]
 * Delete a pipeline (only if it has no deals)
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    // Check if pipeline exists
    const pipeline = await pipelineRepository.findById(pipelineId);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Check if pipeline has deals
    const deals = await dealRepository.findByPipeline(pipelineId);
    if (deals.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete pipeline with existing deals',
          details: `This pipeline has ${deals.length} deal(s). Please move or delete them first.`,
        },
        { status: 400 }
      );
    }

    // Delete pipeline
    const deleted = await pipelineRepository.delete(pipelineId);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete pipeline' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Pipeline deleted successfully' });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting pipeline:', error);
    return NextResponse.json(
      { error: 'Failed to delete pipeline', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

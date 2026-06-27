import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import { addStageSchema } from '@/validations/crm/pipeline.schema';
import { z } from 'zod';

/**
 * POST /api/v2/crm/pipelines/[id]/stages
 * Add a new stage to a pipeline
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
    const validatedData = addStageSchema.parse(body);

    // Check if pipeline exists
    const pipeline = await pipelineRepository.findById(pipelineId);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Add stage
    const updatedPipeline = await pipelineRepository.addStage(
      pipelineId,
      validatedData
    );

    return NextResponse.json(updatedPipeline, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error adding stage:', error);
    return NextResponse.json(
      { error: 'Failed to add stage', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

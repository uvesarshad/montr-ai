import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';

/**
 * POST /api/v2/crm/pipelines/[id]/set-default
 * Set a pipeline as the default pipeline
 */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    // Set as default (this will unset other defaults automatically)
    const updatedPipeline = await pipelineRepository.update(
      pipelineId,
      { isDefault: true }
    );

    return NextResponse.json(updatedPipeline);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error setting default pipeline:', error);
    return NextResponse.json(
      { error: 'Failed to set default pipeline', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

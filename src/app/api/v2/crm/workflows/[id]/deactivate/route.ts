import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { workflowRepository } from '@/lib/db/repository/crm/workflow.repository';
import { denyIfReadOnly } from '@/lib/workflow/legacy-workflow-readonly';

/**
 * POST /api/v2/crm/workflows/[id]/deactivate
 * Deactivate a workflow
 */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const sealed = denyIfReadOnly({ system: 'crm_workflows', unifiedPath: '/api/v2/canvases' });
    if (sealed) return sealed;

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

    // Check if workflow exists and user has access
    const existingWorkflow = await workflowRepository.findById(
      params.id
    );

    if (!existingWorkflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Check ownership - only creator can deactivate
    if (existingWorkflow.createdById.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only workflow owner can deactivate it' },
        { status: 403 }
      );
    }

    // Deactivate workflow
    const workflow = await workflowRepository.deactivate(params.id);

    if (!workflow) {
      return NextResponse.json(
        { error: 'Failed to deactivate workflow' },
        { status: 500 }
      );
    }

    return NextResponse.json(workflow);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deactivating workflow:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate workflow', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

export const PATCH = POST;

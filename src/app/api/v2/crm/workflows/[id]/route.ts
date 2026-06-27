import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { workflowRepository, UpdateWorkflowDto } from '@/lib/db/repository/crm/workflow.repository';
import { updateWorkflowSchema } from '@/validations/crm/workflow.schema';
import { denyIfReadOnly } from '@/lib/workflow/legacy-workflow-readonly';
import { z } from 'zod';

/**
 * GET /api/v2/crm/workflows/[id]
 * Get a single workflow by ID
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
    const workflow = await workflowRepository.findById(params.id);

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    return NextResponse.json({ ...workflow.toObject(), deprecated: true });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching workflow:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflow', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/workflows/[id]
 * Update a workflow
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    // Check ownership - only creator can modify
    if (existingWorkflow.createdById.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only workflow owner can modify it' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input
    const validatedData = updateWorkflowSchema.parse(body);

    // Update workflow
    const workflow = await workflowRepository.update(
      params.id,
      validatedData as UpdateWorkflowDto
    );

    if (!workflow) {
      return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
    }

    return NextResponse.json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating workflow:', error);
    return NextResponse.json(
      { error: 'Failed to update workflow', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/workflows/[id]
 * Delete a workflow
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    // Check ownership - only creator can delete
    if (existingWorkflow.createdById.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only workflow owner can delete it' },
        { status: 403 }
      );
    }

    // Delete workflow
    const deleted = await workflowRepository.delete(params.id);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting workflow:', error);
    return NextResponse.json(
      { error: 'Failed to delete workflow', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

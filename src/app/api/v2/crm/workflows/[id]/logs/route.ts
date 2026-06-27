import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { workflowRepository } from '@/lib/db/repository/crm/workflow.repository';

/**
 * GET /api/v2/crm/workflows/[id]/logs
 * Get execution logs for a workflow
 *
 * Note: This is a placeholder. Full implementation requires a separate
 * workflow execution log collection to track each execution with details.
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
    assertCanManageSettings(await getCrmPermissionContext(userId));

    // Check if workflow exists and user has access
    const workflow = await workflowRepository.findById(params.id);

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // TODO: Implement workflow execution logs collection
    // For now, return basic stats from the workflow itself
    return NextResponse.json({
      logs: [],
      stats: {
        totalExecutions: workflow.executionCount,
        totalErrors: workflow.errorCount,
        lastExecutedAt: workflow.lastExecutedAt,
        successRate:
          workflow.executionCount > 0
            ? ((workflow.executionCount - workflow.errorCount) / workflow.executionCount) * 100
            : 0,
      },
      message: 'Detailed execution logs not yet implemented. Showing summary stats.',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching workflow logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflow logs', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

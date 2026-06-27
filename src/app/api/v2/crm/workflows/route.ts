import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { crmErrorResponse } from '@/lib/crm/permissions';
import { workflowRepository } from '@/lib/db/repository/crm/workflow.repository';

/**
 * GET /api/v2/crm/workflows
 * List workflows with optional filters
 */
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);

    // Parse filters
    const isActive = searchParams.get('isActive');
    const triggerType = searchParams.get('triggerType');
    const entityType = searchParams.get('entityType');

    let workflows;

    if (triggerType) {
      // Find by specific trigger type
      workflows = await workflowRepository.findByTrigger(
        triggerType,
        entityType || undefined
      );
    } else if (isActive !== null) {
      // Find all with active filter
      workflows = await workflowRepository.findAll(
        isActive === 'true'
      );
    } else {
      // Find all workflows
      workflows = await workflowRepository.findAll(false);
    }

    return NextResponse.json({ workflows, deprecated: true });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching workflows:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflows', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/workflows
 * Create a new workflow
 */
export async function POST() {
  // Legacy CRM workflows are wound down — new automations are built in the
  // unified automation builder (canvas). Creation here is permanently gone.
  return NextResponse.json(
    {
      error: 'CRM workflows have moved to the automation builder',
      migrated: true,
      unifiedSurface: '/canvas',
    },
    { status: 410 }
  );
}

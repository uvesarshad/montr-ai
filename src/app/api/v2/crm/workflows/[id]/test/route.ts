import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { workflowRepository } from '@/lib/db/repository/crm/workflow.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { evaluateTrigger, evaluateConditions, executeActions } from '@/lib/crm/workflow-engine';
import { CrmEventData } from '@/lib/crm/events';
import type { ICrmContact } from '@/lib/db/models/crm/contact.model';
import type { ICrmCompany } from '@/lib/db/models/crm/company.model';
import type { ICrmDeal } from '@/lib/db/models/crm/deal.model';
import { testWorkflowSchema } from '@/validations/crm/workflow.schema';
import { denyIfReadOnly } from '@/lib/workflow/legacy-workflow-readonly';
import { z } from 'zod';

/**
 * POST /api/v2/crm/workflows/[id]/test
 * Test a workflow with sample data
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    assertCanManageSettings(await getCrmPermissionContext(userId));

    // Check if workflow exists and user has access
    const workflow = await workflowRepository.findById(params.id);

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Check ownership - only creator can test
    if (workflow.createdById.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only workflow owner can test it' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = testWorkflowSchema.parse(body);

    // Fetch the entity to test with
    let entity: ICrmContact | ICrmCompany | ICrmDeal | null = null;
    const { entityType } = workflow.trigger;

    switch (entityType) {
      case 'contact':
        entity = await contactRepository.findById(validatedData.entityId);
        break;
      case 'company':
        entity = await companyRepository.findById(validatedData.entityId);
        break;
      case 'deal':
        entity = await dealRepository.findById(validatedData.entityId);
        break;
    }

    if (!entity) {
      return NextResponse.json(
        { error: `${entityType} not found` },
        { status: 404 }
      );
    }

    // Prepare event data
    const eventData: CrmEventData = {
      entityType,
      entityId: validatedData.entityId,
      entity: entity.toObject ? entity.toObject() : entity,
      userId,
    };

    // Test trigger evaluation
    const triggerPassed = evaluateTrigger(workflow, eventData);

    if (!triggerPassed) {
      return NextResponse.json({
        success: false,
        message: 'Trigger conditions not met',
        details: {
          triggerPassed: false,
          conditionsPassed: false,
          actionsExecuted: false,
        },
      });
    }

    // Test conditions evaluation
    const conditionsPassed = evaluateConditions(workflow.conditions, eventData.entity);

    if (!conditionsPassed) {
      return NextResponse.json({
        success: false,
        message: 'Workflow conditions not met',
        details: {
          triggerPassed: true,
          conditionsPassed: false,
          actionsExecuted: false,
        },
      });
    }

    // Execute actions if not dry run
    let actionsExecuted = false;
    if (!validatedData.dryRun) {
      await executeActions(workflow.actions, eventData, workflow);
      actionsExecuted = true;
    }

    return NextResponse.json({
      success: true,
      message: validatedData.dryRun
        ? 'Workflow would execute successfully (dry run)'
        : 'Workflow executed successfully',
      details: {
        triggerPassed: true,
        conditionsPassed: true,
        actionsExecuted,
        dryRun: validatedData.dryRun,
        actionCount: workflow.actions.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error testing workflow:', error);
    return NextResponse.json(
      { error: 'Failed to test workflow', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { z } from 'zod';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { UnifiedWorkflow } from '@/lib/db/models/unified-workflow.model';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { enqueueExecution } from '@/lib/workflow/queue/execution-queue';
import { checkExecuteRateLimit } from '@/lib/workflow/execute-rate-limit';
import { runCrmAutomationSchema, type CrmAutomationEntityType } from '@/validations/crm-automation';

async function fetchRecord(
    entityType: CrmAutomationEntityType,
    id: string
): Promise<unknown | null> {
    switch (entityType) {
        case 'contact':
            return contactRepository.findById(id);
        case 'deal':
            return dealRepository.findById(id);
        case 'company':
            return companyRepository.findById(id);
        default:
            return null;
    }
}

/**
 * POST /api/v2/crm/automations/run
 *
 * Manually run a manual-trigger workflow against one or more CRM records.
 * Body: { workflowId, entityType, recordIds[] }. Enqueues one execution per
 * resolved record. Records that don't exist (or aren't in the org) are skipped.
 */
export async function POST(request: NextRequest) {
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
        const organizationId = user.id!.toString();

    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);

        const body = await request.json();
        const { workflowId, entityType, recordIds } = runCrmAutomationSchema.parse(body);

        // Load workflow scoped to the org — 404 if not found / not owned.
        const workflow = await UnifiedWorkflow.findOne({ _id: workflowId }).lean();
        if (!workflow) {
            return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
        }

        if (workflow.trigger?.type !== 'manual') {
            return NextResponse.json(
                { error: 'Workflow is not a manual CRM automation' },
                { status: 400 }
            );
        }
        const configEntityType = (workflow.trigger?.config as { entityType?: string } | undefined)?.entityType;
        if (configEntityType !== entityType) {
            return NextResponse.json(
                { error: `Workflow targets '${configEntityType ?? 'unknown'}', not '${entityType}'` },
                { status: 400 }
            );
        }

        // Per-org execute rate limit — once per request (burst protection).
        const rateLimit = await checkExecuteRateLimit(organizationId);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                {
                    error: 'Too many executions',
                    message: `Rate limit exceeded — wait ${rateLimit.retryAfterSeconds}s before retrying.`,
                    retryAfterSeconds: rateLimit.retryAfterSeconds,
                },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
                }
            );
        }

        const uniqueIds = Array.from(new Set(recordIds)).slice(0, 100);
        let enqueued = 0;
        let skipped = 0;

        for (const recordId of uniqueIds) {
            const record = await fetchRecord(entityType, recordId);
            if (!record) {
                skipped++;
                continue;
            }

            await enqueueExecution({
                workflowId,
                userId,
                triggerData: { eventType: 'manual_crm', entityType, record },
                contactId: entityType === 'contact' ? recordId : undefined,
                dealId: entityType === 'deal' ? recordId : undefined,
                source: 'manual-crm',
            });
            enqueued++;
        }

        return NextResponse.json({ enqueued, skipped, total: uniqueIds.length });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }
        const permResp = crmErrorResponse(error);
        if (permResp) return permResp;
        console.error('Error running CRM automation:', error);
        return NextResponse.json(
            { error: 'Failed to run automation', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

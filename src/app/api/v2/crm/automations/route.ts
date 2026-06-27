import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { crmErrorResponse } from '@/lib/crm/permissions';
import { UnifiedWorkflow, WorkflowStatus } from '@/lib/db/models/unified-workflow.model';
import { crmAutomationEntityType, crmAutomationAvailability } from '@/validations/crm-automation';

/**
 * GET /api/v2/crm/automations?entityType=contact&availability=bulk
 *
 * List active manual-trigger workflows in the session user's org that target the
 * given CRM entity type and are compatible with the requested availability.
 * These are the workflows surfaced as "run on this record / selection" actions
 * in the CRM record lists.
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
        const entityParse = crmAutomationEntityType.safeParse(searchParams.get('entityType'));
        if (!entityParse.success) {
            return NextResponse.json(
                { error: 'Invalid or missing entityType' },
                { status: 400 }
            );
        }
        const entityType = entityParse.data;

        const availabilityParam = searchParams.get('availability');
        const availabilityParse = availabilityParam
            ? crmAutomationAvailability.safeParse(availabilityParam)
            : null;
        const requestedAvailability =
            availabilityParse && availabilityParse.success ? availabilityParse.data : undefined;

        const workflows = await UnifiedWorkflow.find({
            status: WorkflowStatus.ACTIVE,
            'trigger.type': 'manual',
            'trigger.config.entityType': entityType,
        })
            .select('_id name description trigger')
            .lean();

        // Availability compatibility: an undefined/`both` config matches every
        // request; a `single` config only matches single requests, `bulk` only bulk.
        const compatible = workflows.filter(wf => {
            const cfgAvailability = (wf.trigger?.config as { availability?: string } | undefined)?.availability;
            if (!cfgAvailability || cfgAvailability === 'both') return true;
            if (!requestedAvailability || requestedAvailability === 'both') return true;
            return cfgAvailability === requestedAvailability;
        });

        return NextResponse.json(
            compatible.map(wf => ({
                id: String(wf._id),
                name: wf.name,
                description: wf.description,
            }))
        );
    } catch (error) {
        const permResp = crmErrorResponse(error);
        if (permResp) return permResp;
        console.error('Error listing CRM automations:', error);
        return NextResponse.json(
            { error: 'Failed to list automations', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

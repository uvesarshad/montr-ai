import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { workflowExecutionService } from '@/lib/services/workflow-execution.service';
import { denyIfReadOnly } from '@/lib/workflow/legacy-workflow-readonly';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const sealed = denyIfReadOnly({ system: 'whatsapp_workflows', unifiedPath: '/api/v2/canvases' });
        if (sealed) return sealed;

        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { contactId, triggerData, variables } = body;

        if (!contactId) {
            return NextResponse.json(
                { error: 'Contact ID is required' },
                { status: 400 }
            );
        }

        const execution = await workflowExecutionService.executeWorkflow({
            workflowId: params.id,
            contactId,
            userId: session.user.id,
            triggerData: triggerData || {},
            variables: variables || {},
        });

        return NextResponse.json({ execution });
    } catch (error) {
        console.error('Error executing workflow:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to execute workflow' },
            { status: 500 }
        );
    }
}

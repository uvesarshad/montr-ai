import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappWorkflowService } from '@/lib/services/whatsapp-workflow.service';
import { denyIfReadOnly } from '@/lib/workflow/legacy-workflow-readonly';

export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const sealed = denyIfReadOnly({ system: 'whatsapp_workflows', unifiedPath: '/api/v2/canvases' });
        if (sealed) return sealed;

        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workflow = await whatsappWorkflowService.activateWorkflow(
            params.id,
            session.user.id
        );

        return NextResponse.json({ workflow });
    } catch (error) {
        console.error('Error activating workflow:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to activate workflow' },
            { status: (error instanceof Error ? error.message : String(error)) === 'Workflow not found' ? 404 : 500 }
        );
    }
}

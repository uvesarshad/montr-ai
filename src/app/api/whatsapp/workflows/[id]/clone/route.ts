import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappWorkflowService } from '@/lib/services/whatsapp-workflow.service';
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
        const { name } = body;

        const workflow = await whatsappWorkflowService.cloneWorkflow(
            params.id,
            session.user.id,
            name
        );

        return NextResponse.json({ workflow }, { status: 201 });
    } catch (error) {
        console.error('Error cloning workflow:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to clone workflow' },
            { status: (error instanceof Error ? error.message : String(error)) === 'Workflow not found' ? 404 : 500 }
        );
    }
}

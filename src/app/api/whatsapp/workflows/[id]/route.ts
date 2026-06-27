import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappWorkflowService } from '@/lib/services/whatsapp-workflow.service';
import { denyIfReadOnly } from '@/lib/workflow/legacy-workflow-readonly';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workflow = await whatsappWorkflowService.getWorkflow(
            params.id,
            session.user.id
        );

        return NextResponse.json({ workflow });
    } catch (error) {
        console.error('Error fetching workflow:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch workflow' },
            { status: (error instanceof Error ? error.message : String(error)) === 'Workflow not found' ? 404 : 500 }
        );
    }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const sealed = denyIfReadOnly({ system: 'whatsapp_workflows', unifiedPath: '/api/v2/canvases' });
        if (sealed) return sealed;

        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const workflow = await whatsappWorkflowService.updateWorkflow(
            params.id,
            session.user.id,
            body
        );

        return NextResponse.json({ workflow });
    } catch (error) {
        console.error('Error updating workflow:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to update workflow' },
            { status: (error instanceof Error ? error.message : String(error)) === 'Workflow not found' ? 404 : 500 }
        );
    }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const sealed = denyIfReadOnly({ system: 'whatsapp_workflows', unifiedPath: '/api/v2/canvases' });
        if (sealed) return sealed;

        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await whatsappWorkflowService.deleteWorkflow(
            params.id,
            session.user.id
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting workflow:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to delete workflow' },
            { status: (error instanceof Error ? error.message : String(error)) === 'Workflow not found' ? 404 : 500 }
        );
    }
}

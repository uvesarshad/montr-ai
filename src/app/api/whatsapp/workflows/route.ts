import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappWorkflowService } from '@/lib/services/whatsapp-workflow.service';
import { denyIfReadOnly } from '@/lib/workflow/legacy-workflow-readonly';

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || undefined;
        const limit = parseInt(searchParams.get('limit') || '50');
        const skip = parseInt(searchParams.get('skip') || '0');
        const search = searchParams.get('search') || undefined;

        let result;

        if (search) {
            const workflows = await whatsappWorkflowService.searchWorkflows(
                userId,
                search,
                { status, limit, skip }
            );
            result = { workflows, total: workflows.length };
        } else {
            result = await whatsappWorkflowService.listWorkflows(
                userId,
                { status, limit, skip }
            );
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching workflows:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch workflows' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const sealed = denyIfReadOnly({ system: 'whatsapp_workflows', unifiedPath: '/api/v2/canvases' });
        if (sealed) return sealed;

        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const body = await request.json();

        const workflow = await whatsappWorkflowService.createWorkflow(userId, {
            ...body
        });

        return NextResponse.json({ workflow }, { status: 201 });
    } catch (error) {
        console.error('Error creating workflow:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to create workflow' },
            { status: 500 }
        );
    }
}

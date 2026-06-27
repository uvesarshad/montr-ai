import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { workflowExecutionRepository } from '@/lib/db/repository/workflow-execution.repository';

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const workflowId = searchParams.get('workflowId');
        const status = searchParams.get('status') || undefined;
        const limit = parseInt(searchParams.get('limit') || '50');
        const skip = parseInt(searchParams.get('skip') || '0');
        const startDate = searchParams.get('startDate') || undefined;
        const endDate = searchParams.get('endDate') || undefined;

        let executions;

        if (workflowId) {
            executions = await workflowExecutionRepository.findByWorkflowId(
                workflowId,
                { status, limit, skip, startDate, endDate }
            );
        } else {
            executions = await workflowExecutionRepository.findByUserId(
                session.user.id,
                { status, limit, skip, startDate, endDate }
            );
        }

        return NextResponse.json({ executions });
    } catch (error) {
        console.error('Error fetching executions:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch executions' },
            { status: 500 }
        );
    }
}

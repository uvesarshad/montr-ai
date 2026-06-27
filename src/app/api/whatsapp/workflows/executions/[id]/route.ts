import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { workflowExecutionRepository } from '@/lib/db/repository/workflow-execution.repository';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const execution = await workflowExecutionRepository.findById(params.id);

        if (!execution) {
            return NextResponse.json(
                { error: 'Execution not found' },
                { status: 404 }
            );
        }

        // Check authorization
        if (execution.userId.toString() !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        return NextResponse.json({ execution });
    } catch (error) {
        console.error('Error fetching execution:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch execution' },
            { status: 500 }
        );
    }
}

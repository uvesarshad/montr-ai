import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import Canvas from '@/lib/db/models/canvas.model';
import { UnifiedWorkflowExecution } from '@/lib/db/models/unified-workflow-execution.model';
import { ExecutionStatus } from '@/lib/db/models/unified-workflow.model';
import { enqueueExecution } from '@/lib/workflow/queue/execution-queue';

/**
 * Resume a paused execution.
 *
 *   POST /api/v2/canvases/{canvasId}/executions/{executionId}/resume
 *
 * Enqueues an execution job with `resume.fromNodeIds` set from the stored
 * `context.resumePointer`. Works for both user-initiated pauses and the
 * persistent delay pause path — they use the same pointer shape.
 *
 * If no pointer is present, we fall back to the currentNodeId as a last
 * resort so the user isn't stuck on a pause that lost its continuation.
 */

const isProd = process.env.NODE_ENV === 'production';

interface RouteContext {
    params: Promise<{ id: string; executionId: string }>;
}

function isOwner(canvas: { userId: string }, session: { user?: { id?: string; firebaseUid?: string } } | null): boolean {
    const userId: string | undefined = session?.user?.id;
    const firebaseUid: string | undefined = session?.user?.firebaseUid;
    const ids = [userId, firebaseUid].filter(Boolean);
    return ids.includes(String(canvas.userId));
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id: canvasId, executionId } = await ctx.params;

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
        }
        if (!isOwner(canvas, session)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const execution = await UnifiedWorkflowExecution.findById(executionId);
        if (!execution) {
            return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
        }

        if (execution.status !== ExecutionStatus.PAUSED) {
            return NextResponse.json(
                {
                    error: 'Only paused executions can be resumed',
                    currentStatus: execution.status,
                },
                { status: 409 }
            );
        }

        // Pull continuation pointers from the execution record. The delay
        // node writes { nextNodeIds }, the user-pause path writes { fromNodeIds }.
        interface ResumePointer {
            fromNodeIds?: string[];
            nextNodeIds?: string[];
            delayNodeId?: string;
        }
        const context = execution.context as { resumePointer?: ResumePointer } | undefined;
        const pointer: ResumePointer = context?.resumePointer || {};
        const fromNodeIds: string[] =
            pointer.fromNodeIds && pointer.fromNodeIds.length > 0
                ? pointer.fromNodeIds
                : pointer.nextNodeIds && pointer.nextNodeIds.length > 0
                  ? pointer.nextNodeIds
                  : execution.currentNodeId
                    ? [execution.currentNodeId]
                    : [];

        if (fromNodeIds.length === 0) {
            return NextResponse.json(
                { error: 'No resume pointer — cannot determine where to continue' },
                { status: 400 }
            );
        }

        const { jobId, queued } = await enqueueExecution({
            workflowId: execution.workflowId.toString(),
            userId: execution.userId.toString(),
            contactId: execution.contactId?.toString(),
            dealId: execution.dealId?.toString(),
            campaignId: execution.campaignId?.toString(),
            executionId: execution._id.toString(),
            triggerData: execution.triggerData as Record<string, unknown> | undefined,
            source: 'resume-user',
            resume: { fromNodeIds, delayNodeId: pointer.delayNodeId },
        });

        return NextResponse.json({
            success: true,
            executionId,
            jobId,
            queued,
            fromNodeIds,
        });
    } catch (error) {
        console.error('[resume-execution] error:', error);
        return NextResponse.json(
            {
                error: 'Failed to resume execution',
                ...(isProd ? {} : { detail: (error instanceof Error ? error.message : String(error)) }),
            },
            { status: 500 }
        );
    }
}

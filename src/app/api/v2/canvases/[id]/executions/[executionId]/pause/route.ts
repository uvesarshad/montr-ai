import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import Canvas, { ICanvas } from '@/lib/db/models/canvas.model';
import { UnifiedWorkflowExecution } from '@/lib/db/models/unified-workflow-execution.model';
import { UnifiedWorkflowExecutionEngine } from '@/lib/workflow/unified-execution-engine';
import { ExecutionStatus } from '@/lib/db/models/unified-workflow.model';

/**
 * Pause a running canvas execution.
 *
 *   POST /api/v2/canvases/{canvasId}/executions/{executionId}/pause
 *
 * Writes status=PAUSED and a resume pointer (the currentNodeId), then signals
 * the in-process engine via `UnifiedWorkflowExecutionEngine.pause()`. Unlike
 * cancel, pause is recoverable: the /resume endpoint re-enqueues an execution
 * job that rehydrates variables + nodeOutputs and continues.
 *
 * If the engine is running in a different process (worker on another host),
 * the persisted status still flips; the worker catches the pause at its next
 * checkpoint via a signal read (future enhancement — for now, pause only
 * takes immediate effect in the same process).
 */

const isProd = process.env.NODE_ENV === 'production';

interface RouteContext {
    params: Promise<{ id: string; executionId: string }>;
}

type CanvasSession = { user?: { id?: string; firebaseUid?: string } } | null;
function isOwner(canvas: ICanvas, session: CanvasSession): boolean {
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

        if (
            execution.status !== ExecutionStatus.RUNNING &&
            execution.status !== ExecutionStatus.PENDING
        ) {
            return NextResponse.json(
                {
                    error: 'Only running or pending executions can be paused',
                    currentStatus: execution.status,
                },
                { status: 409 }
            );
        }

        // Persist PAUSED + the continuation pointer (the node the engine was
        // about to execute). The resume endpoint reads this to decide where
        // to pick back up.
        const pointerNodeId = execution.currentNodeId;
        await UnifiedWorkflowExecution.updateOne(
            { _id: execution._id },
            {
                $set: {
                    status: ExecutionStatus.PAUSED,
                    'context.resumePointer': {
                        source: 'user',
                        fromNodeIds: pointerNodeId ? [pointerNodeId] : [],
                        pausedAt: new Date(),
                    },
                },
            }
        );

        const signalled = UnifiedWorkflowExecutionEngine.pause(executionId);

        return NextResponse.json({
            success: true,
            executionId,
            status: ExecutionStatus.PAUSED,
            signalled,
            resumeFrom: pointerNodeId || null,
        });
    } catch (error) {
        console.error('[pause-execution] error:', error);
        return NextResponse.json(
            {
                error: 'Failed to pause execution',
                ...(isProd ? {} : { detail: (error instanceof Error ? error.message : String(error)) }),
            },
            { status: 500 }
        );
    }
}

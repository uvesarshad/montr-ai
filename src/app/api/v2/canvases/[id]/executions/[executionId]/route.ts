import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import Canvas, { ICanvas } from '@/lib/db/models/canvas.model';
import { UnifiedWorkflowExecution } from '@/lib/db/models/unified-workflow-execution.model';
import { UnifiedWorkflowExecutionEngine } from '@/lib/workflow/unified-execution-engine';
import { requestExecutionStop } from '@/lib/workflow/execution-stop-flag';
import { ExecutionStatus } from '@/lib/db/models/unified-workflow.model';

/**
 * Cancel a running canvas execution.
 *
 *   DELETE /api/v2/canvases/{canvasId}/executions/{executionId}
 *
 * Three layers, so a stop takes effect regardless of where the run lives:
 *  1. static cancel() aborts the in-process AbortController (same-process runs).
 *  2. requestExecutionStop() sets a Redis flag the engine reads at every
 *     per-node boundary, so a worker-side run in another process stops too.
 *  3. the persisted status is flipped to CANCELLED so the UI is consistent even
 *     if the engine has already exited.
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

/**
 * Fetch a single execution's full detail (including the per-step executionPath)
 * for the canvas execution-detail viewer (audit H13). Org/owner-scoped.
 *
 *   GET /api/v2/canvases/{canvasId}/executions/{executionId}
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
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

        const execution = await UnifiedWorkflowExecution.findById(executionId).lean();
        if (!execution) {
            return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
        }

        return NextResponse.json({ execution });
    } catch (error) {
        console.error('[get-execution] error:', error);
        return NextResponse.json(
            {
                error: 'Failed to load execution',
                ...(isProd ? {} : { detail: (error instanceof Error ? error.message : String(error)) }),
            },
            { status: 500 }
        );
    }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
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

        // Signal the in-process engine if it's running here.
        const signalled = UnifiedWorkflowExecutionEngine.cancel(executionId);

        // Cross-process stop flag — a worker-side run in another process reads
        // this at its next node boundary (audit H13).
        const flagged = await requestExecutionStop(executionId);

        // Persist cancellation state so the UI sees it even if the engine is
        // not in this process (e.g. worker on another node).
        if (
            execution.status === ExecutionStatus.RUNNING ||
            execution.status === ExecutionStatus.PENDING ||
            execution.status === ExecutionStatus.PAUSED
        ) {
            try {
                await execution.updateStatus(
                    ExecutionStatus.CANCELLED,
                    'Execution cancelled by user'
                );
            } catch {
                /* non-fatal */
            }
        }

        return NextResponse.json({
            success: true,
            executionId,
            signalled,
            flagged,
            status: ExecutionStatus.CANCELLED,
        });
    } catch (error) {
        console.error('[cancel-execution] error:', error);
        return NextResponse.json(
            {
                error: 'Failed to cancel execution',
                ...(isProd ? {} : { detail: (error instanceof Error ? error.message : String(error)) }),
            },
            { status: 500 }
        );
    }
}

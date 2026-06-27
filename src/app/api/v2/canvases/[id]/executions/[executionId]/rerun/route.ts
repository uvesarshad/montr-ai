import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import Canvas from '@/lib/db/models/canvas.model';
import { UnifiedWorkflowExecution } from '@/lib/db/models/unified-workflow-execution.model';
import { UnifiedWorkflow, ExecutionStatus } from '@/lib/db/models/unified-workflow.model';
import { enqueueExecution } from '@/lib/workflow/queue/execution-queue';

/**
 * Re-run a workflow starting from a specific node (P-7).
 *
 *   POST /api/v2/canvases/{canvasId}/executions/{executionId}/rerun
 *   body: { fromNodeId: string }
 *
 * Creates a fresh execution record seeded with:
 *   - the original run's final variable state
 *   - the prior executionPath up to the failed node (so nodeOutputs rehydrate
 *     via RunContext.fromExecution — downstream {{nodes.X.output}} refs still
 *     resolve to whatever the earlier run produced)
 *
 * Then enqueues a resume-style job pointed at `fromNodeId`. The engine's
 * existing `resume()` path handles the rest.
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

export async function POST(req: NextRequest, ctx: RouteContext) {
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

        const body = await req.json().catch(() => ({}));
        const fromNodeId: string | undefined = body?.fromNodeId || body?.nodeId;
        if (!fromNodeId) {
            return NextResponse.json(
                { error: 'fromNodeId is required in request body' },
                { status: 400 }
            );
        }

        const original = await UnifiedWorkflowExecution.findById(executionId);
        if (!original) {
            return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
        }

        // Terminal states only — re-running an in-flight execution would race
        // with the active engine. Require the user to cancel first.
        const rerunnable = new Set([
            ExecutionStatus.FAILED,
            ExecutionStatus.COMPLETED,
            ExecutionStatus.CANCELLED,
            ExecutionStatus.PAUSED,
        ] as ExecutionStatus[]);
        if (!rerunnable.has(original.status)) {
            return NextResponse.json(
                {
                    error: 'Execution is still active — cancel it before re-running',
                    currentStatus: original.status,
                },
                { status: 409 }
            );
        }

        const workflow = await UnifiedWorkflow.findById(original.workflowId);
        if (!workflow) {
            return NextResponse.json({ error: 'Workflow no longer exists' }, { status: 404 });
        }

        // Validate the target node still exists on the workflow — workflow
        // edits after the original run may have deleted it.
        const targetNode = workflow.nodes.find(n => n.id === fromNodeId);
        if (!targetNode) {
            return NextResponse.json(
                { error: `Node ${fromNodeId} not found in current workflow` },
                { status: 400 }
            );
        }

        // Seed the fresh run with the original's prior executionPath *up to*
        // the target node — that's what `RunContext.fromExecution()` reads to
        // rehydrate nodeOutputs so downstream {{nodes.X.output}} still resolves.
        // If the failed node never executed, that's fine — path stays empty.
        const priorPath = (original.executionPath || []).filter(step => {
            if (step.nodeId === fromNodeId) return false;
            return step.status === 'success';
        });

        const seededExecution = await UnifiedWorkflowExecution.create({
            workflowId: original.workflowId,
            workflowName: workflow.name,
            workflowType: workflow.type,
            workflowVersion: workflow.version,
            userId: new Types.ObjectId(session.user.id!),
            contactId: original.contactId,
            dealId: original.dealId,
            campaignId: original.campaignId,
            status: ExecutionStatus.PAUSED,
            currentNodeId: fromNodeId,
            variables: { ...(original.variables || {}) },
            triggerData: original.triggerData,
            context: {
                rerunOf: original._id.toString(),
                rerunFromNodeId: fromNodeId,
                resumePointer: {
                    source: 'rerun',
                    fromNodeIds: [fromNodeId],
                },
            },
            executionPath: priorPath,
            startedAt: new Date(),
            retryCount: 0,
            maxRetries: workflow.errorHandling.maxRetries,
        });

        const { jobId, queued } = await enqueueExecution({
            workflowId: original.workflowId.toString(),
            userId: String(session.user.id!),
            contactId: original.contactId?.toString(),
            dealId: original.dealId?.toString(),
            campaignId: original.campaignId?.toString(),
            executionId: seededExecution._id.toString(),
            triggerData: original.triggerData as Record<string, unknown> | undefined,
            source: 'rerun-from-node',
            resume: { fromNodeIds: [fromNodeId] },
        });

        return NextResponse.json({
            success: true,
            originalExecutionId: executionId,
            executionId: seededExecution._id.toString(),
            fromNodeId,
            jobId,
            queued,
        });
    } catch (error) {
        console.error('[rerun-execution] error:', error);
        return NextResponse.json(
            {
                error: 'Failed to re-run execution',
                ...(isProd ? {} : { detail: (error instanceof Error ? error.message : String(error)) }),
            },
            { status: 500 }
        );
    }
}

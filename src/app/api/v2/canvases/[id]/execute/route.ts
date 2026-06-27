import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import Canvas from '@/lib/db/models/canvas.model';
import { UnifiedWorkflow } from '@/lib/db/models/unified-workflow.model';
import { enqueueExecution, waitForJob } from '@/lib/workflow/queue/execution-queue';
import { checkExecuteRateLimit } from '@/lib/workflow/execute-rate-limit';
import { convertCanvasToWorkflow, syncCanvasWorkflow, type CanvasDoc } from '@/lib/workflow/canvas-sync';
import { Types } from 'mongoose';

const isProd = process.env.NODE_ENV === 'production';

type AuthSession = {
    user?: {
        id?: string;
        firebaseUid?: string;
    };
} | null;

function getOrgId(session: AuthSession): string | null {
    const orgId = session?.user?.id || session?.user?.id;
    return orgId || null;
}

function isOwner(canvas: CanvasDoc, session: AuthSession): boolean {
    const userId: string | undefined = session?.user?.id;
    const firebaseUid: string | undefined = session?.user?.firebaseUid;
    const ids = [userId, firebaseUid].filter(Boolean);
    return ids.includes(String(canvas.userId));
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id: canvasId } = await params;

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
        }

        if (!isOwner(canvas, session)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const { triggerData = {} } = body;

        const { nodes } = convertCanvasToWorkflow(canvas);
        if (nodes.length === 0) {
            return NextResponse.json(
                { error: 'Canvas has no executable nodes' },
                { status: 400 }
            );
        }
        if (!nodes.some(n => n.type === 'trigger')) {
            return NextResponse.json(
                { error: 'Canvas must contain at least one trigger node' },
                { status: 400 }
            );
        }

        const orgIdRaw = getOrgId(session);
        if (!orgIdRaw || !Types.ObjectId.isValid(orgIdRaw)) {
            return NextResponse.json({ error: 'No valid organization for user' }, { status: 403 });
        }
        const organizationId = new Types.ObjectId(orgIdRaw);

        // Plan enforcement — block runs once the org has burned through its
        // monthly execution quota. This is a friendly pre-check; enqueueExecution
        // re-checks (org-level, the authoritative gate for ALL entry paths, audit
        // H18). Fails CLOSED: a quota-check infra error returns 503 "try again"
        // rather than silently allowing an unmetered run.
        try {
            const { canExecuteWorkflowForOrg } = await import('@/lib/plan-enforcement');
            const quota = await canExecuteWorkflowForOrg(organizationId.toString());
            if (!quota.allowed && quota.limit > 0) {
                return NextResponse.json(
                    {
                        error: 'Plan limit reached',
                        message: quota.message,
                        current: quota.current,
                        limit: quota.limit,
                        upgradeRequired: true,
                    },
                    { status: 402 }
                );
            }
        } catch (planError) {
            const { QuotaCheckUnavailableError } = await import('@/lib/plan-enforcement');
            if (planError instanceof QuotaCheckUnavailableError) {
                return NextResponse.json(
                    {
                        error: 'Quota check unavailable',
                        message: 'Could not verify your execution quota right now. Please try again in a moment.',
                    },
                    { status: 503 }
                );
            }
            throw planError;
        }

        // Per-org rate limit — burst protection. SEC-6.
        const rateLimit = await checkExecuteRateLimit(organizationId.toString());
        if (!rateLimit.allowed) {
            return NextResponse.json(
                {
                    error: 'Too many executions',
                    message: `Rate limit exceeded — wait ${rateLimit.retryAfterSeconds}s before retrying.`,
                    retryAfterSeconds: rateLimit.retryAfterSeconds,
                },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
                }
            );
        }

        // Materialize / refresh the UnifiedWorkflow shadow (nodes, edges, and the
        // trigger derived from the canvas's trigger node).
        const workflow = await syncCanvasWorkflow(canvas as CanvasDoc, {
            userId: session.user.id!,
        });
        if (!workflow) {
            return NextResponse.json(
                { error: 'Canvas has no executable nodes' },
                { status: 400 }
            );
        }

        // Enqueue execution — when Redis is configured, the BullMQ worker picks
        // it up; otherwise enqueueExecution falls through to an inline run. The
        // `wait` query param lets callers block for request/response ergonomics
        // (default true to preserve old canvas UI behavior).
        const waitParam = request.nextUrl.searchParams.get('wait');
        const shouldWait = waitParam === null ? true : waitParam !== 'false' && waitParam !== '0';

        const enqueueResult = await enqueueExecution({
            workflowId: workflow._id.toString(),
            userId: session.user.id,
            triggerData,
            initialVariables: {
                canvasId,
                canvasName: canvas.name,
            },
            source: 'manual',
        });

        // Inline fallback already ran to completion — return immediately.
        if (!enqueueResult.queued) {
            return NextResponse.json({
                success: true,
                executionId: enqueueResult.executionId,
                status: 'completed',
                queued: false,
                startedAt: new Date(),
            });
        }

        if (!shouldWait) {
            return NextResponse.json({
                success: true,
                jobId: enqueueResult.jobId,
                queued: true,
                status: 'queued',
            });
        }

        try {
            const result = await waitForJob(enqueueResult.jobId, 120_000) as { executionId?: string; status?: string } | undefined;
            return NextResponse.json({
                success: true,
                executionId: result?.executionId,
                status: result?.status || 'completed',
                queued: true,
                jobId: enqueueResult.jobId,
            });
        } catch (waitErr) {
            // Timed out waiting — still enqueued, caller can poll GET for status.
            const waitMessage = waitErr instanceof Error ? waitErr.message : String(waitErr);
            return NextResponse.json({
                success: true,
                queued: true,
                jobId: enqueueResult.jobId,
                status: 'running',
                message: 'Job enqueued; exceeded wait window. Poll status via GET.',
                detail: isProd ? undefined : waitMessage,
            });
        }
    } catch (error) {
        console.error('Canvas execution error:', error);
        const detail = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            {
                error: 'Failed to execute canvas workflow',
                ...(isProd ? {} : { detail }),
            },
            { status: 500 }
        );
    }
}

// GET execution status
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id: canvasId } = await params;

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
        }
        if (!isOwner(canvas, session)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const workflow = await UnifiedWorkflow.findOne({ canvasId }).lean();
        if (!workflow) {
            return NextResponse.json({ executions: [] });
        }

        const { UnifiedWorkflowExecution } = await import('@/lib/db/models/unified-workflow-execution.model');
        const executions = await UnifiedWorkflowExecution.find({ workflowId: workflow._id })
            .sort({ startedAt: -1 })
            .limit(10)
            .lean();

        interface ExecutionLike {
            _id: unknown;
            status?: string;
            startedAt?: Date;
            completedAt?: Date;
            error?: unknown;
            executionPath?: unknown[];
        }
        return NextResponse.json({
            executions: (executions as ExecutionLike[]).map((exec) => ({
                id: exec._id,
                status: exec.status,
                startedAt: exec.startedAt,
                completedAt: exec.completedAt,
                error: exec.error,
                steps: exec.executionPath?.length || 0,
            })),
        });
    } catch (error) {
        console.error('Get execution status error:', error);
        const detail = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            {
                error: 'Failed to get execution status',
                ...(isProd ? {} : { detail }),
            },
            { status: 500 }
        );
    }
}

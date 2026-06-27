import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import Canvas from '@/lib/db/models/canvas.model';
import { UnifiedWorkflowExecution } from '@/lib/db/models/unified-workflow-execution.model';
import { UnifiedWorkflowExecutionEngine } from '@/lib/workflow/unified-execution-engine';
import { syncCanvasWorkflow, type CanvasDoc } from '@/lib/workflow/canvas-sync';

/**
 * 1.9 "Test this step" — run a SINGLE node in isolation without firing real
 * side effects (dry-run on by default) and without enqueuing a full execution.
 *
 *   POST /api/v2/canvases/{canvasId}/test-node
 *   body: { nodeId: string, dryRun?: boolean }
 *
 * Upstream data resolution chain (first non-empty wins, merged top-down):
 *   1. pinnedData on each direct upstream node (parsed JSON sample)
 *   2. that upstream node's last logged step output from the canvas's most
 *      recent execution (org-scoped)
 *   3. empty object
 * The merged upstream map is exposed to the node as {{nodes.<id>.output}}; a
 * direct trigger upstream's pin also seeds {{trigger.*}}.
 */

const isProd = process.env.NODE_ENV === 'production';

type AuthSession = {
    user?: { id?: string;
 firebaseUid?: string };
} | null;

interface RouteContext {
    params: Promise<{ id: string }>;
}

function getOrgId(session: AuthSession): string | null {
    return session?.user?.id || session?.user?.id || null;
}

function isOwner(canvas: { userId: string }, session: AuthSession): boolean {
    const ids = [session?.user?.id, session?.user?.firebaseUid].filter(Boolean);
    return ids.includes(String(canvas.userId));
}

/** Parse a node's pinnedData sample (JSON string or object). Undefined when unset. */
function parsePinned(config: Record<string, unknown> | undefined): unknown {
    const raw = config?.pinnedData;
    if (raw == null) return undefined;
    if (typeof raw === 'string') {
        const t = raw.trim();
        if (!t) return undefined;
        try { return JSON.parse(t); } catch { return t; }
    }
    return raw;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id: canvasId } = await ctx.params;

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
        }
        if (!isOwner(canvas, session)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const orgIdRaw = getOrgId(session);
        if (!orgIdRaw || !Types.ObjectId.isValid(orgIdRaw)) {
            return NextResponse.json({ error: 'No valid organization for user' }, { status: 403 });
        }
        const body = await req.json().catch(() => ({}));
        const nodeId: string | undefined = body?.nodeId;
        if (!nodeId) {
            return NextResponse.json({ error: 'nodeId is required' }, { status: 400 });
        }
        const dryRun = body?.dryRun !== false; // default ON

        // Materialize the UnifiedWorkflow shadow so credentials + nodes/edges are
        // available to the engine (same path canvas execute uses).
        const workflow = await syncCanvasWorkflow(canvas as CanvasDoc, {
            userId: session.user.id!,
        });
        if (!workflow) {
            return NextResponse.json({ error: 'Canvas has no executable nodes' }, { status: 400 });
        }

        const targetNode = workflow.nodes.find(n => n.id === nodeId);
        if (!targetNode) {
            return NextResponse.json({ error: `Node ${nodeId} not found in workflow` }, { status: 400 });
        }

        // Direct upstream node ids (those that feed this node via a graph edge).
        const upstreamIds = workflow.edges
            .filter(e => e.target === nodeId)
            .map(e => e.source);

        // Last execution's per-node success outputs (org-scoped), used as the
        // fallback when an upstream node has no pinned sample.
        const lastExec = await UnifiedWorkflowExecution.findOne({
            workflowId: workflow._id
        }).sort({ startedAt: -1 }).lean();

        const lastOutputs: Record<string, unknown> = {};
        if (lastExec?.executionPath) {
            for (const step of lastExec.executionPath) {
                if ((step.status === 'success' || step.status === 'pinned') && step.output !== undefined) {
                    lastOutputs[step.nodeId] = step.output;
                }
            }
        }

        // Build upstream outputs map + trigger seed (chain: pin → last-run → empty).
        const upstreamOutputs: Record<string, unknown> = {};
        let triggerSeed: Record<string, unknown> = {};
        for (const upId of upstreamIds) {
            const upNode = workflow.nodes.find(n => n.id === upId);
            const pin = parsePinned((upNode?.data?.config ?? {}) as Record<string, unknown>);
            const value = pin !== undefined ? pin : lastOutputs[upId];
            if (value !== undefined) upstreamOutputs[upId] = value;
            if (upNode?.type === 'trigger' && value !== undefined && typeof value === 'object') {
                triggerSeed = value as Record<string, unknown>;
            }
        }
        // Also expose this node's own pinned data as the trigger seed when the
        // node being tested IS the trigger (so a trigger test echoes its sample).
        if (targetNode.type === 'trigger') {
            const ownPin = parsePinned((targetNode.data?.config ?? {}) as Record<string, unknown>);
            if (ownPin !== undefined && typeof ownPin === 'object') triggerSeed = ownPin as Record<string, unknown>;
        }

        const engine = new UnifiedWorkflowExecutionEngine();
        const result = await engine.testSingleNode({
            workflow,
            nodeId,
            userId: session.user.id!,
            upstreamOutputs,
            triggerData: triggerSeed,
            dryRun,
            timeoutMs: 30_000,
        });

        return NextResponse.json({
            success: !result.error,
            ...result,
            usedUpstream: Object.keys(upstreamOutputs),
        });
    } catch (error) {
        console.error('[test-node] error:', error);
        return NextResponse.json(
            {
                error: 'Failed to test node',
                ...(isProd ? {} : { detail: error instanceof Error ? error.message : String(error) }),
            },
            { status: 500 }
        );
    }
}

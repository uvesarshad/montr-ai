/**
 * Canvas → UnifiedWorkflow sync.
 *
 * Canvases are the React Flow editing surface; the execution engine runs
 * UnifiedWorkflow documents. This module is the single bridge that materializes
 * a canvas into its UnifiedWorkflow shadow and keeps the workflow's `trigger`
 * in sync with the canvas's trigger node.
 *
 * Previously the materialization lived inline in the canvas execute route and
 * hardcoded `trigger: { type: 'manual' }`, so event/webhook/cron-triggered
 * canvases could never be matched by the trigger dispatcher. This helper derives
 * the real trigger from the canvas's trigger node and refreshes it on every sync,
 * so event-driven canvases go live on save (no manual first run required).
 */

import { Types } from 'mongoose';
import {
    UnifiedWorkflow,
    WorkflowType,
    WorkflowStatus,
    type NodeType,
    type TriggerSubType,
    type IWorkflowTrigger,
    type IUnifiedWorkflow,
} from '@/lib/db/models/unified-workflow.model';
import {
    NODE_ENGINE_MAPPING,
    SKIPPED_NODE_TYPES,
    resolveGroupMembership,
} from '@/lib/canvas/node-registry';
import { registerScheduledWorkflow, unregisterScheduledWorkflow } from '@/lib/workflow/queue/scheduler';
import { registerPollingWorkflow, unregisterPollingWorkflow } from '@/lib/workflow/queue/polling-scheduler';

interface RawCanvasNode {
    id: string;
    type: string;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
    style?: { width?: number; height?: number };
    data?: Record<string, unknown>;
}

interface RawCanvasEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    data?: Record<string, unknown>;
}

export interface CanvasDoc {
    _id: unknown;
    name?: string;
    userId?: unknown;
    data?: string;
}

export interface ConvertedWorkflowNode {
    id: string;
    type: NodeType;
    subType: string;
    position: { x: number; y: number };
    data: {
        label: unknown;
        config: Record<string, unknown>;
        group?: {
            id: string;
            label?: string;
            errorBoundary: boolean;
            color?: string;
        };
    };
}

export interface ConvertedWorkflowEdge {
    id: string;
    source: string;
    sourceHandle?: string;
    target: string;
    targetHandle?: string;
    condition?: unknown;
}

/**
 * Legacy canvas engine subTypes that don't match the model's TriggerSubType enum.
 * Map them onto the canonical value so the dispatcher / scheduler can match.
 */
const TRIGGER_SUBTYPE_ALIASES: Record<string, TriggerSubType> = {
    schedule: 'scheduled',
    whatsapp_message: 'message_received',
};

export function parseCanvasGraph(canvas: CanvasDoc): { nodes: RawCanvasNode[]; edges: RawCanvasEdge[] } {
    let parsed: { nodes?: unknown; edges?: unknown };
    try {
        parsed = JSON.parse(canvas?.data || '{"nodes":[],"edges":[]}');
    } catch {
        parsed = { nodes: [], edges: [] };
    }
    const nodes: RawCanvasNode[] = Array.isArray(parsed?.nodes) ? (parsed.nodes as RawCanvasNode[]) : [];
    const edges: RawCanvasEdge[] = Array.isArray(parsed?.edges) ? (parsed.edges as RawCanvasEdge[]) : [];
    return { nodes, edges };
}

/**
 * Convert a canvas graph into engine-shaped nodes/edges (post NODE_ENGINE_MAPPING).
 * Honors disabled groups and strips visual-only nodes (sticky notes, group shells).
 */
export function convertCanvasToWorkflow(canvas: CanvasDoc): {
    nodes: ConvertedWorkflowNode[];
    edges: ConvertedWorkflowEdge[];
} {
    const { nodes: rawNodes, edges: rawEdges } = parseCanvasGraph(canvas);

    const { assignments } = resolveGroupMembership(rawNodes);

    const skippedIds = new Set<string>();
    const workflowNodes: ConvertedWorkflowNode[] = rawNodes
        .filter(n => {
            if (SKIPPED_NODE_TYPES.has(n.type)) {
                skippedIds.add(n.id);
                return false;
            }
            const group = assignments.get(n.id);
            if (group?.disabled) {
                skippedIds.add(n.id);
                return false;
            }
            return true;
        })
        .map(n => {
            const mapping = NODE_ENGINE_MAPPING[n.type] || { category: 'data' as NodeType, subType: n.type };
            const group = assignments.get(n.id);
            return {
                id: n.id,
                type: mapping.category as NodeType,
                subType: mapping.subType,
                position: n.position || { x: 0, y: 0 },
                data: {
                    label: n.data?.label || n.type,
                    config: n.data || {},
                    ...(group
                        ? {
                              group: {
                                  id: group.groupId,
                                  label: group.groupLabel,
                                  errorBoundary: group.errorBoundary,
                                  color: group.color,
                              },
                          }
                        : {}),
                },
            };
        });

    const workflowEdges: ConvertedWorkflowEdge[] = rawEdges
        .filter(e => !skippedIds.has(e.source) && !skippedIds.has(e.target))
        .map(e => ({
            id: e.id,
            source: e.source,
            sourceHandle: e.sourceHandle || undefined,
            target: e.target,
            targetHandle: e.targetHandle || undefined,
            condition: e.data?.condition || undefined,
        }));

    return { nodes: workflowNodes, edges: workflowEdges };
}

/**
 * Derive the workflow trigger from converted canvas nodes. Picks the first
 * trigger node, maps legacy subType mismatches onto the model enum, and uses the
 * trigger node's raw config. Falls back to `{ type: 'manual', config: {} }` when
 * there's no trigger node.
 */
export function deriveTriggerFromCanvasNodes(nodes: ConvertedWorkflowNode[]): IWorkflowTrigger {
    const triggerNode = nodes.find(n => n.type === 'trigger');
    if (!triggerNode) {
        return { type: 'manual', config: {} };
    }

    const rawSubType = triggerNode.subType;
    const type = TRIGGER_SUBTYPE_ALIASES[rawSubType] || (rawSubType as TriggerSubType);
    const config = (triggerNode.data?.config || {}) as IWorkflowTrigger['config'];

    return { type, config };
}

export interface SyncCanvasOptions {
    userId: string;
}

/**
 * Materialize (create or update) the UnifiedWorkflow shadow for a canvas and
 * refresh its trigger from the canvas's trigger node. When the resolved trigger
 * is `scheduled` and the workflow is active, (re)register its repeatable job.
 *
 * Returns the workflow, or null when the canvas has no executable nodes.
 */
export async function syncCanvasWorkflow(
    canvas: CanvasDoc,
    { userId }: SyncCanvasOptions
): Promise<IUnifiedWorkflow | null> {
    const { nodes, edges } = convertCanvasToWorkflow(canvas);
    if (nodes.length === 0) {
        return null;
    }
    const trigger = deriveTriggerFromCanvasNodes(nodes);

    let workflow = await UnifiedWorkflow.findOne({ canvasId: canvas._id });

    if (!workflow) {
        workflow = new UnifiedWorkflow({
            _id: new Types.ObjectId(),
            createdById: new Types.ObjectId(userId),
            name: canvas.name || 'Canvas Workflow',
            description: 'Auto-generated from canvas',
            type: WorkflowType.UNIFIED,
            status: WorkflowStatus.ACTIVE,
            trigger,
            nodes,
            edges,
            canvasId: canvas._id,
            variables: [],
            credentials: [],
            errorHandling: {
                retryEnabled: false,
                maxRetries: 0,
                retryDelay: 1000,
                retryBackoff: 'exponential',
                onErrorAction: 'stop',
            },
            runOnce: false,
            enableParallel: true,
            enableLoops: true,
            executionCount: 0,
            successCount: 0,
            failureCount: 0,
            isTemplate: false,
            version: 1,
        });
        await workflow.save();
    } else {
        workflow.nodes = nodes as unknown as typeof workflow.nodes;
        workflow.edges = edges as unknown as typeof workflow.edges;
        workflow.trigger = trigger as unknown as typeof workflow.trigger;
        // Preserve a user-set paused/archived status. Status is set ACTIVE only on
        // initial creation (above) or via an explicit activate path — never forced
        // back to ACTIVE here, or a "turned off" automation would silently re-arm.
        await workflow.save();
    }

    // Keep the scheduler in sync for cron-triggered canvases. Register when the
    // workflow is an active scheduled trigger; otherwise tear down any repeatable
    // job that may exist (status flipped away from active, or the trigger type
    // changed away from 'scheduled') so orphaned crons stop firing.
    const isActiveSchedule =
        workflow.trigger?.type === 'scheduled' && workflow.status === WorkflowStatus.ACTIVE;
    try {
        if (isActiveSchedule) {
            await registerScheduledWorkflow(workflow as unknown as Parameters<typeof registerScheduledWorkflow>[0]);
        } else {
            await unregisterScheduledWorkflow(String(workflow._id));
        }
    } catch (err) {
        console.error('[canvas-sync] Failed to sync scheduled workflow:', err);
    }

    // Same lifecycle for polling triggers (H5): register a repeatable poll job
    // when the workflow is an active polling trigger, otherwise tear down any
    // poll schedule that may exist so paused/retyped automations stop polling.
    const isActivePolling =
        workflow.trigger?.type === 'polling' && workflow.status === WorkflowStatus.ACTIVE;
    try {
        if (isActivePolling) {
            await registerPollingWorkflow(workflow as unknown as Parameters<typeof registerPollingWorkflow>[0]);
        } else {
            await unregisterPollingWorkflow(String(workflow._id));
        }
    } catch (err) {
        console.error('[canvas-sync] Failed to sync polling workflow:', err);
    }

    return workflow;
}

import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';

/**
 * Agent ↔ workflow ties (TODO 2.26).
 *
 * These tools run inside the agent runtime, which executes in the BullMQ worker
 * process as well as in API routes. The worker has no HTTP origin / session, so
 * every data access here is a DIRECT, org-scoped repository/model read (the
 * pattern other agent tools follow) — never a relative `fetch()`.
 *
 * Workflows are the UNIFIED workflow model (the target system), enqueued through
 * the shared execution queue so the agent shares crash-recovery, quota and
 * idempotency with every other trigger path.
 */

export const triggerWorkflowTool = {
    name: 'triggerWorkflow',
    description:
        'Trigger/start a specific automated (unified) workflow for the current brand. ' +
        'Provide either the workflow id or its name. Use this when the user asks to ' +
        '"run the Welcome Flow" or similar commands.',
    parameters: z.object({
        workflowId: z.string().optional().describe('The unified workflow id (preferred — exact match).'),
        workflowName: z.string().optional().describe('The workflow name (fallback when no id is known; matched case-insensitively).'),
        contactId: z.string().optional().describe('Optional CRM Contact ID to run this workflow for.'),
        triggerData: z.record(z.unknown()).optional().describe('Optional key/value data passed to the workflow as trigger data.'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Trigger an automated (unified) workflow by id or name.',
        parameters: z.object({
            workflowId: z.string().optional(),
            workflowName: z.string().optional(),
            contactId: z.string().optional(),
            triggerData: z.record(z.unknown()).optional(),
        }),
        execute: async (args) => {
            try {
                if (!args.workflowId && !args.workflowName) {
                    return { success: false, error: 'Provide either workflowId or workflowName.' };
                }

                const { dbConnect } = await import('@/lib/db/connect');
                await dbConnect();
                const { UnifiedWorkflow } = await import('@/lib/db/models/unified-workflow.model');

                // Org scope is read from the agent context (session-derived), never
                // from the model args. Brand scope narrows it when present.
                const orgScope: Record<string, unknown> = { };
                if (context.brandId) orgScope.brandId = context.brandId;

                let targetWf = null;
                if (args.workflowId) {
                    targetWf = await UnifiedWorkflow.findOne({ _id: args.workflowId }).exec();
                }
                if (!targetWf && args.workflowName) {
                    // Name fallback — case-insensitive exact, then "contains".
                    const name = args.workflowName.trim();
                    targetWf =
                        (await UnifiedWorkflow.findOne({ ...orgScope, name: new RegExp(`^${escapeRegExp(name)}$`, 'i') }).exec()) ||
                        (await UnifiedWorkflow.findOne({ ...orgScope, name: new RegExp(escapeRegExp(name), 'i') }).exec());
                }

                if (!targetWf) {
                    const available = await UnifiedWorkflow.find(orgScope).select('name').limit(25).lean().exec();
                    return {
                        success: false,
                        message: `Could not find a workflow matching '${args.workflowId ?? args.workflowName}'.`,
                        availableWorkflows: available.map((w: { _id: { toString(): string }; name: string }) => ({ id: w._id.toString(), name: w.name })),
                    };
                }

                // Enqueue via the shared execution queue (crash-safe, quota-gated).
                const { enqueueExecution } = await import('@/lib/workflow/queue/execution-queue');
                const triggerData: Record<string, unknown> = {
                    source: 'agent',
                    agentUserId: context.userId,
                    ...(context.missionId ? { missionId: context.missionId } : {}),
                    ...(args.triggerData ?? {}),
                };

                const result = await enqueueExecution({
                    workflowId: targetWf._id.toString(),
                    userId: context.userId,
                    triggerData,
                    ...(args.contactId ? { contactId: args.contactId } : {}),
                    source: 'agent',
                });

                return {
                    success: true,
                    message: `Queued workflow '${targetWf.name}'${args.contactId ? ` for contact ${args.contactId}` : ''}.`,
                    workflowId: targetWf._id.toString(),
                    executionId: result.executionId,
                    jobId: result.jobId,
                    status: result.queued ? 'queued' : 'started',
                };
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Failed to trigger workflow';
                console.error('[Agent Tool - Workflow] Trigger failed:', errorMessage);
                return { success: false, error: errorMessage };
            }
        },
    }),
};

toolRegistry.register(triggerWorkflowTool);

// ─── B1-2.9 extended workflow tools (2.26: direct repo reads, no relative fetch) ─

const listWorkflowsParams = z.object({
  limit: z.number().optional().describe('Max workflows to return. Default: 20.'),
});

export const listWorkflowsTool = {
  name: 'list_workflows',
  description: 'List unified workflows for the current brand/organization.',
  parameters: listWorkflowsParams,
  factory: (context: AgentContext) => tool({
    description: 'List available workflows.',
    parameters: listWorkflowsParams,
    execute: async (args) => {
      try {
        const { dbConnect } = await import('@/lib/db/connect');
        await dbConnect();
        const { UnifiedWorkflow } = await import('@/lib/db/models/unified-workflow.model');

        const scope: Record<string, unknown> = { };
        if (context.brandId) scope.brandId = context.brandId;

        const docs = await UnifiedWorkflow.find(scope)
          .select('name description status type executionCount lastExecutedAt lastExecutionStatus')
          .sort({ updatedAt: -1 })
          .limit(Math.max(1, Math.min(args.limit ?? 20, 100)))
          .lean()
          .exec();

        const workflows = docs.map((w: Record<string, unknown> & { _id: { toString(): string } }) => ({
          id: w._id.toString(),
          name: w.name,
          description: w.description,
          status: w.status,
          type: w.type,
          executionCount: w.executionCount,
          lastExecutedAt: w.lastExecutedAt,
          lastExecutionStatus: w.lastExecutionStatus,
        }));

        return { success: true, workflows };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

export const getExecutionStatusTool = {
  name: 'get_execution_status',
  description: 'Get the current status of a workflow execution.',
  parameters: z.object({ executionId: z.string() }),
  factory: (context: AgentContext) => tool({
    description: 'Get workflow execution status.',
    parameters: z.object({ executionId: z.string() }),
    execute: async (args) => {
      try {
        const { dbConnect } = await import('@/lib/db/connect');
        await dbConnect();
        const { UnifiedWorkflowExecution } = await import('@/lib/db/models/unified-workflow-execution.model');

        // Org-scoped — an executionId from another tenant returns not-found.
        const exec = await UnifiedWorkflowExecution.findOne({
          _id: args.executionId
        })
          .select('status startedAt completedAt error workflowId')
          .lean()
          .exec();

        if (!exec) {
          return { success: false, error: 'Execution not found in this organization.' };
        }

        const e = exec as unknown as {
          status: string; startedAt?: Date; completedAt?: Date; error?: string; workflowId?: { toString(): string };
        };
        return {
          success: true,
          status: e.status,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          ...(e.error ? { error: e.error } : {}),
          ...(e.workflowId ? { workflowId: e.workflowId.toString() } : {}),
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

export const cancelExecutionTool = {
  name: 'cancel_execution',
  description: 'Cancel a running workflow execution.',
  parameters: z.object({ executionId: z.string() }),
  factory: (context: AgentContext) => tool({
    description: 'Cancel a workflow execution.',
    parameters: z.object({ executionId: z.string() }),
    execute: async (args) => {
      try {
        const { dbConnect } = await import('@/lib/db/connect');
        await dbConnect();
        const { UnifiedWorkflowExecution } = await import('@/lib/db/models/unified-workflow-execution.model');
        const { ExecutionStatus } = await import('@/lib/db/models/unified-workflow.model');

        // Org-scoped — only cancel executions owned by the agent's organization.
        const exec = await UnifiedWorkflowExecution.findOne({
          _id: args.executionId
        }).exec();
        if (!exec) return { success: false, error: 'Execution not found in this organization.' };

        const { UnifiedWorkflowExecutionEngine } = await import('@/lib/workflow/unified-execution-engine');
        const { requestExecutionStop } = await import('@/lib/workflow/execution-stop-flag');

        // Signal the in-process engine + set the cross-process stop flag the
        // worker reads at its next node boundary (audit H13).
        const signalled = UnifiedWorkflowExecutionEngine.cancel(args.executionId);
        const flagged = await requestExecutionStop(args.executionId);

        if (
          exec.status === ExecutionStatus.RUNNING ||
          exec.status === ExecutionStatus.PENDING ||
          exec.status === ExecutionStatus.PAUSED
        ) {
          try {
            await exec.updateStatus(ExecutionStatus.CANCELLED, 'Execution cancelled by agent');
          } catch {/* non-fatal */}
        }

        return { success: true, executionId: args.executionId, signalled, flagged, status: ExecutionStatus.CANCELLED };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

toolRegistry.register(listWorkflowsTool);
toolRegistry.register(getExecutionStatusTool);
toolRegistry.register(cancelExecutionTool);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Delegate to Agent processor (TODO 2.26 — Agent ↔ workflow ties).
 *
 * subType: `delegate_to_agent`
 *
 * Hands a task off from a workflow run to the autonomous Agent module by creating
 * a focused agent MISSION (the lightweight, real server-side primitive the Agent
 * runtime already picks up — same primitive used by the in-agent `delegate_to_agent`
 * tool). The mission is created in `draft` status so it respects the user's
 * existing review/approval flow before the agent starts spending budget — i.e. no
 * autonomous side effects are kicked off implicitly from a workflow node.
 *
 * Config (resolved/interpolated by the engine before this runs):
 *   task: string            — required. The instruction handed to the agent.
 *   contextData?: unknown   — optional. Resolved value (or path output) attached
 *                             to the mission summary as supporting context.
 *   agentId?: string        — optional. Specialist agent id to assign.
 *
 * Output: { missionId, status: 'delegated' }
 */

import { NodeProcessor, NodeProcessorContext } from '../index';

export class DelegateToAgentProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution, workflow } = context;

    const task = String(config.task ?? '').trim();
    if (!task) {
      throw new Error('Delegate to Agent: a "task" instruction is required.');
    }

    // Org / user / brand come from the EXECUTION (session-derived) — never the
    // config. Brand falls back to the workflow's brand scope when the execution
    // record predates brand tagging.
    const userId = execution.userId.toString();
    const brandId = (execution.brandId ?? workflow.brandId)?.toString() ?? '';

    const agentId = config.agentId ? String(config.agentId) : undefined;

    // Optional supporting context — fold a compact JSON preview into the summary
    // so the agent sees what the workflow produced upstream.
    let summary = task;
    if (config.contextData !== undefined && config.contextData !== null && config.contextData !== '') {
      let preview: string;
      try {
        preview = typeof config.contextData === 'string'
          ? config.contextData
          : JSON.stringify(config.contextData);
      } catch {
        preview = String(config.contextData);
      }
      if (preview.length > 2_000) preview = `${preview.slice(0, 2_000)}…`;
      summary = `${task}\n\nContext from workflow "${workflow.name}":\n${preview}`;
    }

    const { dbConnect } = await import('@/lib/db/connect');
    await dbConnect();
    const { agentMissionRepository } = await import('@/lib/db/repository/agent-mission.repository');

    // Create as `draft` so the user's existing HITL/review flow gates it before
    // the agent acts — workflow nodes do not silently launch autonomous work.
    const mission = await agentMissionRepository.create({
      brandId,
      userId,
      title: `[Workflow] ${task.slice(0, 80)}`,
      summary,
      status: 'draft',
      mode: 'approval-first',
      ...(agentId ? { activeAgentId: agentId } : {}),
    });

    const missionId = mission._id.toString();

    // Link the mission back to its originating execution for auditability.
    await agentMissionRepository.appendEvent({
      missionId,
      brandId,
      userId,
      type: 'tool_call',
      role: 'system',
      content: `Created by workflow "${workflow.name}" (execution ${execution._id.toString()}).`,
      metadata: {
        sourceExecutionId: execution._id.toString(),
        sourceWorkflowId: workflow._id.toString(),
      },
    }).catch(() => {/* non-fatal */});

    return {
      missionId,
      status: 'delegated',
      message: `Delegated to the agent as mission ${missionId} (awaiting review).`,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.task || !String(config.task).trim()) {
      errors.push('A task instruction is required.');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

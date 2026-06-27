/**
 * B1-3.3 — Agent delegation tool.
 *
 * `delegate_to_agent` lets the current agent spawn a focused sub-mission and
 * hand off a subtask to a named specialist.  Budget is deducted from the parent
 * mission so the combined spend never exceeds the original cap.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import { AgentContext } from './types';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { dbConnect } from '@/lib/db/connect';
import AgentMission from '@/lib/db/models/agent-mission.model';
import { AGENT_DEFINITIONS } from '@/lib/agent/multi-agent/agent-definitions';
import {
  resolveDefaultMissionMode,
  resolveDefaultMissionLimits,
} from '@/lib/agent/safety-defaults';

const DELEGATABLE_AGENTS = AGENT_DEFINITIONS
  .filter(a => a.id !== 'general-agent')
  .map(a => a.id) as [string, ...string[]];

export const delegateToAgentTool = {
  name: 'delegate_to_agent',
  description:
    'Spawn a focused sub-mission and delegate a subtask to a specialist agent. ' +
    'Useful when the current task requires a different domain expert (e.g., delegate inbox handling to inbox-agent while continuing CRM work). ' +
    'The sub-mission shares the parent brandId and inherits the parent autonomy mode. ' +
    'Budget is carved out of the parent mission.',
  parameters: z.object({
    agentId: z
      .enum(DELEGATABLE_AGENTS)
      .describe('ID of the specialist agent to delegate to.'),
    task: z
      .string()
      .min(10)
      .max(500)
      .describe('Clear description of the task to delegate.'),
    budgetCredits: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .default(50)
      .describe('Credit budget to allocate to the sub-mission (deducted from parent). Default 50.'),
  }),
  factory: (context: AgentContext) =>
    tool({
      description: 'Delegate a subtask to a specialist sub-mission.',
      parameters: z.object({
        agentId: z.enum(DELEGATABLE_AGENTS),
        task: z.string().min(10).max(500),
        budgetCredits: z.number().int().min(1).max(500).optional().default(50),
      }),
      execute: async (args) => {
        try {
          await dbConnect();

          const budget = args.budgetCredits ?? 50;

          // Deduct budget from parent mission first (guard against overspend).
          if (context.missionId) {
            const parent = await AgentMission.findOneAndUpdate(
              {
                _id: context.missionId,
                'limits.maxCredits': { $gte: budget },
              },
              { $inc: { 'limits.maxCredits': -budget } },
              { new: false },
            ).exec();

            if (!parent) {
              return {
                success: false,
                error:
                  'Insufficient budget in parent mission to delegate. ' +
                  `Requested ${budget} credits but parent does not have enough.`,
              };
            }
          }

          // Find the target agent definition.
          const agentDef = AGENT_DEFINITIONS.find(a => a.id === args.agentId);

          // Create sub-mission.
          const subMission = await agentMissionRepository.create({
            brandId: context.brandId || '',
            userId: context.userId,
            parentMissionId: context.missionId ?? undefined,
            title: `[Delegated] ${args.task.slice(0, 80)}`,
            summary: args.task,
            status: 'active',
            // OSS safety (H6): delegated sub-missions inherit the supervised
            // default unless the deployment opts into the permissive posture.
            mode: resolveDefaultMissionMode(),
            activeAgentId: args.agentId,
            limits: {
              ...resolveDefaultMissionLimits(),
              maxCredits: budget,
            },
          });

          // Append delegation event to parent timeline.
          if (context.missionId) {
            await agentMissionRepository.appendEvent({
              missionId: context.missionId,
              brandId: context.brandId || '',
              userId: context.userId,
              sessionId: `delegate-${Date.now()}`,
              type: 'tool_call',
              role: 'system',
              content: `Delegated subtask to ${agentDef?.name ?? args.agentId}: "${args.task.slice(0, 120)}"`,
              metadata: {
                subMissionId: subMission._id.toString(),
                delegatedAgentId: args.agentId,
                budgetAllocated: budget,
              },
            }).catch(() => {/* non-fatal */});
          }

          return {
            success: true,
            subMissionId: subMission._id.toString(),
            agentId: args.agentId,
            agentName: agentDef?.name ?? args.agentId,
            message:
              `Sub-mission created and assigned to ${agentDef?.name ?? args.agentId}. ` +
              `Sub-mission ID: ${subMission._id.toString()}. ` +
              `Budget allocated: ${budget} credits. ` +
              `The user will see the sub-mission in their mission list.`,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delegate task',
          };
        }
      },
    }),
};

toolRegistry.register(delegateToAgentTool);

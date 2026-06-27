/**
 * Approval agent tools (B1-2.10).
 *
 * Lets the agent voluntarily request human review even for non-gated actions,
 * and check the status of a prior approval request.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';

const requestApprovalTool = {
  name: 'request_approval',
  description: 'Voluntarily request human review before taking an action the agent is uncertain about.',
  parameters: z.object({
    summary: z.string().describe('What the agent wants to do and why it needs human confirmation.'),
    payload: z.string().describe('JSON string with the action payload for the reviewer to inspect.'),
    deadline: z.string().optional().describe('ISO 8601 datetime by which approval is needed.'),
  }),
  factory: (context: AgentContext) => tool({
    description: 'Request human approval for an action.',
    parameters: z.object({
      summary: z.string(),
      payload: z.string(),
      deadline: z.string().optional(),
    }),
    execute: async (args) => {
      try {
        const { createApproval } = await import('@/lib/approvals');
        let parsedPayload: unknown;
        try { parsedPayload = JSON.parse(args.payload); } catch { parsedPayload = args.payload; }
        const approval = await createApproval({
          brandId: context.brandId,
          subjectKind: 'workflow-action',
          subjectId: context.missionId ?? 'unknown',
          submittedBy: context.userId,
          subjectSummary: { summary: args.summary, payload: parsedPayload, missionId: context.missionId },
          expiresAt: args.deadline ? new Date(args.deadline) : undefined,
        });
        return {
          status: 'awaiting_approval',
          approvalId: approval._id?.toString(),
          message: 'Approval request created. The agent will wait for human decision.',
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

const getApprovalStatusTool = {
  name: 'get_approval_status',
  description: 'Check the status of a previously created approval request.',
  parameters: z.object({
    approvalId: z.string(),
  }),
  factory: (_context: AgentContext) => tool({
    description: 'Check approval request status.',
    parameters: z.object({ approvalId: z.string() }),
    execute: async (args) => {
      try {
        const response = await fetch(`/api/v2/approvals/${args.approvalId}`);
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return {
          success: true,
          status: data.status,
          decidedAt: data.decidedAt,
          decidedBy: data.decidedBy,
          comment: data.comment,
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

toolRegistry.register(requestApprovalTool);
toolRegistry.register(getApprovalStatusTool);

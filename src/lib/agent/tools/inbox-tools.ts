/**
 * Inbox agent tools (B1-2.5).
 *
 * Wraps the omnichannel inbox APIs (inbox-conversation + inbox-message).
 * Escalate routes to the central approval queue.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';

// ─── list_conversations ──────────────────────────────────────────────────────

const listConversationsParams = z.object({
  channelFilter: z.string().optional().describe('e.g. whatsapp, email, instagram'),
  statusFilter: z.enum(['open', 'resolved', 'pending']).optional(),
  limit: z.number().optional().describe('Max results. Default: 20.'),
});

const listConversationsTool = {
  name: 'list_conversations',
  description: 'List inbox conversations, optionally filtered by channel or status.',
  parameters: listConversationsParams,
  factory: (context: AgentContext) => tool({
    description: 'List inbox conversations.',
    parameters: listConversationsParams,
    execute: async (args) => {
      try {
        const params = new URLSearchParams({
          ...(args.channelFilter ? { channel: args.channelFilter } : {}),
          ...(args.statusFilter ? { status: args.statusFilter } : {}),
          limit: String(args.limit ?? 20),
        });
        const response = await fetch(`/api/v2/inbox/conversations?${params}`);
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, conversations: data.data ?? data };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── read_conversation ────────────────────────────────────────────────────────

const readConversationParams = z.object({
  conversationId: z.string(),
  limit: z.number().optional().describe('Max messages to return. Default: 50.'),
});

const readConversationTool = {
  name: 'read_conversation',
  description: 'Read the messages in an inbox conversation.',
  parameters: readConversationParams,
  factory: (_context: AgentContext) => tool({
    description: 'Read inbox conversation messages.',
    parameters: readConversationParams,
    execute: async (args) => {
      try {
        const params = new URLSearchParams({ limit: String(args.limit ?? 50) });
        const response = await fetch(`/api/v2/inbox/conversations/${args.conversationId}/messages?${params}`);
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, messages: data.data ?? data };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── send_reply ──────────────────────────────────────────────────────────────

const sendReplyTool = {
  name: 'send_reply',
  description: 'Send a reply in an inbox conversation. Requires approval.',
  parameters: z.object({
    conversationId: z.string(),
    message: z.string(),
  }),
  factory: (_context: AgentContext) => tool({
    description: 'Reply to an inbox conversation.',
    parameters: z.object({ conversationId: z.string(), message: z.string() }),
    execute: async (args) => {
      try {
        const response = await fetch(`/api/v2/inbox/conversations/${args.conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: args.message, type: 'text' }),
        });
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, messageId: data.id ?? data._id };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── assign_to_user ──────────────────────────────────────────────────────────

const assignToUserTool = {
  name: 'assign_to_user',
  description: 'Assign an inbox conversation to a team member.',
  parameters: z.object({
    conversationId: z.string(),
    userId: z.string().describe('Team member user ID to assign to.'),
  }),
  factory: (_context: AgentContext) => tool({
    description: 'Assign inbox conversation to a user.',
    parameters: z.object({ conversationId: z.string(), userId: z.string() }),
    execute: async (args) => {
      try {
        const response = await fetch(`/api/v2/inbox/conversations/${args.conversationId}/assign`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignedTo: args.userId }),
        });
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── escalate_conversation ───────────────────────────────────────────────────

const escalateConversationTool = {
  name: 'escalate_conversation',
  description: 'Escalate an inbox conversation to the human approval queue with a reason.',
  parameters: z.object({
    conversationId: z.string(),
    reason: z.string().describe('Why this conversation needs human attention.'),
  }),
  factory: (context: AgentContext) => tool({
    description: 'Escalate inbox conversation for human review.',
    parameters: z.object({ conversationId: z.string(), reason: z.string() }),
    execute: async (args) => {
      try {
        const { createApproval } = await import('@/lib/approvals');
        const approval = await createApproval({
          brandId: context.brandId,
          subjectKind: 'inbox-escalation',
          subjectId: args.conversationId,
          submittedBy: context.userId,
          subjectSummary: { reason: args.reason, conversationId: args.conversationId, missionId: context.missionId },
        });
        return { success: true, approvalId: approval._id?.toString(), reason: args.reason };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

toolRegistry.register(listConversationsTool);
toolRegistry.register(readConversationTool);
toolRegistry.register(sendReplyTool);
toolRegistry.register(assignToUserTool);
toolRegistry.register(escalateConversationTool);

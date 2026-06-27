/**
 * escalateToHuman — bot raises a flag for human takeover.
 *
 * Side effects (channel-aware):
 *   1. Mark conversation state escalation flag + reason.
 *   2. Flip conversation.assignedToId to escalationRules.defaultAssigneeId
 *      if configured; otherwise leave null (queue).
 *   3. Fire `ai_bot.escalation_requested` workflow trigger.
 *   4. Publish `ai_bot.escalation_requested` domain event.
 *   5. Mirror into the central approval queue under subjectKind 'inbox-escalation'.
 */

import { z } from 'zod';

import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import WhatsAppConversation from '@/lib/db/models/whatsapp-conversation.model';
import AiBot from '@/lib/db/models/ai-bot.model';
import { aiBotConversationStateRepository } from '@/lib/db/repository/ai-bot-conversation-state.repository';
import { publishDomainEvent } from '@/lib/events/domain-bus';
import { createApproval } from '@/lib/approvals';
import { emitAiBotEscalationRequested } from '@/lib/workflow/triggers';

import type { BotTool } from './types';

const params = z.object({
  reason: z.string().min(1).max(500).describe('Why the bot is escalating. Shown to the human taking over.'),
});

export const escalateToHumanTool: BotTool<
  z.infer<typeof params>,
  { escalated: true } | { error: string }
> = {
  name: 'escalateToHuman',
  description:
    'Escalate this conversation to a human agent. Use when the request exceeds your knowledge, the customer asks for a person, or you cannot resolve their issue.',
  parameters: params,
  execute: async (ctx, args) => {
    try {
      const bot = await AiBot.findById(ctx.aiBotId).lean();
      const defaultAssigneeId = bot?.escalationRules?.defaultAssigneeId;

      if (ctx.stateId) {
        await aiBotConversationStateRepository.markEscalated(ctx.stateId, args.reason);
      }

      const update: Record<string, unknown> = {
        assignedToId: defaultAssigneeId ?? null,
        assignedAt: new Date(),
      };

      if (ctx.channel === 'whatsapp') {
        await WhatsAppConversation.updateOne({ _id: ctx.conversationId }, { $set: update }).exec();
      } else if (ctx.channel === 'inbox') {
        await InboxConversation.updateOne({ _id: ctx.conversationId }, { $set: update }).exec();
      }
      // Voice escalation: caller-side transfer is handled by the voice engine
      // when it sees state.escalationRequested. No conversation row to flip.

      await emitAiBotEscalationRequested({
        brandId: ctx.brandId ?? undefined,
        aiBotId: ctx.aiBotId,
        conversationId: ctx.conversationId,
        channel: ctx.channel,
        reason: args.reason,
      });

      publishDomainEvent({
        type: 'ai_bot.escalation_requested',
        brandId: ctx.brandId ?? undefined,
        source: 'ai-bot.escalateToHuman',
        payload: {
          aiBotId: ctx.aiBotId,
          conversationId: ctx.conversationId,
          channel: ctx.channel,
          reason: args.reason,
        },
      });

      try {
        await createApproval({
          brandId: ctx.brandId ?? undefined,
          subjectKind: 'inbox-escalation',
          subjectId: ctx.conversationId,
          subjectSummary: {
            channel: ctx.channel,
            aiBotId: ctx.aiBotId,
            reason: args.reason,
          },
          submittedBy: ctx.aiBotId,
          assignee: defaultAssigneeId ? String(defaultAssigneeId) : undefined,
          priority: 'normal',
        });
      } catch (err) {
        // Don't fail escalation if approval mirror fails.
        console.error('[ai-bot.escalate] createApproval failed:', err);
      }

      return { escalated: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
};

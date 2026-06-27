/**
 * AssignAiBotToConversationProcessor — replaces the NotImplementedProcessor stub
 * registered for `assign_ai_bot_to_conversation` (B3-4.5.8).
 *
 * Sets `conversation.aiBotId = botId` for the target conversation (whatsapp or
 * inbox), and optionally fires an opening turn if `greetOnAssign` is set on the
 * bot or overridden in actionConfig.
 *
 * Inputs (resolved from node.config via variableResolver):
 *   - botId: string                  (required)
 *   - conversationId: string         (required)
 *   - channel: 'whatsapp' | 'inbox'  (required)
 *   - greetOnAssign?: boolean        (overrides bot.routingDefaults.greetOnAssign)
 *   - openingMessage?: string        (used when greetOnAssign is true)
 */

import { Types } from 'mongoose';

import { aiBotRepository } from '@/lib/db/repository/ai-bot.repository';
import WhatsAppConversation, { IWhatsAppConversation } from '@/lib/db/models/whatsapp-conversation.model';
import InboxConversation, { IInboxConversation } from '@/lib/db/models/inbox-conversation.model';
import WhatsAppAccount, { IWhatsAppAccount } from '@/lib/db/models/whatsapp-account.model';

import { aiBotConversationStateRepository } from '@/lib/db/repository/ai-bot-conversation-state.repository';

import type { NodeProcessor, NodeProcessorContext } from '../index';

export class AssignAiBotToConversationProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const cfg = context.config;
    const botId = String(cfg.botId ?? '');
    const conversationId = String(cfg.conversationId ?? '');
    const channel = String(cfg.channel ?? '') as 'whatsapp' | 'inbox';

    if (!botId || !Types.ObjectId.isValid(botId)) {
      throw new Error('assign_ai_bot_to_conversation: missing or invalid botId.');
    }
    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      throw new Error('assign_ai_bot_to_conversation: missing or invalid conversationId.');
    }
    if (channel !== 'whatsapp' && channel !== 'inbox') {
      throw new Error(`assign_ai_bot_to_conversation: invalid channel '${channel}' (must be 'whatsapp' or 'inbox').`);
    }

    const bot = await aiBotRepository.findActiveById(botId, channel);
    if (!bot) {
      throw new Error(`assign_ai_bot_to_conversation: bot ${botId} not active or not enabled for channel '${channel}'.`);
    }

    if (channel === 'whatsapp') {
      const updated = await WhatsAppConversation.findOneAndUpdate(
        { _id: conversationId },
        { $set: { aiBotId: botId } },
        { new: true },
      ).exec();
      if (!updated) {
        throw new Error(`assign_ai_bot_to_conversation: whatsapp conversation ${conversationId} not found.`);
      }
      await aiBotConversationStateRepository.findOrCreate({
        brandId: updated.brandId ? String(updated.brandId) : null,
        aiBotId: botId,
        channel,
        conversationId,
        contactId: String(updated.contactId),
      });
    } else {
      const updated = await InboxConversation.findOneAndUpdate(
        { _id: conversationId },
        { $set: { aiBotId: botId } },
        { new: true },
      ).exec();
      if (!updated) {
        throw new Error(`assign_ai_bot_to_conversation: inbox conversation ${conversationId} not found.`);
      }
      await aiBotConversationStateRepository.findOrCreate({
        brandId: updated.brandId ? String(updated.brandId) : null,
        aiBotId: botId,
        channel,
        conversationId,
        contactId: String(updated.contactId),
      });
    }

    const greet = cfg.greetOnAssign ?? bot.routingDefaults?.greetOnAssign ?? true;
    let opening: { sent: boolean; reply?: string | null } = { sent: false };

    if (greet) {
      const openingPrompt = String(cfg.openingMessage ?? '').trim() ||
        '[system: the bot has just been assigned to this conversation. Greet the customer briefly and ask how you can help.]';
      try {
        const { runAiBotTurn } = await import('@/lib/ai-bots/runtime');
        if (channel === 'whatsapp') {
          const conversation = (await WhatsAppConversation.findById(conversationId).lean()) as IWhatsAppConversation | null;
          const account = conversation?.accountId
            ? ((await WhatsAppAccount.findById(conversation.accountId).lean()) as IWhatsAppAccount | null)
            : null;
          if (conversation && account) {
            const { createWhatsAppSender } = await import('@/lib/ai-bots/senders/whatsapp-sender');
            // We need the contact's phone number — look it up via crm contact.
            const CrmContact = (await import('@/lib/db/models/crm/contact.model')).default;
            const contact = (await CrmContact.findById(conversation.contactId).lean()) as { phone?: string } | null;
            const phone = contact?.phone;
            if (phone) {
              const sender = createWhatsAppSender({
                account,
                toPhone: phone,
                conversationId,
                aiBotId: botId,
              });
              const result = await runAiBotTurn({
                botId,
                channel: 'whatsapp',
                conversationId,
                brandId: conversation.brandId ? String(conversation.brandId) : null,
                contactId: String(conversation.contactId),
                inboundMessage: openingPrompt,
                sender,
              });
              opening = { sent: true, reply: result.reply };
            }
          }
        } else {
          const conversation = (await InboxConversation.findById(conversationId).lean()) as IInboxConversation | null;
          if (conversation) {
            const { createInboxSender } = await import('@/lib/ai-bots/senders/inbox-sender');
            const sender = createInboxSender({
              brandId: conversation.brandId ? String(conversation.brandId) : null,
              conversationId,
              channelId: String(conversation.channelId),
              contactId: String(conversation.contactId),
              aiBotId: botId,
            });
            const result = await runAiBotTurn({
              botId,
              channel: 'inbox',
              conversationId,
              brandId: conversation.brandId ? String(conversation.brandId) : null,
              contactId: String(conversation.contactId),
              inboundMessage: openingPrompt,
              sender,
            });
            opening = { sent: true, reply: result.reply };
          }
        }
      } catch (err) {
        console.error('[assign_ai_bot] opening greeting failed:', err);
      }
    }

    return {
      assigned: true,
      botId,
      conversationId,
      channel,
      opening,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.botId) errors.push('botId is required');
    if (!config.conversationId) errors.push('conversationId is required');
    if (config.channel !== 'whatsapp' && config.channel !== 'inbox') {
      errors.push("channel must be 'whatsapp' or 'inbox'");
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

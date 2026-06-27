/**
 * Inbox BotSender — writes an outbound inbox-message row + bumps conversation
 * metrics + emits a socket update if `global.io` is available.
 *
 * Channel-specific outbound delivery (e.g. sending the email/IG DM via the
 * actual provider) is handled by the inbox sender pipeline that watches for
 * new outbound rows. The bot just writes the row.
 */

import InboxMessage from '@/lib/db/models/inbox-message.model';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';

import type { BotSender } from './types';

export interface InboxSenderOptions {
  brandId?: string | null;
  conversationId: string;
  channelId: string;
  contactId: string;
  aiBotId: string;
}

declare global {
  // eslint-disable-next-line no-var
  var io: { to: (room: string) => { emit: (event: string, payload: unknown) => void } } | undefined;
}

export function createInboxSender(opts: InboxSenderOptions): BotSender {
  return {
    async send(text: string): Promise<void> {
      const message = await InboxMessage.create({
        brandId: opts.brandId ?? null,
        conversationId: opts.conversationId,
        channelId: opts.channelId,
        contactId: opts.contactId,
        direction: 'outbound',
        messageType: 'text',
        content: text,
        status: 'sent',
        sentAt: new Date(),
        isNote: false,
        metadata: { sentByAiBot: opts.aiBotId },
      });

      try {
        await InboxConversation.updateOne(
          { _id: opts.conversationId },
          {
            $inc: { totalMessages: 1 },
            $set: { lastMessageAt: new Date(), lastMessageType: 'outgoing' },
          },
        ).exec();
      } catch (err) {
        console.error('[ai-bot.inbox-sender] conversation update failed:', err);
      }

      try {
        global.io?.to(`conversation:${opts.conversationId}`).emit('message:new', message);
      } catch {
        // Socket.io not available in this process; safe to ignore.
      }
    },
  };
}

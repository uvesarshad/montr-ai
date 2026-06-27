/**
 * WhatsApp BotSender — wraps whatsappService.sendMessage and persists the
 * outbound row with `metadata.sentByAiBot` so audit/UI can distinguish bot
 * replies from human-agent replies.
 */

import { whatsappService } from '@/lib/services/whatsapp.service';
import type { IWhatsAppAccount } from '@/lib/db/models/whatsapp-account.model';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';

import type { BotSender } from './types';

export interface WhatsAppSenderOptions {
  account: IWhatsAppAccount;
  toPhone: string;
  conversationId: string;
  aiBotId: string;
}

export function createWhatsAppSender(opts: WhatsAppSenderOptions): BotSender {
  return {
    async send(text: string): Promise<void> {
      const response = await whatsappService.sendMessage(opts.account, {
        messaging_product: 'whatsapp',
        to: opts.toPhone,
        type: 'text',
        text: { body: text },
      });

      try {
        await whatsappMessageRepository.create({
          whatsappAccountId: String(opts.account._id),
          phoneNumber: opts.toPhone,
          direction: 'outbound',
          messageType: 'text',
          content: text,
          status: 'sent',
          sentAt: new Date(),
          fbMessageId: response?.messages?.[0]?.id,
          metadata: {
            sentByAiBot: opts.aiBotId,
            conversationId: opts.conversationId,
          },
        });
      } catch (err) {
        console.error('[ai-bot.whatsapp-sender] message persist failed:', err);
      }
    },
  };
}

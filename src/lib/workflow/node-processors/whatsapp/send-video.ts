/**
 * Send WhatsApp Video Processor
 *
 * Mirrors send-image with `type: 'video'`. The WhatsApp Cloud API supports
 * either a hosted URL (link) or a previously-uploaded media id.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { whatsappService } from '../../../services/whatsapp.service';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { resolveWhatsAppAccount } from './resolve-account';
import { assertConversationWindowOpen } from './compliance-gate';

export class SendWhatsAppVideoProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const videoUrl = config.videoUrl ? String(config.videoUrl) : undefined;
    const mediaId = config.mediaId ? String(config.mediaId) : undefined;
    const caption = config.caption ? String(config.caption) : undefined;

    if (!videoUrl && !mediaId) {
      throw new Error('videoUrl or mediaId is required');
    }

    // Resolve WhatsApp account (brand-aware, org from execution).
    const { account } = await resolveWhatsAppAccount(context);

    if (!execution.contactId) throw new Error('Contact ID is required for WhatsApp messages');

    const contact = await contactRepository.findById(
      execution.contactId.toString()
    );
    if (!contact) throw new Error(`Contact not found: ${execution.contactId}`);

    const whatsappChannel = contact.channels?.find(c => c.type === 'whatsapp');
    if (!whatsappChannel) {
      throw new Error(`Contact ${execution.contactId} has no WhatsApp channel`);
    }

    // Compliance: free-form media outside a template requires an open
    // 24-hour conversation window per Meta rules (hard-block).
    const compliance = await assertConversationWindowOpen(
      execution.contactId.toString(),
      whatsappChannel.identifier
    );

    // The WhatsAppMessage union doesn't list `'video'` as a type literal, so
    // we round-trip through `unknown` to extend the shape (library boundary).
    const videoPayload = {
      messaging_product: 'whatsapp',
      to: whatsappChannel.identifier,
      type: 'video',
      video: {
        link: videoUrl,
        id: mediaId,
        caption,
      },
    };
    const result = await whatsappService.sendMessage(
      account,
      videoPayload as unknown as Parameters<typeof whatsappService.sendMessage>[1]
    );

    return {
      sent: true,
      videoUrl,
      mediaId,
      caption,
      messageId: result.messages?.[0]?.id,
      recipientId: whatsappChannel.identifier,
      accountId: account._id?.toString(),
      compliance,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.videoUrl && !config.mediaId) {
      errors.push('videoUrl or mediaId is required');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}

/**
 * Send WhatsApp Image Processor
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { whatsappService } from '../../../services/whatsapp.service';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { resolveWhatsAppAccount } from './resolve-account';
import { assertConversationWindowOpen } from './compliance-gate';

export class SendWhatsAppImageProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    // Get image URL and caption
    const imageUrl = String(config.imageUrl || '');
    const caption = String(config.caption || '');

    if (!imageUrl) {
      throw new Error('Image URL is required');
    }

    // Resolve WhatsApp account (brand-aware, org from execution).
    const { account } = await resolveWhatsAppAccount(context);

    // Get contact
    if (!execution.contactId) {
      throw new Error('Contact ID is required for WhatsApp messages');
    }

    const contact = await contactRepository.findById(
      execution.contactId.toString()
    );

    if (!contact) {
      throw new Error(`Contact not found: ${execution.contactId}`);
    }

    // Get WhatsApp channel
    const whatsappChannel = contact.channels?.find((c) => c.type === 'whatsapp');
    if (!whatsappChannel) {
      throw new Error(`Contact ${execution.contactId} has no WhatsApp channel`);
    }

    // Compliance: free-form media outside a template requires an open
    // 24-hour conversation window per Meta rules (hard-block).
    const compliance = await assertConversationWindowOpen(
      execution.contactId.toString(),
      whatsappChannel.identifier
    );

    // Send image — cast through unknown because the WhatsAppMessage interface
    // does not yet include an `image` property (library boundary).
    type WhatsAppImageMessage = Parameters<typeof whatsappService.sendMessage>[1] & {
      image?: { link: string; caption?: string };
    };
    const result = await whatsappService.sendMessage(account, {
      messaging_product: 'whatsapp',
      to: whatsappChannel.identifier,
      type: 'image',
      image: {
        link: imageUrl,
        caption: caption || undefined,
      },
    } as WhatsAppImageMessage);

    return {
      sent: true,
      imageUrl,
      caption,
      messageId: result.messages?.[0]?.id,
      recipientId: whatsappChannel.identifier,
      accountId: account._id?.toString(),
      compliance
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.imageUrl) {
      errors.push('Image URL is required');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

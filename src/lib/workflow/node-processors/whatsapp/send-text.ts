/**
 * Send WhatsApp Text Message Processor
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { whatsappService } from '../../../services/whatsapp.service';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { resolveWhatsAppAccount } from './resolve-account';
import { assertConversationWindowOpen } from './compliance-gate';

export class SendWhatsAppTextProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    // Get message content
    const message = String(config.message || '');

    if (!message) {
      throw new Error('Message content is required');
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

    // Compliance: free-form text requires an open 24-hour window (hard-block).
    const compliance = await assertConversationWindowOpen(
      execution.contactId.toString(),
      whatsappChannel.identifier
    );

    // Dry-run (1.9): simulate the send after compliance passes — no API call.
    if (context.dryRun) {
      return {
        simulated: true,
        sent: false,
        wouldSend: { type: 'text', to: whatsappChannel.identifier, message },
        recipientId: whatsappChannel.identifier,
        accountId: account._id?.toString(),
        compliance,
      };
    }

    // Send message
    const result = await whatsappService.sendMessage(account, {
      messaging_product: 'whatsapp',
      to: whatsappChannel.identifier,
      type: 'text',
      text: { body: message }
    });

    return {
      sent: true,
      message,
      messageId: result.messages?.[0]?.id,
      recipientId: whatsappChannel.identifier,
      accountId: account._id?.toString(),
      compliance
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.message) {
      errors.push('Message content is required');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

/**
 * Send WhatsApp PDF / Document Processor
 *
 * The WhatsApp Cloud API uses `type: 'document'` for any file attachment.
 * We accept either a hosted URL or a previously-uploaded media id, plus an
 * optional caption and filename. The processor is named `send_whatsapp_pdf`
 * for parity with the legacy palette but works for any document MIME type.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { whatsappService } from '../../../services/whatsapp.service';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { resolveWhatsAppAccount } from './resolve-account';
import { assertConversationWindowOpen } from './compliance-gate';

export class SendWhatsAppPdfProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const documentUrl = config.pdfUrl ? String(config.pdfUrl)
      : config.documentUrl ? String(config.documentUrl)
      : undefined;
    const mediaId = config.mediaId ? String(config.mediaId) : undefined;
    const caption = config.caption ? String(config.caption) : undefined;
    const filename = config.filename ? String(config.filename) : undefined;

    if (!documentUrl && !mediaId) {
      throw new Error('pdfUrl, documentUrl, or mediaId is required');
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

    // Compliance: free-form document outside a template requires an open
    // 24-hour conversation window per Meta rules (hard-block).
    const compliance = await assertConversationWindowOpen(
      execution.contactId.toString(),
      whatsappChannel.identifier
    );

    type WhatsAppDocumentMessage = Parameters<typeof whatsappService.sendMessage>[1] & {
      document?: { link?: string; id?: string; caption?: string; filename?: string };
    };
    const result = await whatsappService.sendMessage(account, {
      messaging_product: 'whatsapp',
      to: whatsappChannel.identifier,
      type: 'document',
      document: {
        link: documentUrl,
        id: mediaId,
        caption,
        filename,
      },
    } as WhatsAppDocumentMessage);

    return {
      sent: true,
      documentUrl,
      mediaId,
      caption,
      filename,
      messageId: result.messages?.[0]?.id,
      recipientId: whatsappChannel.identifier,
      accountId: account._id?.toString(),
      compliance,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.pdfUrl && !config.documentUrl && !config.mediaId) {
      errors.push('pdfUrl, documentUrl, or mediaId is required');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}

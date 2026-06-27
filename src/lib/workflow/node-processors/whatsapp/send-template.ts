/**
 * Send WhatsApp Template Message Processor
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { whatsappService } from '../../../services/whatsapp.service';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { whatsappTemplateRepository } from '../../../db/repository/whatsapp-template.repository';
import { resolveWhatsAppAccount } from './resolve-account';
import { assertTemplateCompliant } from './compliance-gate';
import { buildTemplateComponents, type TemplateComponentsConfig } from './build-template-components';

export class SendWhatsAppTemplateProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    // Get template details
    const templateId = String(config.templateId || '');
    const templateLanguage = String(config.templateLanguage || 'en_US');
    const parameters = (config.parameters as unknown[] | undefined) || [];

    if (!templateId) {
      throw new Error('Template ID is required');
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

    // Compliance: template must be approved; MARKETING templates require
    // consent and respect do-not-contact (hard-block). The template must exist
    // in our DB and belong to this organization to be validated.
    const template = await whatsappTemplateRepository.findById(templateId);
    if (!template) {
      throw new Error(
        `Template '${templateId}' was not found for this organization — connect/import the template before sending.`
      );
    }
    const compliance = assertTemplateCompliant(template, contact);

    // Build the full Graph API `components` payload (2.11): header (text or
    // media), body positional/typed params, and button (quick-reply / url)
    // components. Plain-string `parameters` still map to BODY text params, so
    // existing template nodes keep working unchanged.
    const components = buildTemplateComponents({
      headerType: config.headerType as TemplateComponentsConfig['headerType'],
      headerText: config.headerText as string | undefined,
      headerMediaUrl: config.headerMediaUrl as string | undefined,
      headerMediaFilename: config.headerMediaFilename as string | undefined,
      parameters,
      buttons: config.buttons as TemplateComponentsConfig['buttons'],
    });

    // Dry-run (1.9): simulate the send after compliance passes — no API call.
    if (context.dryRun) {
      return {
        simulated: true,
        sent: false,
        wouldSend: { type: 'template', to: whatsappChannel.identifier, templateName: template.name, components },
        templateId,
        templateName: template.name,
        recipientId: whatsappChannel.identifier,
        accountId: account._id?.toString(),
        compliance,
      };
    }

    // Send template (use the approved template's actual name/language).
    const result = await whatsappService.sendMessage(account, {
      messaging_product: 'whatsapp',
      to: whatsappChannel.identifier,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language || templateLanguage },
        components,
      }
    });

    return {
      sent: true,
      templateId,
      templateName: template.name,
      parameters,
      messageId: result.messages?.[0]?.id,
      recipientId: whatsappChannel.identifier,
      accountId: account._id?.toString(),
      compliance
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.templateId) {
      errors.push('Template ID is required');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

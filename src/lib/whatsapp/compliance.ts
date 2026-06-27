import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';
import type { AuditSource } from '@/lib/db/models/crm/audit-log.model';
import type { ComplianceWarning } from '@/lib/db/repository/whatsapp-message.repository';
import type { IWhatsAppTemplate } from '@/lib/db/models/whatsapp-template.model';
import type { ICrmContact, IContactChannel } from '@/lib/db/models/crm/contact.model';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function getWhatsappIdentifier(contact: ICrmContact): string | null {
  const channel = contact.channels?.find((ch: IContactChannel) => ch.type === 'whatsapp');
  if (channel?.identifier) return channel.identifier;
  if (contact.phone) return contact.phone;
  return null;
}

export function hasDoNotContact(contact: ICrmContact): boolean {
  return !!contact.doNotContact;
}

export function hasMarketingConsent(contact: ICrmContact): boolean {
  return !!contact.marketingConsent;
}

export function isTemplateApproved(template: IWhatsAppTemplate): boolean {
  return template.status === 'APPROVED';
}

export function isMarketingTemplate(template: IWhatsAppTemplate): boolean {
  return template.category === 'MARKETING';
}

export async function isConversationWindowOpen(contactId: string): Promise<boolean> {
  const lastInbound = await whatsappMessageRepository.getLastInboundMessage(contactId);
  if (!lastInbound?.createdAt) return false;
  return Date.now() - lastInbound.createdAt.getTime() <= TWENTY_FOUR_HOURS_MS;
}

export function createComplianceWarning(
  code: string,
  message: string,
  context?: Record<string, unknown>
): ComplianceWarning {
  return {
    code,
    message,
    context,
    createdAt: new Date(),
  };
}

export async function recordComplianceWarning(params: {
  entityType: 'whatsapp_message' | 'crm_contact' | 'whatsapp_campaign';
  entityId: string;
  warning: ComplianceWarning;
  userId?: string;
  userName?: string;
  source?: AuditSource;
  messageId?: string;
}): Promise<void> {
  const { entityType, entityId, warning, userId, userName, source, messageId } = params;

  console.warn(`[WhatsApp Compliance] ${warning.message}`, warning.context || {});

  try {
    if (messageId) {
      await whatsappMessageRepository.appendComplianceWarning(messageId, warning);
    }
  } catch (error) {
    console.warn('[WhatsApp Compliance] Failed to append warning to message', error);
  }

  try {
    await auditLogRepository.create({
      entityType,
      entityId,
      action: 'updated',
      changes: [
        {
          field: 'whatsapp_compliance_warning',
          newValue: warning,
        },
      ],
      source: source || 'api',
      userId,
      userName,
    });
  } catch (error) {
    console.warn('[WhatsApp Compliance] Failed to write audit log', error);
  }
}

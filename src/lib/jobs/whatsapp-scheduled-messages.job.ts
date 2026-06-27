import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
// import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { whatsappTemplateRepository } from '@/lib/db/repository/whatsapp-template.repository';
import {
  getWhatsappIdentifier,
  hasDoNotContact,
  hasMarketingConsent,
  isConversationWindowOpen,
  isMarketingTemplate,
  createComplianceWarning,
  recordComplianceWarning,
  normalizePhone,
} from '@/lib/whatsapp/compliance';
import { connectDB } from '@/lib/mongodb';

/**
 * Job to process scheduled WhatsApp messages
 * Should run every minute
 */
export async function processScheduledWhatsAppMessages() {
  try {
    await connectDB();

    console.log('Starting WhatsApp scheduled messages job...');

    // Find scheduled messages due for sending
    const messages = await whatsappMessageRepository.findScheduledMessages();

    console.log(`Found ${messages.length} messages to send`);

    for (const message of messages) {
      try {
        // Update status to sending
        await whatsappMessageRepository.update(message._id.toString(), {
          status: 'sending',
        });

        // Get WhatsApp account
        const account = await whatsappAccountRepository.findById(message.whatsappAccountId.toString());
        if (!account) {
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'failed',
            failedReason: 'WhatsApp account not found',
          });
          continue;
        }

        // Get contact
        const contact = await contactRepository.findById(message.contactId.toString());
        if (!contact) {
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'failed',
            failedReason: 'Contact not found',
          });
          continue;
        }

        if (hasDoNotContact(contact)) {
          await recordComplianceWarning({
            entityType: 'whatsapp_message',
            entityId: message._id.toString(),
            warning: createComplianceWarning('dnc_contact', 'Contact marked do not contact (scheduled job)', {
              contactId: message.contactId.toString(),
              messageId: message._id.toString(),
            }),
            source: 'system',
            messageId: message._id.toString(),
          });
        }

        const identifier = getWhatsappIdentifier(contact);
        if (!identifier) {
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'failed',
            failedReason: 'Contact has no WhatsApp identifier',
          });
          continue;
        }

        const phoneNumber = normalizePhone(identifier);

        let response: Response;
        let success = false;
        let fbMessageId: string | undefined;
        let errorMessage: string | undefined;

        try {
          if (message.messageType === 'text') {
            const windowOpen = await isConversationWindowOpen(message.contactId.toString());
            if (!windowOpen) {
              await recordComplianceWarning({
                entityType: 'whatsapp_message',
                entityId: message._id.toString(),
                warning: createComplianceWarning('window_closed_text', '24-hour window closed for scheduled text message', {
                  contactId: message.contactId.toString(),
                  messageId: message._id.toString(),
                }),
                source: 'system',
                messageId: message._id.toString(),
              });
            }

            response = await fetch(
              `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${account.accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: phoneNumber,
                  type: 'text',
                  text: { body: message.content },
                }),
              }
            );
          } else if (message.messageType === 'template') {
            const template = message.templateId
              ? await whatsappTemplateRepository.findById(message.templateId.toString())
              : null;

            if (!template || template.status !== 'APPROVED') {
              await recordComplianceWarning({
                entityType: 'whatsapp_message',
                entityId: message._id.toString(),
                warning: createComplianceWarning('template_not_approved', 'Template not approved for scheduled message', {
                  messageId: message._id.toString(),
                  templateId: message.templateId?.toString(),
                  status: template?.status,
                }),
                source: 'system',
                messageId: message._id.toString(),
              });
            }

            if (template && isMarketingTemplate(template) && !hasMarketingConsent(contact)) {
              await recordComplianceWarning({
                entityType: 'whatsapp_message',
                entityId: message._id.toString(),
                warning: createComplianceWarning('marketing_consent_missing', 'Marketing consent missing for scheduled message', {
                  messageId: message._id.toString(),
                  contactId: message.contactId.toString(),
                }),
                source: 'system',
                messageId: message._id.toString(),
              });
            }

            const templateName = template?.name || message.templateName;
            const templateLanguage = template?.language || 'en';
            if (!templateName) {
              throw new Error('Template name missing for scheduled message');
            }

            response = await fetch(
              `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${account.accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: phoneNumber,
                  type: 'template',
                  template: {
                    name: templateName,
                    language: { code: templateLanguage },
                  },
                }),
              }
            );
          } else {
            // media
            const windowOpen = await isConversationWindowOpen(message.contactId.toString());
            if (!windowOpen) {
              await recordComplianceWarning({
                entityType: 'whatsapp_message',
                entityId: message._id.toString(),
                warning: createComplianceWarning('window_closed_media', '24-hour window closed for scheduled media message', {
                  contactId: message.contactId.toString(),
                  messageId: message._id.toString(),
                }),
                source: 'system',
                messageId: message._id.toString(),
              });
            }

            response = await fetch(
              `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${account.accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: phoneNumber,
                  type: message.messageType,
                  [message.messageType]: {
                    link: message.mediaUrl
                  },
                }),
              }
            );
          }

          if (response && response.ok) {
            const data = await response.json();
            success = true;
            fbMessageId = data.messages?.[0]?.id;
          } else {
            const errorData = response ? await response.json() : {};
            errorMessage = errorData?.error?.message || 'Unknown error response';
          }
        } catch (err) {
          errorMessage = (err as Error).message;
        }

        if (success) {
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'sent',
            sentAt: new Date(),
            fbMessageId: fbMessageId,
            failedReason: undefined
          });

          // Update campaign stats if part of a campaign
          if (message.campaignId) {
            // TODO: update stats
          }

        } else {
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'failed',
            failedReason: errorMessage || 'Send failed',
          });
        }
      } catch (error) {
        console.error(`Error sending message ${message._id}:`, error);
        await whatsappMessageRepository.update(message._id.toString(), {
          status: 'failed',
          failedReason: (error as Error).message,
        });
      }
    }

    console.log('WhatsApp scheduled messages job completed');
  } catch (error) {
    console.error('Error in WhatsApp scheduled messages job:', error);
  }
}

import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { connectDB } from '@/lib/mongodb';

/**
 * Job to retry failed WhatsApp messages
 * Should run every 5-10 minutes
 */
export async function retryWhatsAppMessages() {
  try {
    await connectDB();

    console.log('Starting WhatsApp message retry job...');

    // Find failed messages eligible for retry
    const messages = await whatsappMessageRepository.findFailedForRetry();

    console.log(`Found ${messages.length} messages to retry`);

    for (const message of messages) {
      try {
        // Check if max retries reached (already checked in query but double check)
        if (message.retryCount >= 3) {
          continue;
        }

        // Get WhatsApp account
        const account = await whatsappAccountRepository.findById(message.whatsappAccountId.toString());
        if (!account) {
          console.error(`WhatsApp account not found for message ${message._id}`);
          continue;
        }

        // Get contact
        const contact = await contactRepository.findById(message.contactId.toString());
        if (!contact || !contact.phone) {
          console.error(`Contact not found or invalid phone for message ${message._id}`);
          continue;
        }

        const phoneNumber = contact.phone.replace(/\D/g, '');

        // Calculate next retry delay (exponential backoff)
        const retryCount = message.retryCount || 0;
        const delayMinutes = Math.pow(2, retryCount) * 5; // 5, 10, 20 minutes
        const nextRetryAt = new Date();
        nextRetryAt.setMinutes(nextRetryAt.getMinutes() + delayMinutes);

        // Increment retry count immediately to prevent other workers from picking it up
        await whatsappMessageRepository.incrementRetryCount(message._id.toString(), nextRetryAt);

        let response: Response;
        let success = false;
        let fbMessageId: string | undefined;
        let errorMessage: string | undefined;

        try {
          if (message.messageType === 'text') {
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
            // TODO: Reconstruct template components based on message data if stored
            // For now simplistic retry
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
                    name: message.templateId, // Assuming this exists or stored
                    language: { code: 'en' },
                  },
                }),
              }
            );
          } else {
            // Media types
            // Simplistic media retry
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
                  type: message.messageType, // e.g. 'image'
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
        } else {
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'failed',
            failedReason: errorMessage || 'Retry failed',
          });
        }

      } catch (error) {
        console.error(`Error retrying message ${message._id}:`, error);
        await whatsappMessageRepository.update(message._id.toString(), {
          status: 'failed',
          failedReason: (error as Error).message,
        });
      }
    }

    console.log('WhatsApp message retry job completed');
  } catch (error) {
    console.error('Error in WhatsApp message retry job:', error);
  }
}

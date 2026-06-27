import WhatsAppAutoReply, { IWhatsAppAutoReply } from '@/lib/db/models/whatsapp-auto-reply.model';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { whatsappContactRepository } from '@/lib/db/repository/whatsapp-contact.repository';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { connectDB } from '@/lib/mongodb';

interface IncomingMessage {
  accountId: string;
  contactId: string;
  phoneNumber: string;
  content: string;
  messageType: string;
}

/**
 * Process incoming message and check for auto-reply triggers
 */
export async function processAutoReply(message: IncomingMessage) {
  try {
    await connectDB();

    // Get WhatsApp account
    const account = await whatsappAccountRepository.findById(message.accountId);
    if (!account) {
      console.error('WhatsApp account not found');
      return;
    }

    // Check if this is the first message from contact
    const messageHistory = await whatsappMessageRepository.find({
      accountId: message.accountId,
      contactId: message.contactId,
      type: 'incoming',
    });
    const isFirstMessage = messageHistory.length === 1; // Including current message

    // Get active auto-replies for this account
    const autoReplies = await WhatsAppAutoReply.find({
      whatsappAccountId: account._id,
      isActive: true,
    }).sort({ priority: -1 }); // Higher priority first

    // Find matching auto-reply
    let matchedReply = null;

    for (const reply of autoReplies) {
      // Check conditions
      if (reply.conditions?.isFirstMessage && !isFirstMessage) {
        continue;
      }

      // Check business hours if applicable
      if (reply.conditions?.businessHours?.enabled) {
        const now = new Date();
        const timezone = reply.conditions.businessHours.timezone || 'UTC';
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone }).toLowerCase() as
          | 'monday'
          | 'tuesday'
          | 'wednesday'
          | 'thursday'
          | 'friday'
          | 'saturday'
          | 'sunday';

        const schedule = reply.conditions.businessHours.schedule?.[currentDay];
        if (schedule) {
          const currentTime = now.toLocaleTimeString('en-US', { hour12: false, timeZone: timezone });
          if (currentTime < schedule.start || currentTime > schedule.end) {
            continue; // Outside business hours
          }
        }
      }

      // Check tag conditions
      if (reply.conditions?.tags && reply.conditions.tags.length > 0) {
        const contact = await whatsappContactRepository.findById(message.contactId);
        const contactTags = contact?.tags || [];
        const hasMatchingTag = reply.conditions.tags.some((tag: string) =>
          contactTags.some(t => t.toString() === tag)
        );
        if (!hasMatchingTag) {
          continue;
        }
      }

      // Check trigger type
      let triggered = false;

      switch (reply.trigger.type) {
        case 'welcome':
          triggered = isFirstMessage;
          break;

        case 'always':
          triggered = true;
          break;

        case 'greeting':
          const greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
          triggered = greetings.some((greeting) =>
            message.content.toLowerCase().includes(greeting)
          );
          break;

        case 'keyword':
        case 'exact_match':
        case 'contains':
          if (reply.trigger.keywords && reply.trigger.keywords.length > 0) {
            const matchType = reply.trigger.matchType || 'keyword';
            const lowerContent = message.content.toLowerCase();

            if (matchType === 'exact') {
              triggered = reply.trigger.keywords.some(
                (keyword: string) => lowerContent === keyword.toLowerCase()
              );
            } else if (matchType === 'contains') {
              triggered = reply.trigger.keywords.some((keyword: string) =>
                lowerContent.includes(keyword.toLowerCase())
              );
            } else {
              // keyword - word boundaries
              triggered = reply.trigger.keywords.some((keyword: string) => {
                const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'i');
                return regex.test(message.content);
              });
            }
          }
          break;
      }

      if (triggered) {
        matchedReply = reply;
        break; // Use first matched reply (highest priority)
      }
    }

    if (!matchedReply) {
      return; // No matching auto-reply
    }

    // Send auto-reply
    await sendAutoReply(matchedReply, message);

    // Check for chained reply
    if (matchedReply.nextReplyId && matchedReply.chainDelay) {
      // Schedule chained reply
      setTimeout(async () => {
        const nextReply = await WhatsAppAutoReply.findById(matchedReply.nextReplyId);
        if (nextReply && nextReply.isActive) {
          await sendAutoReply(nextReply, message);
        }
      }, matchedReply.chainDelay * 1000);
    }
  } catch (error) {
    console.error('Error processing auto-reply:', error);
  }
}

/**
 * Send auto-reply message
 */
async function sendAutoReply(reply: IWhatsAppAutoReply, incomingMessage: IncomingMessage) {
  try {
    // Get contact for variable replacement
    const account = await whatsappAccountRepository.findById(incomingMessage.accountId);
    if (!account) {
      console.error('Account not found');
      return;
    }

    const contact = await whatsappContactRepository.findById(incomingMessage.contactId);

    // Replace variables in content
    let content = reply.response.content;

    if (contact) {
      content = content
        .replace(/\{\{firstName\}\}/g, contact.firstName || '')
        .replace(/\{\{lastName\}\}/g, contact.lastName || '')
        .replace(/\{\{name\}\}/g, `${contact.firstName || ''} ${contact.lastName || ''}`.trim())
        .replace(/\{\{email\}\}/g, contact.email || '')
        .replace(/\{\{phone\}\}/g, contact.phone || '')
        .replace(/\{\{company\}\}/g, '');
    }

    // Apply delay if configured
    const delayMs = reply.response.delay;
    if (delayMs && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs * 1000));
    }

    // Prepare message payload
    const messagePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: incomingMessage.phoneNumber,
    };

    if (reply.response.type === 'template') {
      messagePayload.type = 'template';
      messagePayload.template = {
        name: reply.response.content,
        language: { code: reply.response.templateLanguage || 'en' },
      };
    } else {
      // Text message
      messagePayload.type = 'text';
      messagePayload.text = { body: content };

      // Add interactive buttons if present (max 3)
      if (reply.response.buttons && reply.response.buttons.length > 0) {
        type ReplyButton = NonNullable<IWhatsAppAutoReply['response']['buttons']>[number];
        const buttons = (reply.response.buttons || []).slice(0, 3).map((btn: ReplyButton) => {
          if (btn.type === 'QUICK_REPLY') {
            return {
              type: 'reply',
              reply: {
                id: `btn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                title: btn.text.substring(0, 20), // Max 20 chars
              },
            };
          } else if (btn.type === 'URL') {
            return {
              type: 'url',
              url: btn.url,
              text: btn.text.substring(0, 20),
            };
          } else if (btn.type === 'PHONE_NUMBER') {
            return {
              type: 'phone_number',
              phone_number: btn.phoneNumber,
              text: btn.text.substring(0, 20),
            };
          }
        });

        if (buttons.length > 0) {
          messagePayload.type = 'interactive';
          messagePayload.interactive = {
            type: 'button',
            body: { text: content },
            action: { buttons },
          };
          delete messagePayload.text;
        }
      }
    }

    // Send via Meta Graph API
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      }
    );

    const result = await response.json();

    if (response.ok && result.messages) {
      // Save message record
      await whatsappMessageRepository.create({
        whatsappAccountId: incomingMessage.accountId.toString(),
        contactId: incomingMessage.contactId,
        direction: 'outbound',
        messageType: 'text',
        content,
        status: 'sent',
        fbMessageId: result.messages[0].id,
        // sentAt removed as per DTO
        extra: {
          autoReplyId: reply._id.toString(),
          autoReplyName: reply.name,
        },
      });

      // Update usage tracking
      await WhatsAppAutoReply.findByIdAndUpdate(reply._id, {
        $inc: { usageCount: 1 },
        lastUsedAt: new Date(),
      });

      console.log(`Auto-reply sent: ${reply.name}`);
    } else {
      console.error('Failed to send auto-reply:', result);
    }
  } catch (error) {
    console.error('Error sending auto-reply:', error);
  }
}

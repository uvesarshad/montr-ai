import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { whatsappTemplateRepository } from '@/lib/db/repository/whatsapp-template.repository';
import {
  createComplianceWarning,
  getWhatsappIdentifier,
  hasDoNotContact,
  hasMarketingConsent,
  isConversationWindowOpen,
  isTemplateApproved,
  isMarketingTemplate,
  recordComplianceWarning,
  normalizePhone,
} from '@/lib/whatsapp/compliance';
import { z } from 'zod';
import { checkRateLimitGeneric } from '@/lib/rate-limiter';

const sendMessageSchema = z.object({
  accountId: z.string(),
  contactId: z.string(),
  type: z.enum(['text', 'template']),
  content: z.string().optional(),
  templateId: z.string().optional(),
  templateVariables: z.record(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const user = await userRepository.findById(userId);
    const organizationId = user!.id;
    // Throttle outbound sends (each = a billed Meta message) per user and per org.
    const [userRate, orgRate] = await Promise.all([
      checkRateLimitGeneric({ bucket: 'wa:send:user', identifier: userId, limit: 60, windowSeconds: 60 }),
      checkRateLimitGeneric({ bucket: 'wa:send:org', identifier: organizationId.toString(), limit: 600, windowSeconds: 60 }),
    ]);
    if (!userRate.allowed || !orgRate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Slow down sending.' }, { status: 429 });
    }

    const body = await request.json();
    const validatedData = sendMessageSchema.parse(body);

    // Verify account belongs to organization
    const account = await whatsappAccountRepository.findById(validatedData.accountId);
    if (!account) {
      return NextResponse.json(
        { error: 'WhatsApp account not found' },
        { status: 404 }
      );
    }

    // Verify contact belongs to organization
    const contact = await contactRepository.findById(validatedData.contactId);
    if (!contact) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      );
    }

    if (!getWhatsappIdentifier(contact)) {
      return NextResponse.json(
        { error: 'Contact has no WhatsApp identifier' },
        { status: 400 }
      );
    }

    const complianceWarnings = [];

    if (hasDoNotContact(contact)) {
      complianceWarnings.push(createComplianceWarning('dnc_contact', 'Contact is marked as do not contact', {
        contactId: validatedData.contactId,
        accountId: validatedData.accountId,
        type: validatedData.type,
      }));
    }

    // Validate message type requirements
    if (validatedData.type === 'text' && !validatedData.content) {
      return NextResponse.json(
        { error: 'Content is required for text messages' },
        { status: 400 }
      );
    }

    if (validatedData.type === 'template' && !validatedData.templateId) {
      return NextResponse.json(
        { error: 'Template ID is required for template messages' },
        { status: 400 }
      );
    }

    // Enforce 24-hour window for free-form messages
    if (validatedData.type === 'text') {
      const windowOpen = await isConversationWindowOpen(validatedData.contactId);
      if (!windowOpen) {
        complianceWarnings.push(createComplianceWarning('window_closed_text', '24-hour conversation window closed for free-form text', {
          contactId: validatedData.contactId,
          accountId: validatedData.accountId,
        }));
      }
    }

    // Determine if message should be scheduled or sent immediately
    const isScheduled = validatedData.scheduledAt && new Date(validatedData.scheduledAt) > new Date();
    const status = isScheduled ? 'scheduled' : 'sending';

    if (isScheduled && validatedData.type === 'text') {
      complianceWarnings.push(createComplianceWarning('scheduled_text', 'Scheduled free-form message may violate 24-hour window', {
        contactId: validatedData.contactId,
        accountId: validatedData.accountId,
        scheduledAt: validatedData.scheduledAt,
      }));
    }

    // Resolve template details if needed
    let template;
    if (validatedData.type === 'template') {
      template = await whatsappTemplateRepository.findById(validatedData.templateId!);
      if (!template) {
        complianceWarnings.push(createComplianceWarning('template_missing', 'Template not found (will likely fail)', {
          templateId: validatedData.templateId,
          accountId: validatedData.accountId,
        }));
      } else {
        if (template.whatsappAccountId.toString() !== account._id.toString()) {
          complianceWarnings.push(createComplianceWarning('template_wrong_account', 'Template does not belong to this account', {
            templateId: validatedData.templateId,
            accountId: validatedData.accountId,
          }));
        }

        if (!isTemplateApproved(template)) {
          complianceWarnings.push(createComplianceWarning('template_not_approved', 'Template is not approved by Meta', {
            templateId: validatedData.templateId,
            status: template.status,
          }));
        }

        if (isMarketingTemplate(template) && !hasMarketingConsent(contact)) {
          complianceWarnings.push(createComplianceWarning('marketing_consent_missing', 'Contact has not consented to marketing messages', {
            contactId: validatedData.contactId,
            templateId: validatedData.templateId,
          }));
        }
      }
    }

    // Create message record
    const message = await whatsappMessageRepository.create({
      whatsappAccountId: validatedData.accountId,
      contactId: validatedData.contactId,
      messageType: validatedData.type,
      content: validatedData.content || '',
      templateId: validatedData.templateId,
      templateName: template?.name,
      status,
      direction: 'outbound',
      scheduledFor: validatedData.scheduledAt ? new Date(validatedData.scheduledAt) : undefined,
      extra: { sentBy: userId },
    });

    for (const warning of complianceWarnings) {
      await recordComplianceWarning({
        entityType: 'whatsapp_message',
        entityId: message._id.toString(),
        warning,
        userId,
        userName: session.user?.name || session.user?.email || undefined,
        source: 'api',
        messageId: message._id.toString(),
      });
    }

    // If not scheduled, send immediately via WhatsApp API
    if (!isScheduled) {
      try {
        const identifier = getWhatsappIdentifier(contact);
        if (!identifier) {
          return NextResponse.json(
            { error: 'Contact does not have a WhatsApp identifier' },
            { status: 400 }
          );
        }

        const phoneNumber = normalizePhone(identifier);

        let response;
        if (validatedData.type === 'text') {
          // Send text message via Meta Graph API
          response = await fetch(
            `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phoneNumber,
                type: 'text',
                text: { body: validatedData.content },
              }),
            }
          );
        } else if (validatedData.type === 'template') {
          // Send template message via Meta Graph API
          const components = [];
          if (validatedData.templateVariables) {
            const parameters = Object.values(validatedData.templateVariables).map(value => ({
              type: 'text',
              text: value,
            }));
            components.push({
              type: 'body',
              parameters,
            });
          }

          response = await fetch(
            `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phoneNumber,
                type: 'template',
                template: {
                  name: template?.name,
                  language: { code: template?.language || 'en' },
                  components: components.length > 0 ? components : undefined,
                },
              }),
            }
          );
        }

        if (response && response.ok) {
          const data = await response.json();

          // Update message with WhatsApp message ID and status
          await whatsappMessageRepository.update(message._id.toString(), {
            fbMessageId: data.messages?.[0]?.id,
            status: 'sent',
            sentAt: new Date(),
            failedReason: undefined,
          });

          return NextResponse.json({
            message: 'Message sent successfully',
            data: {
              ...message.toObject(),
              fbMessageId: data.messages?.[0]?.id,
              status: 'sent',
              sentAt: new Date(),
            },
          });
        } else {
          const errorData = await response?.json();

          // Mark message as failed
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'failed',
            failedReason: errorData?.error?.message || 'Failed to send message',
          });

          return NextResponse.json(
            {
              error: 'Failed to send message',
              details: errorData?.error?.message,
            },
            { status: 500 }
          );
        }
      } catch (sendError) {
        // Mark message as failed
        await whatsappMessageRepository.update(message._id.toString(), {
          status: 'failed',
          failedReason: (sendError instanceof Error ? sendError.message : String(sendError)) || 'Failed to send message',
        });

        return NextResponse.json(
          {
            error: 'Failed to send message',
            details: (sendError instanceof Error ? sendError.message : String(sendError)),
          },
          { status: 500 }
        );
      }
    }

    // Return scheduled message
    return NextResponse.json({
      message: 'Message scheduled successfully',
      data: message,
    });
  } catch (error) {
    console.error('Error sending message:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to send message', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

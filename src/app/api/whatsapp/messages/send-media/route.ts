import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import {
  createComplianceWarning,
  getWhatsappIdentifier,
  hasDoNotContact,
  isConversationWindowOpen,
  recordComplianceWarning,
  normalizePhone,
} from '@/lib/whatsapp/compliance';
import { z } from 'zod';
import { checkRateLimitGeneric } from '@/lib/rate-limiter';

const sendMediaMessageSchema = z.object({
  accountId: z.string(),
  contactId: z.string(),
  type: z.enum(['image', 'video', 'audio', 'document']),
  mediaUrl: z.string().url().optional(),
  mediaId: z.string().optional(), // Pre-uploaded media ID from Meta
  caption: z.string().optional(),
  filename: z.string().optional(), // For documents
  scheduledAt: z.string().datetime().optional(),
}).refine(
  (data) => data.mediaUrl || data.mediaId,
  { message: 'Either mediaUrl or mediaId must be provided' }
);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const user = await userRepository.findById(userId);
    const organizationId = user!.id;
    // Throttle outbound media sends (each = a billed Meta message) per user and per org.
    const [userRate, orgRate] = await Promise.all([
      checkRateLimitGeneric({ bucket: 'wa:send:user', identifier: userId, limit: 60, windowSeconds: 60 }),
      checkRateLimitGeneric({ bucket: 'wa:send:org', identifier: organizationId.toString(), limit: 600, windowSeconds: 60 }),
    ]);
    if (!userRate.allowed || !orgRate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Slow down sending.' }, { status: 429 });
    }

    const body = await request.json();
    const validatedData = sendMediaMessageSchema.parse(body);

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

    const windowOpen = await isConversationWindowOpen(validatedData.contactId);
    if (!windowOpen) {
      complianceWarnings.push(createComplianceWarning('window_closed_media', '24-hour conversation window closed for media message', {
        contactId: validatedData.contactId,
        accountId: validatedData.accountId,
      }));
    }

    // Determine if message should be scheduled or sent immediately
    const isScheduled = validatedData.scheduledAt && new Date(validatedData.scheduledAt) > new Date();
    const status = isScheduled ? 'scheduled' : 'sending';

    if (isScheduled) {
      complianceWarnings.push(createComplianceWarning('scheduled_media', 'Scheduled media message may violate 24-hour window', {
        contactId: validatedData.contactId,
        accountId: validatedData.accountId,
        scheduledAt: validatedData.scheduledAt,
      }));
    }

    // Create message record
    const message = await whatsappMessageRepository.create({
      whatsappAccountId: validatedData.accountId,
      contactId: validatedData.contactId,
      messageType: validatedData.type,
      mediaUrl: validatedData.mediaUrl,
      mediaType: validatedData.type,
      content: validatedData.caption || '',
      status,
      direction: 'outbound',
      scheduledFor: validatedData.scheduledAt ? new Date(validatedData.scheduledAt) : undefined,
      extra: { sentBy: userId, mediaId: validatedData.mediaId },
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

        // Prepare media object based on type
        const mediaObject: { id?: string; link?: string; caption?: string; filename?: string } = {};

        if (validatedData.mediaId) {
          mediaObject.id = validatedData.mediaId;
        } else if (validatedData.mediaUrl) {
          mediaObject.link = validatedData.mediaUrl;
        }

        if (validatedData.caption && (validatedData.type === 'image' || validatedData.type === 'video')) {
          mediaObject.caption = validatedData.caption;
        }

        if (validatedData.filename && validatedData.type === 'document') {
          mediaObject.filename = validatedData.filename;
        }

        // Send media message via Meta Graph API
        const response = await fetch(
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
              type: validatedData.type,
              [validatedData.type]: mediaObject,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();

          // Update message with WhatsApp message ID and status
          await whatsappMessageRepository.update(message._id.toString(), {
            fbMessageId: data.messages?.[0]?.id, // Use fbMessageId
            status: 'sent',
            sentAt: new Date(),
            failedReason: undefined, // Clear failedReason
          });

          return NextResponse.json({
            message: 'Media message sent successfully',
            data: {
              ...message.toObject(),
              fbMessageId: data.messages?.[0]?.id, // Use fbMessageId
              status: 'sent',
              sentAt: new Date(),
            },
          });
        } else {
          const errorData = await response.json();

          // Mark message as failed
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'failed',
            failedReason: errorData?.error?.message || 'Failed to send media message', // Use failedReason
          });

          return NextResponse.json(
            {
              error: 'Failed to send media message',
              details: errorData?.error?.message,
            },
            { status: 500 }
          );
        }
      } catch (sendError) {
        // Mark message as failed
        await whatsappMessageRepository.update(message._id.toString(), {
          status: 'failed',
          failedReason: (sendError instanceof Error ? sendError.message : String(sendError)) || 'Failed to send media message', // Use failedReason
        });

        return NextResponse.json(
          {
            error: 'Failed to send media message',
            details: (sendError instanceof Error ? sendError.message : String(sendError)),
          },
          { status: 500 }
        );
      }
    }

    // Return scheduled message
    return NextResponse.json({
      message: 'Media message scheduled successfully',
      data: message,
    });
  } catch (error) {
    console.error('Error sending media message:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to send media message', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

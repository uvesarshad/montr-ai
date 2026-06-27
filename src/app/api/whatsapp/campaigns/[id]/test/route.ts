import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';
import { whatsappContactRepository } from '@/lib/db/repository/whatsapp-contact.repository';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { whatsappTemplateRepository } from '@/lib/db/repository/whatsapp-template.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';

/**
 * Test/Demo a campaign by sending to test contacts
 * POST /api/whatsapp/campaigns/[id]/test
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const { testContacts } = await request.json();

    if (!testContacts || !Array.isArray(testContacts) || testContacts.length === 0) {
      return NextResponse.json(
        { error: 'Test contacts are required' },
        { status: 400 }
      );
    }

    if (testContacts.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 test contacts allowed' },
        { status: 400 }
      );
    }

    // Get campaign
    const campaign = await whatsappCampaignRepository.findById(params.id);

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Verify campaign belongs to organization
    // Get WhatsApp account
    const account = await whatsappAccountRepository.findById(campaign.whatsappAccountId.toString());

    if (!account) {
      return NextResponse.json(
        { error: 'WhatsApp account not found' },
        { status: 404 }
      );
    }

    // Verify test contacts exist and belong to organization
    const contacts = await whatsappContactRepository.findByIds(testContacts);

    if (contacts.length !== testContacts.length) {
      return NextResponse.json(
        { error: 'Some test contacts not found' },
        { status: 400 }
      );
    }

    // Prepare messages
    const testMessages = [];

    for (const contact of contacts) {
      let messageContent = campaign.content || '';
      const templateVariables: Record<string, string> = { ...(campaign.templateVariables || {}) };

      // Replace variables with contact data
      if (campaign.messageType === 'template' && campaign.templateId) {
        const template = await whatsappTemplateRepository.findById(campaign.templateId.toString());

        if (template) {
          // Replace template variables with contact data
          Object.keys(templateVariables).forEach((key) => {
            const value = templateVariables[key];
            // Check if value references a contact field
            if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
              const fieldName = value.slice(2, -2);
              const contactValue = String((contact as unknown as Record<string, unknown>)[fieldName] || value);
              templateVariables[key] = contactValue;
            }
          });
        }
      } else {
        // Replace {{firstName}}, {{lastName}}, etc. in text content
        messageContent = messageContent.replace(/\{\{(\w+)\}\}/g, (match, fieldName) => {
          return String((contact as unknown as Record<string, unknown>)[fieldName] ?? match);
        });
      }

      // Create test message record
      const message = await whatsappMessageRepository.create({
        whatsappAccountId: campaign.whatsappAccountId.toString(),
        campaignId: campaign._id?.toString(),
        contactId: contact._id?.toString(),
        phoneNumber: contact.phone || '', // Use phone from CrmContact model
        messageType: campaign.messageType as 'text' | 'template' | 'image' | 'video' | 'audio' | 'document' | 'note',
        content: messageContent,
        templateId: campaign.templateId?.toString(),
        templateVariables: campaign.messageType === 'template' ? templateVariables : undefined,
        mediaUrl: campaign.mediaUrl,
        mediaType: campaign.mediaType,
        direction: 'outbound',
        status: 'sending',
        metadata: { testMode: true },
      });

      testMessages.push({
        messageId: message._id,
        contact: {
          id: contact._id,
          name: `${contact.firstName} ${contact.lastName}`.trim(),
          phoneNumber: contact.phone, // Use phone from CrmContact model
        },
      });

      // Send message via Meta Graph API
      try {
        let apiResponse;

        if (campaign.messageType === 'template' && campaign.templateId) {
          const template = await whatsappTemplateRepository.findById(campaign.templateId.toString());

          apiResponse = await fetch(
            `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: contact.phone, // Use phone
                type: 'template',
                template: {
                  name: template?.name,
                  language: { code: template?.language || 'en' },
                  components: template?.components || [],
                },
              }),
            }
          );
        } else if (campaign.messageType === 'media' && campaign.mediaUrl) {
          const mediaTypes: Record<string, string> = {
            image: 'image',
            video: 'video',
            audio: 'audio',
            document: 'document',
          };

          apiResponse = await fetch(
            `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: contact.phone, // Use phone
                type: mediaTypes[campaign.mediaType || 'image'],
                [mediaTypes[campaign.mediaType || 'image']]: {
                  link: campaign.mediaUrl,
                  caption: messageContent || undefined,
                },
              }),
            }
          );
        } else {
          // Text message
          apiResponse = await fetch(
            `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: contact.phone, // Use phone
                type: 'text',
                text: { body: messageContent },
              }),
            }
          );
        }

        const result = await apiResponse.json();

        if (apiResponse.ok && result.messages && result.messages[0]) {
          // Update message status to sent
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'sent',
            whatsappMessageId: result.messages[0].id,
            sentAt: new Date(),
          });
        } else {
          // Mark as failed
          await whatsappMessageRepository.update(message._id.toString(), {
            status: 'failed',
            errorMessage: result.error?.message || 'Failed to send message',
          });
        }
      } catch (error) {
        // Mark as failed
        await whatsappMessageRepository.update(message._id.toString(), {
          status: 'failed',
          errorMessage: (error instanceof Error ? error.message : String(error)) || 'Failed to send message',
        });
      }
    }

    return NextResponse.json({
      message: 'Test messages sent successfully',
      data: {
        campaignId: campaign._id,
        testContacts: testMessages.length,
        messages: testMessages,
      },
    });
  } catch (error) {
    console.error('Error testing campaign:', error);
    return NextResponse.json(
      { error: 'Failed to test campaign', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

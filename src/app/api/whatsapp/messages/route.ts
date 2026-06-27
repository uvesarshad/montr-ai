import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import CrmActivity from '@/lib/db/models/crm/activity.model';
import CrmContact, { IContactChannel } from '@/lib/db/models/crm/contact.model';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { whatsappService } from '@/lib/services/whatsapp.service';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import {
    createComplianceWarning,
    hasDoNotContact,
    isConversationWindowOpen,
    recordComplianceWarning,
    normalizePhone,
} from '@/lib/whatsapp/compliance';

// GET - Fetch messages for a contact
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = req.nextUrl.searchParams;
        const contactId = searchParams.get('contactId');

        if (!contactId) {
            return NextResponse.json(
                { error: 'Contact ID is required' },
                { status: 400 }
            );
        }

        // Verify contact belongs to organization
        const contact = await CrmContact.findOne({
            _id: contactId
        });

        if (!contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        // Fetch messages
        const messages = await CrmActivity.find({
            contactId: contactId,
            type: 'message',
            'messageMetadata.channel': 'whatsapp',
        })
            .sort({ createdAt: 1 })
            .lean();

        return NextResponse.json({ messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// POST - Send a message
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { contactId, message, accountId } = await req.json();

        if (!contactId || !message || !accountId) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Verify contact belongs to organization
        const contact = await CrmContact.findOne({
            _id: contactId
        });

        if (!contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        // Get WhatsApp phone number from contact
        const whatsappChannel = contact.channels?.find((ch: IContactChannel) => ch.type === 'whatsapp');
        if (!whatsappChannel) {
            return NextResponse.json(
                { error: 'Contact does not have WhatsApp channel' },
                { status: 400 }
            );
        }

        const complianceWarnings = [];

        if (hasDoNotContact(contact)) {
            complianceWarnings.push(createComplianceWarning('dnc_contact', 'Contact is marked as do not contact', {
                contactId,
                accountId,
            }));
        }

        const windowOpen = await isConversationWindowOpen(contactId);
        if (!windowOpen) {
            complianceWarnings.push(createComplianceWarning('window_closed_text', '24-hour conversation window closed for free-form text', {
                contactId,
                accountId,
            }));
        }

        // Get account
        const account = await whatsappAccountRepository.findById(accountId);
        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Verify account belongs to organization
        // Send message via WhatsApp
        const result = await whatsappService.sendMessage(account, {
            messaging_product: 'whatsapp',
            to: normalizePhone(whatsappChannel.identifier),
            type: 'text',
            text: { body: message },
        });

        const messageRecord = await whatsappMessageRepository.create({
            whatsappAccountId: account._id.toString(),
            contactId: contact._id.toString(),
            direction: 'outbound',
            messageType: 'text',
            content: message,
            status: 'sent',
            fbMessageId: result?.messages?.[0]?.id,
            sentAt: new Date(),
            extra: { sentBy: session.user.id },
        });

        for (const warning of complianceWarnings) {
            await recordComplianceWarning({
                entityType: 'whatsapp_message',
                entityId: messageRecord._id.toString(),
                warning,
                userId: session.user.id,
                userName: session.user?.name || session.user?.email || undefined,
                source: 'api',
                messageId: messageRecord._id.toString(),
            });
        }

        // Create activity for sent message
        const activity = await CrmActivity.create({
            type: 'message',
            targetType: 'contact',
            targetId: contact._id,
            contactId: contact._id,
            subject: 'Outgoing WhatsApp Message',
            bodyPlain: message,
            messageMetadata: {
                channel: 'whatsapp',
                externalId: result.messages[0].id,
                direction: 'outbound',
                status: 'sent',
            },
            createdById: session.user.id,
        });

        return NextResponse.json({ activity, result }, { status: 201 });
    } catch (error) {
        console.error('Error sending message:', error);
        return NextResponse.json(
            { error: 'Failed to send message' },
            { status: 500 }
        );
    }
}

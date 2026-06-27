import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import CrmContact from '@/lib/db/models/crm/contact.model';
import CrmActivity from '@/lib/db/models/crm/activity.model';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { whatsappConversationRepository } from '@/lib/db/repository/whatsapp-conversation.repository';
import {
    buildWhatsAppConversationDefaults,
    buildWhatsAppConversationSummary,
} from '@/lib/whatsapp/conversation-summary';

// GET - List all WhatsApp conversations
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accountId = req.nextUrl.searchParams.get('accountId');

        if (accountId) {
            const account = await whatsappAccountRepository.findById(accountId);

            if (!account) {
                return NextResponse.json({ error: 'Account not found' }, { status: 404 });
            }
        }

        // Find all contacts with WhatsApp channel
        const contacts = await CrmContact.find({
            'channels.type': 'whatsapp',
        }).lean();

        // For each contact, get the last message
        const conversations = await Promise.all(
            contacts.map(async (contact) => {
                const lastMessage = await CrmActivity.findOne({
                    contactId: contact._id,
                    type: 'message',
                    'messageMetadata.channel': 'whatsapp',
                })
                    .sort({ createdAt: -1 })
                    .lean();

                // Count unread messages (inbound messages without 'read' status)
                const unreadCount = await CrmActivity.countDocuments({
                    contactId: contact._id,
                    type: 'message',
                    'messageMetadata.channel': 'whatsapp',
                    'messageMetadata.direction': 'inbound',
                    'messageMetadata.status': { $ne: 'read' },
                });

                const conversation = accountId
                    ? await whatsappConversationRepository.findByContactId(contact._id.toString(), accountId)
                    : null;

                return buildWhatsAppConversationSummary({
                    contact: {
                        _id: contact._id.toString(),
                        firstName: contact.firstName,
                        lastName: (contact as { lastName?: string }).lastName ?? '',
                        channels: contact.channels as Array<{ type?: string; identifier?: string }>,
                    },
                    lastMessage: lastMessage as { _id?: string; bodyPlain?: string; createdAt?: Date | string; messageMetadata?: { direction?: string } } | null,
                    unreadCount,
                    conversation: conversation
                        ? {
                            _id: conversation._id.toString(),
                            internalNotes: conversation.internalNotes,
                        }
                        : null,
                    accountId,
                });
            })
        );

        // Filter out contacts with no messages and sort by last message time
        const activeConversations = conversations
            .filter(c => c.lastMessage)
            .sort((a, b) => {
                const timeA = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
                const timeB = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
                return timeB - timeA;
            });

        return NextResponse.json({ conversations: activeConversations });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// PATCH - Upsert WhatsApp conversation metadata for a contact/account pair
export async function PATCH(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { contactId, accountId, internalNotes } = await req.json();

        if (!contactId || !accountId || typeof internalNotes !== 'string') {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const [contact, account] = await Promise.all([
            CrmContact.findOne({
                _id: contactId
            }),
            whatsappAccountRepository.findById(accountId),
        ]);

        if (!contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }
        type MsgShape = { _id?: string; bodyPlain?: string; createdAt?: Date | string; messageMetadata?: { direction?: string } };
        const [rawLastMessage, totalMessages] = await Promise.all([
            CrmActivity.findOne({
                contactId,
                type: 'message',
                'messageMetadata.channel': 'whatsapp',
            })
                .sort({ createdAt: -1 })
                .lean(),
            CrmActivity.countDocuments({
                contactId,
                type: 'message',
                'messageMetadata.channel': 'whatsapp',
            }),
        ]);
        const lastMessage = rawLastMessage as MsgShape | null;

        const conversation = await whatsappConversationRepository.upsertByContactAndAccount(
            {
                accountId,
                contactId,
            },
            {
                internalNotes,
                totalMessages,
                lastMessageAt: lastMessage?.createdAt ? new Date(lastMessage.createdAt as Date) : undefined,
                lastMessageType: lastMessage
                    ? lastMessage.messageMetadata?.direction === 'outbound'
                        ? 'outgoing'
                        : 'incoming'
                    : undefined,
            },
            buildWhatsAppConversationDefaults({
                accountId,
                contactId,
                totalMessages,
                lastMessage,
            }) as unknown as Parameters<typeof whatsappConversationRepository.upsertByContactAndAccount>[2]
        );

        return NextResponse.json({
            conversation: {
                id: conversation?._id?.toString(),
                internalNotes: conversation?.internalNotes ?? '',
            },
        });
    } catch (error) {
        console.error('Error updating WhatsApp conversation:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

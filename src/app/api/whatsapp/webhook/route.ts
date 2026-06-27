import { NextRequest, NextResponse } from 'next/server';
import { workflowTriggerService } from '@/lib/services/workflow-trigger.service';
import CrmContact from '@/lib/db/models/crm/contact.model';
import CrmActivity from '@/lib/db/models/crm/activity.model';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';
import { connectDB } from '@/lib/mongodb';
import { parseWebhookBody, verifyWhatsAppSignature } from '@/lib/whatsapp/webhook-verify';

// Minimal WhatsApp webhook payload shapes — we only access a handful of fields.
interface WhatsAppMessage {
    id: string;
    from: string;
    timestamp?: string;
    type: string;
    text?: { body?: string };
    image?: { id?: string; caption?: string };
    video?: { id?: string; caption?: string };
    audio?: { id?: string };
    document?: { id?: string; caption?: string; filename?: string };
}

interface WhatsAppValue {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    contacts?: Array<{ profile?: { name?: string } }>;
    messages?: WhatsAppMessage[];
    statuses?: WhatsAppStatus[];
}

interface WhatsAppStatus {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp?: string;
    errors?: Array<{ code?: number; title?: string; message?: string }>;
}

/**
 * WhatsApp Webhook Handler
 * Processes incoming messages, message status updates, and triggers automation workflows
 */
export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const rawBody = await req.text();
        const signature = req.headers.get('x-hub-signature-256');

        if (!verifyWhatsAppSignature(rawBody, signature)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
        }

        const rawBody2 = parseWebhookBody(rawBody);
        interface WhatsAppWebhookBody {
            object?: string;
            entry?: Array<{
                changes?: Array<{
                    field?: string;
                    value?: WhatsAppValue;
                }>;
            }>;
        }
        const body = rawBody2 as WhatsAppWebhookBody;

        // Verify webhook (Meta requires verification)
        if (body.object === 'whatsapp_business_account') {
            // Process each entry
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    if (change.field !== 'messages') continue;

                    const value = change.value as WhatsAppValue;

                    // Process message status updates
                    if (value.statuses && value.statuses.length > 0) {
                        await processStatusUpdates(value.statuses);
                    }

                    // Process incoming messages
                    if (value.messages && value.messages.length > 0) {
                        for (const message of value.messages) {
                            await processIncomingMessage(message, value);
                            await processIncomingMessageTracking(message, value);
                        }
                    }
                }
            }

            return NextResponse.json({ status: 'ok' });
        }

        return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
    } catch (error) {
        console.error('Webhook error:', error);
        // Return 200 to prevent Meta from retrying
        return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
}

/**
 * Webhook verification (GET request from Meta)
 */
export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'your_verify_token';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Process incoming WhatsApp message (CRM integration)
 */
async function processIncomingMessage(message: WhatsAppMessage, value: WhatsAppValue): Promise<void> {
    try {
        const phoneNumber = message.from;
        const messageText = message.text?.body || '';
        const messageType = message.type;

        // Find contact by phone number
        const contact = await CrmContact.findOne({
            'channels.type': 'whatsapp',
            'channels.identifier': phoneNumber,
        });

        if (!contact) {
            console.log('Contact not found for phone:', phoneNumber);
            return;
        }

        // Create activity for incoming message
        await CrmActivity.create({
            type: 'message',
            targetType: 'contact',
            targetId: contact._id,
            contactId: contact._id,
            subject: 'Incoming WhatsApp Message',
            bodyPlain: messageText,
            messageMetadata: {
                channel: 'whatsapp',
                externalId: message.id,
                direction: 'inbound',
                status: 'received',
                messageType,
            },
        });

        // Trigger automation workflows
        await workflowTriggerService.processIncomingMessage({
            contactId: contact._id.toString(),
            message: messageText,
            userId: contact.ownerId?.toString() || contact.createdById.toString(),
            accountId: value.metadata?.phone_number_id || '',
        });
    } catch (error) {
        console.error('Error processing incoming message:', error);
    }
}

/**
 * Process incoming WhatsApp message (Message tracking)
 */
async function processIncomingMessageTracking(message: WhatsAppMessage, value: WhatsAppValue): Promise<void> {
    try {
        const phoneNumberId = value.metadata?.phone_number_id;
        const whatsappMessageId = message.id;
        const fromPhone = message.from;
        const timestamp = message.timestamp ? new Date(parseInt(message.timestamp) * 1000) : new Date();

        // Check if message already exists
        const existingMessages = await whatsappMessageRepository.find({
            fbMessageId: whatsappMessageId,
        });

        if (existingMessages.length > 0) {
            console.log(`Message already tracked: ${whatsappMessageId}`);
            return;
        }

        // Find the WhatsApp account by phone number ID
        const accounts = await whatsappAccountRepository.find({
            phoneNumberId,
        });

        if (accounts.length === 0) {
            console.log(`Account not found for phone number ID: ${phoneNumberId}`);
            return;
        }

        const account = accounts[0];

        // Find contact by phone number (assuming contacts have phone field)
        const contacts = await CrmContact.find({
            'channels.type': 'whatsapp',
            'channels.identifier': fromPhone,
        });

        let contactId = null;
        if (contacts && contacts.length > 0) {
            contactId = contacts[0]._id;
        }

        // Determine message type and content
        let type = 'text';
        let content = '';
        let mediaId = '';

        if (message.text) {
            type = 'text';
            content = message.text.body ?? '';
        } else if (message.image) {
            type = 'image';
            mediaId = message.image.id ?? '';
            content = message.image.caption || '';
        } else if (message.video) {
            type = 'video';
            mediaId = message.video.id ?? '';
            content = message.video.caption || '';
        } else if (message.audio) {
            type = 'audio';
            mediaId = message.audio.id ?? '';
        } else if (message.document) {
            type = 'document';
            mediaId = message.document.id ?? '';
            content = message.document.filename || '';
        }

        // Create incoming message record
        await whatsappMessageRepository.create({
            whatsappAccountId: account._id.toString(),
            contactId: contactId ? contactId.toString() : undefined,
            fbMessageId: whatsappMessageId,
            messageType: type as 'text' | 'image' | 'video' | 'audio' | 'document',
            content,
            mediaType: type !== 'text' ? (type as 'image' | 'video' | 'audio' | 'document') : undefined,
            status: 'delivered', // Incoming messages are already delivered
            direction: 'inbound',
            sentAt: timestamp,
            deliveredAt: timestamp,
            extra: { mediaId },
        });

        console.log(`Tracked incoming message from ${fromPhone}`);
    } catch (error) {
        console.error('Error tracking incoming message:', error);
    }
}

/**
 * Process message status updates from WhatsApp
 */
async function processStatusUpdates(statuses: WhatsAppStatus[]): Promise<void> {
    for (const status of statuses) {
        try {
            const whatsappMessageId = status.id;
            const newStatus = status.status; // 'sent', 'delivered', 'read', 'failed'
            const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000) : new Date();

            // Find message by WhatsApp message ID
            const messages = await whatsappMessageRepository.find({
                fbMessageId: whatsappMessageId,
            });

            if (messages.length === 0) {
                console.log(`Message not found for WhatsApp ID: ${whatsappMessageId}`);
                continue;
            }

            const message = messages[0];

            // Prepare update data
            const updateData: Record<string, unknown> = {
                status: newStatus,
            };

            // Set appropriate timestamp based on status
            switch (newStatus) {
                case 'sent':
                    if (!message.sentAt) {
                        updateData.sentAt = timestamp;
                    }
                    break;
                case 'delivered':
                    if (!message.deliveredAt) {
                        updateData.deliveredAt = timestamp;
                    }
                    break;
                case 'read':
                    if (!message.readAt) {
                        updateData.readAt = timestamp;
                    }
                    break;
                case 'failed':
                    updateData.errorMessage = status.errors?.[0]?.message || 'Message delivery failed';
                    break;
            }

            // Update message
            await whatsappMessageRepository.update(
                message._id.toString(),
                updateData
            );

            // If campaign message, check if campaign is complete
            if (message.campaignId) {
                await checkCampaignCompletion(message.campaignId.toString());
            }

            console.log(`Updated message ${message._id} status to ${newStatus}`);
        } catch (error) {
            console.error('Error processing status update:', error);
        }
    }
}

/**
 * Check if a campaign is complete
 */
async function checkCampaignCompletion(campaignId: string): Promise<void> {
    try {
        const campaign = await whatsappCampaignRepository.findById(campaignId);

        if (!campaign || campaign.status !== 'running') {
            return;
        }

        // Get campaign stats
        const stats = await whatsappMessageRepository.getCampaignStats(campaignId);

        // Check if all messages are in final state (sent/delivered/read/failed)
        const pendingMessages = stats.total - stats.sent - stats.failed;

        if (pendingMessages === 0) {
            // Campaign is complete
            await whatsappCampaignRepository.update(campaignId, {
                status: 'completed',
                completedAt: new Date(),
                stats: {
                    sent: stats.sent,
                    delivered: stats.delivered,
                    read: stats.read,
                    failed: stats.failed,
                }
            });

            console.log(`Campaign ${campaignId} marked as completed`);
        }
    } catch (error) {
        console.error('Error checking campaign completion:', error);
    }
}

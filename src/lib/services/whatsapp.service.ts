import { IWhatsAppAccount } from '@/lib/db/models/whatsapp-account.model';
// import { crmContactRepository } from '@/lib/db/repository/crm/contact.repository'; // Note: You might need to check the actual path
import CrmActivity from '@/lib/db/models/crm/activity.model';
import CrmContact from '@/lib/db/models/crm/contact.model';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';

// WhatsApp webhook payload shapes
interface WhatsAppInboundMessage {
    id: string;
    from: string;
    type: string;
    text?: { body: string };
    image?: { id: string; caption?: string };
    video?: { id: string; caption?: string };
    audio?: { id: string };
    document?: { id: string; caption?: string };
    [key: string]: unknown;
}

interface WhatsAppWebhookValue {
    messages?: WhatsAppInboundMessage[];
    contacts?: Array<{ profile?: { name?: string } }>;
    statuses?: Array<{ id: string; status: string }>;
}

interface WhatsAppWebhookChange {
    value: WhatsAppWebhookValue;
}

interface WhatsAppWebhookEntry {
    changes: WhatsAppWebhookChange[];
}

interface WhatsAppWebhookPayload {
    entry: WhatsAppWebhookEntry[];
}

// ---------------------------------------------------------------------------
// Template component types (2.11) — full Graph API `components` coverage.
// Mirrors Meta's template-message schema so processors can build header
// (text/media), body (text/currency/date_time params) and button components.
// ---------------------------------------------------------------------------
export interface WhatsAppTemplateParameter {
    type: 'text' | 'currency' | 'date_time' | 'image' | 'video' | 'document' | 'payload';
    text?: string;
    payload?: string;
    currency?: { fallback_value: string; code: string; amount_1000: number };
    date_time?: { fallback_value: string };
    image?: { link: string };
    video?: { link: string };
    document?: { link: string; filename?: string };
}

export interface WhatsAppTemplateComponent {
    type: 'header' | 'body' | 'button';
    /** Required for button components — 'quick_reply' or 'url'. */
    sub_type?: 'quick_reply' | 'url' | 'catalog' | 'copy_code';
    /** Required for button components — the 0-based button index. */
    index?: number | string;
    parameters?: WhatsAppTemplateParameter[];
}

// Interactive message types (2.11) — reply buttons + list menus. These are
// SESSION messages (gated behind the 24h window by the processor).
export interface WhatsAppInteractiveButton {
    type: 'reply';
    reply: { id: string; title: string };
}

export interface WhatsAppInteractiveListRow {
    id: string;
    title: string;
    description?: string;
}

export interface WhatsAppInteractiveListSection {
    title?: string;
    rows: WhatsAppInteractiveListRow[];
}

export interface WhatsAppInteractive {
    type: 'button' | 'list';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
        // button mode
        buttons?: WhatsAppInteractiveButton[];
        // list mode
        button?: string;
        sections?: WhatsAppInteractiveListSection[];
    };
}

interface WhatsAppMessage {
    messaging_product: 'whatsapp';
    to: string;
    type?: 'text' | 'template' | 'image' | 'document' | 'video' | 'interactive';
    text?: { body: string };
    template?: {
        name: string;
        language: { code: string };
        components?: WhatsAppTemplateComponent[] | Record<string, unknown>[];
    };
    interactive?: WhatsAppInteractive;
}

export const whatsappService = {
    /**
     * Send a message via Meta Graph API
     */
    async sendMessage(account: IWhatsAppAccount, message: WhatsAppMessage) {
        const url = `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${account.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('WhatsApp API Error:', data);
                throw new Error(data.error?.message || 'Failed to send message');
            }

            return data;
        } catch (error) {
            console.error('Error sending WhatsApp message:', error);
            throw error;
        }
    },

    /**
     * Send a template message via WhatsApp
     */
    async sendTemplateMessage(
        account: IWhatsAppAccount,
        to: string,
        templateName: string,
        languageCode: string,
        components?: Record<string, unknown>[]
    ) {
        try {
            const url = `https://graph.facebook.com/v18.0/${account.phoneNumberId}/messages`;

            const payload = {
                messaging_product: 'whatsapp',
                to,
                type: 'template',
                template: {
                    name: templateName,
                    language: {
                        code: languageCode,
                    },
                    components: components || [],
                },
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${account.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error sending WhatsApp template message:', error);
            throw error;
        }
    },

    /**
     * Send a media message (image, document, video, audio)
     */
    async sendMediaMessage(
        account: IWhatsAppAccount,
        to: string,
        mediaId: string,
        mediaType: 'image' | 'document' | 'video' | 'audio',
        caption?: string
    ) {
        try {
            const url = `https://graph.facebook.com/v18.0/${account.phoneNumberId}/messages`;

            const mediaPayload: Record<string, unknown> = { id: mediaId };

            // Add caption for images, videos, and documents
            if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
                mediaPayload.caption = caption;
            }

            const payload: Record<string, unknown> = {
                messaging_product: 'whatsapp',
                to,
                type: mediaType,
                [mediaType]: mediaPayload,
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${account.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error sending WhatsApp media message:', error);
            throw error;
        }
    },

    /**
     * Send an interactive message (reply buttons or list menu) via Graph API.
     * (2.11) Session message — callers MUST have already asserted the 24-hour
     * conversation window is open (compliance-gate) before invoking this.
     */
    async sendInteractiveMessage(
        account: IWhatsAppAccount,
        to: string,
        interactive: WhatsAppInteractive,
    ) {
        return this.sendMessage(account, {
            messaging_product: 'whatsapp',
            to,
            type: 'interactive',
            interactive,
        });
    },

    /**
     * Process incoming webhook payload
     */
    async processIncomingMessage(account: IWhatsAppAccount, payload: WhatsAppWebhookPayload) {
        try {
            const entry = payload.entry[0];
            const change = entry.changes[0];
            const value = change.value;

            if (value.messages) {
                const message = value.messages[0];
                const contactMeta = value.contacts?.[0]; // Name information

                const fromPhone = message.from; // Phone number
                const messageId = message.id;
                const messageType = message.type;
                let body = '';
                const mediaUrls: string[] = [];
                let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;
                let mediaIds: string[] = [];

                if (messageType === 'text') {
                    body = message.text?.body ?? '';
                } else if (messageType === 'image' || messageType === 'video' || messageType === 'audio' || messageType === 'document') {
                    // Handle media messages
                    const mediaData = message[messageType] as { id: string; caption?: string } | undefined;
                    mediaType = messageType as 'image' | 'video' | 'audio' | 'document';
                    if (mediaData) {
                        mediaIds = [mediaData.id];
                        // Get caption if available
                        body = mediaData.caption || `[${messageType.toUpperCase()}]`;
                    }

                    // Download media URL (we'll store the Meta media ID and can download later)
                    // For now, we'll just store the media ID
                } else {
                    body = `[${messageType.toUpperCase()}]`;
                }

                // 1. Find or Create Contact
                // We assume phoneNumber matching. 
                // Need to query CrmContact by channel 'whatsapp' and identifier 'fromPhone'
                // This requires a repository method or direct query.

                // Simulating find logic (Replace with actual Repo usage)
                let contact = await CrmContact.findOne({
                    'channels.identifier': fromPhone,
                    'channels.type': 'whatsapp'
                });

                if (!contact) {
                    // Create new contact
                    const name = contactMeta?.profile?.name || fromPhone;
                    contact = await CrmContact.create({
                        firstName: name,
                        channels: [{
                            type: 'whatsapp',
                            identifier: fromPhone,
                            isPrimary: true,
                            verified: true
                        }],
                        createdById: account.createdById, // Attribution
                    });
                }

                // 2. Create Activity (Message Log)
                await CrmActivity.create({
                    type: 'message',
                    targetType: 'contact',
                    targetId: contact._id,
                    contactId: contact._id,
                    subject: 'Incoming WhatsApp Message',
                    bodyPlain: body,
                    messageMetadata: {
                        channel: 'whatsapp',
                        externalId: messageId,
                        direction: 'inbound',
                        status: 'delivered',
                        ...(mediaIds.length > 0 && { mediaIds, mediaType, mediaUrls })
                    },
                    createdById: account.createdById, // System/Account user
                    createdAt: new Date(),
                });

                // 3. Track message in WhatsApp messages collection
                await whatsappMessageRepository.create({
                    whatsappAccountId: account._id.toString(),
                    contactId: contact._id.toString(),
                    direction: 'inbound',
                    messageType: messageType as 'text' | 'image' | 'video' | 'audio' | 'document',
                    content: body || '',
                    mediaType,
                    status: 'delivered',
                    sentAt: new Date(),
                    extra: {
                        whatsappMessageId: messageId,
                        mediaIds,
                        mediaUrls,
                    },
                });

                console.log(`Processed message from ${fromPhone}`);
            }
        } catch (error) {
            console.error('Error processing incoming message:', error);
        }
    },

    /**
     * Process status update webhook payload
     */
    async processStatusUpdate(account: IWhatsAppAccount, status: { id: string; status: string }) {
        try {
            const messageId = status.id; // WhatsApp message ID
            const statusType = status.status as 'sent' | 'delivered' | 'read' | 'failed'; // sent, delivered, read, failed

            // Find the activity by external ID
            const activity = await CrmActivity.findOne({
                'messageMetadata.externalId': messageId,
            });

            if (activity) {
                // Update the status
                if (activity.messageMetadata) {
                    activity.messageMetadata.status = statusType;
                    await activity.save();
                    console.log(`Updated message ${messageId} status to ${statusType}`);
                }
            } else {
                console.warn(`Activity not found for message ID: ${messageId}`);
            }
        } catch (error) {
            console.error('Error processing status update:', error);
        }
    }
};

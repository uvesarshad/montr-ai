import {
    BaseChannelAdapter,
    SendMessageParams,
    SendMessageResult,
    ReceiveMessageParams,
    ReceiveMessageResult,
    ValidateCredentialsResult,
} from './channel-adapter.interface';
import { IInboxChannel } from '@/lib/db/models/inbox-channel.model';
import { IInboxMessage } from '@/lib/db/models/inbox-message.model';

/**
 * WhatsApp Channel Adapter
 * Uses Meta Cloud API (WhatsApp Business Platform)
 */
export class WhatsAppAdapter extends BaseChannelAdapter {
    getChannelType(): string {
        return 'whatsapp';
    }

    getDisplayName(channel: IInboxChannel): string {
        return channel.config.phoneNumber || channel.name;
    }

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        const { channel, conversation } = params;

        try {
            const phoneNumberId = channel.config.phoneNumberId;
            const accessToken = channel.config.accessToken;
            const recipientPhone = conversation.metadata?.phoneNumber;

            if (!phoneNumberId || !accessToken || !recipientPhone) {
                throw new Error('Missing required WhatsApp configuration');
            }

            const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

            const messagePayload: Record<string, unknown> = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: recipientPhone,
            };

            // Handle media messages
            if (params.mediaUrl && params.mediaType) {
                messagePayload[params.mediaType] = {
                    link: params.mediaUrl,
                };
                if (params.content) {
                    (messagePayload[params.mediaType] as Record<string, unknown>).caption = params.content;
                }
            } else {
                // Text message
                messagePayload.type = 'text';
                messagePayload.text = {
                    body: params.content,
                };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(messagePayload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to send WhatsApp message');
            }

            return {
                externalMessageId: data.messages[0].id,
                status: 'sent',
            };
        } catch (error) {
            return {
                externalMessageId: '',
                status: 'failed',
                error: (error as Error).message,
            };
        }
    }

    async receiveMessage(params: ReceiveMessageParams): Promise<ReceiveMessageResult> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { channel, payload } = params;

        // Parse Meta webhook payload
        type WaMediaItem = { id?: string; caption?: string; filename?: string };
        type WaMessage = {
            id?: string;
            from?: string;
            type?: string;
            timestamp?: string;
            text?: { body?: string };
            image?: WaMediaItem;
            video?: WaMediaItem;
            audio?: WaMediaItem;
            document?: WaMediaItem;
        };
        type WaContact = {
            wa_id?: string;
            profile?: { name?: string };
        };
        type WaPayload = {
            entry?: Array<{
                changes?: Array<{
                    value?: {
                        messages?: WaMessage[];
                        contacts?: WaContact[];
                    };
                }>;
            }>;
        };
        const waPayload = payload as WaPayload;
        const entry = waPayload.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];
        const contact = value?.contacts?.[0];

        if (!message || !contact) {
            throw new Error('Invalid WhatsApp webhook payload');
        }

        const phoneNumber = contact.wa_id || '';
        const senderName = contact.profile?.name || phoneNumber;

        // Determine message type and content
        let messageType: string = 'text';
        let content = '';
        let mediaUrl: string | undefined;
        let mediaType: string | undefined;
        let fileName: string | undefined;

        if (message.type === 'text') {
            content = message.text?.body || '';
        } else if (message.type === 'image') {
            messageType = 'image';
            mediaType = 'image';
            mediaUrl = message.image?.id; // Will need to fetch actual URL from Meta API
            content = message.image?.caption || '';
        } else if (message.type === 'video') {
            messageType = 'video';
            mediaType = 'video';
            mediaUrl = message.video?.id;
            content = message.video?.caption || '';
        } else if (message.type === 'audio') {
            messageType = 'audio';
            mediaType = 'audio';
            mediaUrl = message.audio?.id;
        } else if (message.type === 'document') {
            messageType = 'document';
            mediaType = 'document';
            mediaUrl = message.document?.id;
            fileName = message.document?.filename;
            content = message.document?.caption || '';
        }

        const externalId = this.createExternalId('whatsapp', phoneNumber);

        return {
            message: {
                direction: 'inbound',
                messageType: messageType as IInboxMessage['messageType'],
                content,
                mediaUrl,
                mediaType: mediaType as IInboxMessage['mediaType'],
                fileName,
                externalMessageId: message.id as string | undefined,
                status: 'sent',
                metadata: {
                    timestamp: message.timestamp,
                },
            },
            conversation: {
                externalId,
                metadata: {
                    phoneNumber,
                    senderName,
                },
            },
            shouldCreateConversation: true,
        };
    }

    async validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult> {
        try {
            const { phoneNumberId, accessToken } = channel.config;

            if (!phoneNumberId || !accessToken) {
                return {
                    isValid: false,
                    error: 'Missing phone number ID or access token',
                };
            }

            // Test API call to verify credentials
            const url = `https://graph.facebook.com/v18.0/${phoneNumberId}`;
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.ok) {
                const data = await response.json();
                return {
                    isValid: false,
                    error: data.error?.message || 'Invalid credentials',
                };
            }

            const data = await response.json();

            return {
                isValid: true,
                details: {
                    phoneNumber: data.display_phone_number,
                    verifiedName: data.verified_name,
                    qualityRating: data.quality_rating,
                },
            };
        } catch (error) {
            return {
                isValid: false,
                error: (error as Error).message,
            };
        }
    }
}

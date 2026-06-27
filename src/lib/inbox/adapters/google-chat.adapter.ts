import {
    BaseChannelAdapter,
    SendMessageParams,
    SendMessageResult,
    ReceiveMessageParams,
    ReceiveMessageResult,
    ValidateCredentialsResult,
} from './channel-adapter.interface';
import { IInboxChannel } from '@/lib/db/models/inbox-channel.model';

/**
 * Google Chat Channel Adapter
 * Uses Google Chat API (https://developers.google.com/chat/api)
 * 
 * Setup:
 * 1. Create Google Cloud project
 * 2. Enable Google Chat API
 * 3. Create service account with Chat Bot role
 * 4. Configure Chat Bot in Google Workspace Admin
 * 5. Store service account key JSON in channel config
 */
export class GoogleChatAdapter extends BaseChannelAdapter {
    getChannelType(): string {
        return 'google_chat';
    }

    getDisplayName(channel: IInboxChannel): string {
        return channel.name || 'Google Chat';
    }

    /**
     * Get OAuth2 access token using service account credentials
     */
    private async getAccessToken(channel: IInboxChannel): Promise<string> {
        const keyJson = channel.config.googleChatServiceAccountKey;
        if (!keyJson) {
            throw new Error('Missing Google Chat service account key');
        }

        let key: { client_email: string; private_key: string };
        try {
            key = typeof keyJson === 'string' ? JSON.parse(keyJson) : keyJson;
        } catch {
            throw new Error('Invalid service account key JSON');
        }

        // Create JWT using jsonwebtoken package
        const jwt = await import('jsonwebtoken');
        const now = Math.floor(Date.now() / 1000);
        const token = jwt.default.sign(
            {
                iss: key.client_email,
                scope: 'https://www.googleapis.com/auth/chat.bot',
                aud: 'https://oauth2.googleapis.com/token',
                iat: now,
                exp: now + 3600,
            },
            key.private_key,
            { algorithm: 'RS256' }
        );

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: token,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Google OAuth error: ${err}`);
        }

        const data = await response.json();
        return data.access_token;
    }

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        const { channel, conversation, content } = params;

        try {
            const accessToken = await this.getAccessToken(channel);
            const spaceName = conversation.metadata?.spaceName || conversation.externalId?.split(':')[1];

            if (!spaceName) {
                throw new Error('Missing Google Chat space name');
            }

            const url = `https://chat.googleapis.com/v1/${spaceName}/messages`;

            const messageBody: Record<string, unknown> = {
                text: content,
            };

            // Handle media as cards with image widgets
            if (params.mediaUrl && params.mediaType === 'image') {
                messageBody.cardsV2 = [{
                    cardId: 'media-card',
                    card: {
                        sections: [{
                            widgets: [{
                                image: {
                                    imageUrl: params.mediaUrl,
                                    altText: params.fileName || 'Image',
                                },
                            }],
                        }],
                    },
                }];
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(messageBody),
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Google Chat API error: ${err}`);
            }

            const data = await response.json();

            return {
                externalMessageId: data.name || '',
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
        const { payload } = params;

        // Google Chat sends event objects
        if (!payload || payload.type !== 'MESSAGE') {
            throw new Error('Invalid Google Chat webhook — not a MESSAGE event');
        }

        const message = payload.message as Record<string, unknown> | undefined;
        const userField = payload.user as Record<string, unknown> | undefined;
        const msgSender = message?.sender as Record<string, unknown> | undefined;
        const sender = userField || msgSender;
        const space = payload.space as Record<string, unknown> | undefined;

        if (!message || !space) {
            throw new Error('Invalid Google Chat payload — missing message or space');
        }

        const spaceName = String(space.name || ''); // e.g. "spaces/AAAA..."
        const senderName = String(sender?.displayName || sender?.name || 'Unknown');

        const content = String(message.text || message.argumentText || '');
        let messageType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
        let mediaUrl: string | undefined;
        let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;
        let fileName: string | undefined;

        // Handle attachments
        const attachments = message.attachment as Array<Record<string, unknown>> | undefined;
        if (attachments && attachments.length > 0) {
            const attachment = attachments[0];
            const contentType = String(attachment.contentType || '');
            if (contentType.startsWith('image')) {
                messageType = 'image';
                mediaType = 'image';
                mediaUrl = attachment.downloadUri as string | undefined;
            } else {
                messageType = 'document';
                mediaType = 'document';
                mediaUrl = attachment.downloadUri as string | undefined;
                fileName = attachment.source === 'UPLOADED_CONTENT' ? 'attachment' : String(attachment.source || '');
            }
        }

        const msgThread = message.thread as Record<string, unknown> | undefined;
        const externalId = this.createExternalId('google_chat', spaceName);

        return {
            message: {
                direction: 'inbound',
                messageType,
                content,
                mediaUrl,
                mediaType,
                fileName,
                externalMessageId: String(message.name || ''),
                status: 'sent',
                metadata: {
                    spaceName,
                    spaceType: space.type,
                    threadName: msgThread?.name,
                },
            },
            conversation: {
                externalId,
                metadata: {
                    spaceName,
                    senderName,
                    senderEmail: sender?.email,
                    spaceType: space.type,
                    threadName: msgThread?.name,
                },
            },
            shouldCreateConversation: true,
        };
    }

    async validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult> {
        try {
            const accessToken = await this.getAccessToken(channel);

            // Test the token by listing spaces
            const response = await fetch('https://chat.googleapis.com/v1/spaces?pageSize=1', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!response.ok) {
                const err = await response.text();
                return { isValid: false, error: `API error: ${err}` };
            }

            return {
                isValid: true,
                details: { tokenObtained: true },
            };
        } catch (error) {
            return { isValid: false, error: (error as Error).message };
        }
    }
}

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
 * Microsoft Teams Channel Adapter
 * Uses Microsoft Bot Framework REST API
 * 
 * Setup:
 * 1. Register app in Azure AD → get App ID + Password
 * 2. Create Bot Channel Registration in Azure
 * 3. Configure messaging endpoint (webhook URL)
 * 4. Store appId + appPassword + tenantId in channel config
 */
export class TeamsAdapter extends BaseChannelAdapter {
    getChannelType(): string {
        return 'teams';
    }

    getDisplayName(channel: IInboxChannel): string {
        return channel.name || 'Microsoft Teams';
    }

    /**
     * Get OAuth token for Bot Framework API calls
     */
    private async getAccessToken(channel: IInboxChannel): Promise<string> {
        const { teamsAppId, teamsAppPassword, tenantId } = channel.config;

        if (!teamsAppId || !teamsAppPassword) {
            throw new Error('Missing Teams App ID or Password');
        }

        const tokenUrl = tenantId
            ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
            : 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: teamsAppId,
                client_secret: teamsAppPassword,
                scope: 'https://api.botframework.com/.default',
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Failed to get Teams token: ${err}`);
        }

        const data = await response.json();
        return data.access_token;
    }

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        const { channel, conversation, content } = params;

        try {
            const accessToken = await this.getAccessToken(channel);
            const serviceUrl = channel.config.serviceUrl || 'https://smba.trafficmanager.net/teams/';
            const conversationId = conversation.externalId?.split(':')[1] || conversation.metadata?.conversationId;

            if (!conversationId) {
                throw new Error('Missing Teams conversation ID');
            }

            const url = `${serviceUrl}v3/conversations/${conversationId}/activities`;

            const activity: Record<string, unknown> = {
                type: 'message',
                text: content,
            };

            // Handle media as attachments
            if (params.mediaUrl) {
                activity.attachments = [{
                    contentType: params.mediaType === 'image' ? 'image/*' : 'application/octet-stream',
                    contentUrl: params.mediaUrl,
                    name: params.fileName || 'attachment',
                }];
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(activity),
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Teams API error: ${err}`);
            }

            const data = await response.json();

            return {
                externalMessageId: data.id || '',
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

        // Bot Framework sends an Activity object
        const activity = payload;

        if (!activity || activity.type !== 'message') {
            throw new Error('Invalid Teams webhook — not a message activity');
        }

        const conversation = payload.conversation as Record<string, unknown> | undefined;
        const from = payload.from as Record<string, unknown> | undefined;
        const conversationId = String(conversation?.id || '');
        const senderName = String(from?.name || from?.id || 'Unknown');

        const content = String(payload.text || '');
        let messageType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
        let mediaUrl: string | undefined;
        let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;
        let fileName: string | undefined;

        // Handle attachments
        const attachments = payload.attachments as Array<Record<string, unknown>> | undefined;
        if (attachments && attachments.length > 0) {
            const attachment = attachments[0];
            const contentType = String(attachment.contentType || '');
            if (contentType.startsWith('image')) {
                messageType = 'image';
                mediaType = 'image';
                mediaUrl = attachment.contentUrl as string | undefined;
            } else {
                messageType = 'document';
                mediaType = 'document';
                mediaUrl = attachment.contentUrl as string | undefined;
                fileName = attachment.name as string | undefined;
            }
        }

        // Store the serviceUrl for replies
        const serviceUrl = String(payload.serviceUrl || '');

        const externalId = this.createExternalId('teams', conversationId);

        return {
            message: {
                direction: 'inbound',
                messageType,
                content,
                mediaUrl,
                mediaType,
                fileName,
                externalMessageId: String(payload.id || ''),
                status: 'sent',
                metadata: {
                    serviceUrl,
                    replyToId: payload.replyToId,
                    channelId: payload.channelId,
                },
            },
            conversation: {
                externalId,
                metadata: {
                    conversationId,
                    senderName,
                    senderAadObjectId: from?.aadObjectId,
                    serviceUrl,
                    tenantId: conversation?.tenantId,
                },
            },
            shouldCreateConversation: true,
        };
    }

    async validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult> {
        try {
            const accessToken = await this.getAccessToken(channel);

            return {
                isValid: true,
                details: {
                    tokenObtained: true,
                    tokenLength: accessToken.length,
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

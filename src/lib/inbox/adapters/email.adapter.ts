import { BaseChannelAdapter } from './channel-adapter.interface';
import { IInboxChannel } from '@/lib/db/models/inbox-channel.model';
import { IInboxConversation } from '@/lib/db/models/inbox-conversation.model';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';

/**
 * Email Channel Adapter
 * Supports SMTP/IMAP and OAuth (Gmail, Outlook)
 */
export class EmailAdapter extends BaseChannelAdapter {
    channelType = 'email' as const;

    getChannelType(): string {
        return 'email';
    }

    /**
     * Send email message
     */
    async sendMessage(params: {
        channel: IInboxChannel;
        conversation: IInboxConversation;
        content: string;
        mediaUrl?: string;
        mediaType?: string;
        fileName?: string;
    }): Promise<{ externalMessageId: string; status: 'sent' | 'failed' }> {
        try {
            const config = params.channel.config;

            // Create transporter based on provider
            let transporter;
            if (config.provider === 'gmail' && config.oauth) {
                // Gmail OAuth
                transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        type: 'OAuth2',
                        user: config.email,
                        accessToken: config.oauth.accessToken,
                        refreshToken: config.oauth.refreshToken,
                    },
                });
            } else if (config.smtp) {
                // SMTP
                transporter = nodemailer.createTransport({
                    host: config.smtp.host,
                    port: config.smtp.port,
                    secure: config.smtp.port === 465,
                    auth: {
                        user: config.smtp.username,
                        pass: config.smtp.password,
                    },
                });
            } else {
                throw new Error('No email configuration found');
            }

            const metadata = params.conversation.metadata || {};
            // Prepare email
            const mailOptions: {
                from: string | undefined;
                to: string | undefined;
                subject: string;
                text: string;
                html: string;
                inReplyTo?: string;
                references?: string;
                attachments?: { filename: string; path: string }[];
            } = {
                from: config.email,
                to: String(metadata.email || ''),
                subject: String(metadata.subject || 'Re: Conversation'),
                text: params.content,
                html: `<p>${params.content.replace(/\n/g, '<br>')}</p>`,
                inReplyTo: metadata.messageId ? String(metadata.messageId) : undefined,
                references: metadata.references ? String(metadata.references) : (metadata.messageId ? String(metadata.messageId) : undefined),
            };

            // Add attachment if media
            if (params.mediaUrl) {
                mailOptions.attachments = [
                    {
                        filename: params.fileName || 'attachment',
                        path: params.mediaUrl,
                    },
                ];
            }

            // Send email
            const info = await transporter.sendMail(mailOptions as Parameters<typeof transporter.sendMail>[0]);

            return {
                externalMessageId: (info as { messageId?: string }).messageId || '',
                status: 'sent',
            };
        } catch (error) {
            console.error('Error sending email:', error);
            return {
                externalMessageId: '',
                status: 'failed',
            };
        }
    }

    /**
     * Receive and parse email message
     */
    async receiveMessage(params: import('./channel-adapter.interface').ReceiveMessageParams): Promise<import('./channel-adapter.interface').ReceiveMessageResult> {
        try {
            // Parse email (payload should be raw email content)
            const rawPayload = (params.payload.raw ?? params.payload) as Buffer | string;
            const parsed = await simpleParser(rawPayload);

            const fromEmail = parsed.from?.value[0]?.address || '';
            const subject = parsed.subject || '';
            const messageId = parsed.messageId || '';
            const inReplyTo = parsed.inReplyTo || '';
            const references = parsed.references || [];

            // Extract text content
            const content = parsed.text || parsed.html || '';

            // Check for attachments
            let mediaUrl: string | undefined;
            let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;
            let fileName: string | undefined;

            if (parsed.attachments && parsed.attachments.length > 0) {
                const attachment = parsed.attachments[0];
                fileName = attachment.filename;

                // Determine media type from content type
                if (attachment.contentType.startsWith('image/')) {
                    mediaType = 'image';
                } else if (attachment.contentType.startsWith('video/')) {
                    mediaType = 'video';
                } else if (attachment.contentType.startsWith('audio/')) {
                    mediaType = 'audio';
                } else {
                    mediaType = 'document';
                }

                // TODO: Upload attachment to storage and get URL
                // mediaUrl = await uploadFile(attachment.content, fileName);
            }

            return {
                conversation: {
                    externalId: `email:${fromEmail}`,
                    metadata: {
                        email: fromEmail,
                        subject,
                        messageId,
                        inReplyTo,
                        references: [...references, inReplyTo].filter(Boolean),
                    },
                },
                message: {
                    direction: 'inbound',
                    messageType: mediaType || 'text',
                    content,
                    mediaUrl,
                    mediaType,
                    fileName,
                    externalMessageId: messageId,
                    status: 'sent',
                    metadata: {
                        from: fromEmail,
                        subject,
                        date: parsed.date,
                    },
                },
                shouldCreateConversation: true,
            };
        } catch (error) {
            console.error('Error parsing email:', error);
            throw error;
        }
    }

    /**
     * Validate email credentials
     */
    async validateCredentials(channel: IInboxChannel): Promise<{
        isValid: boolean;
        error?: string;
    }> {
        try {
            const config = channel.config;

            if (config.provider === 'gmail' && config.oauth) {
                // Validate Gmail OAuth token
                const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${config.oauth.accessToken}`,
                    },
                });

                if (!response.ok) {
                    return { isValid: false, error: 'Invalid Gmail OAuth token' };
                }

                return { isValid: true };
            } else if (config.smtp && config.imap) {
                // Test SMTP connection
                const transporter = nodemailer.createTransport({
                    host: config.smtp.host,
                    port: config.smtp.port,
                    secure: config.smtp.port === 465,
                    auth: {
                        user: config.smtp.username,
                        pass: config.smtp.password,
                    },
                });

                await transporter.verify();
                return { isValid: true };
            }

            return { isValid: false, error: 'Invalid email configuration' };
        } catch (error) {
            return { isValid: false, error: (error as Error).message };
        }
    }

    /**
     * Get display name for channel
     */
    getDisplayName(channel: IInboxChannel): string {
        return channel.config.email || 'Email Channel';
    }

    /**
     * Get channel icon
     */
    getIcon(): string {
        return '📧';
    }
}

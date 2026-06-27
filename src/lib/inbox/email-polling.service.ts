/**
 * Email IMAP Polling Service
 * Polls IMAP servers for incoming emails and creates inbox conversations
 */

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import { inboxService } from './inbox.service';
import { Types } from 'mongoose';

interface EmailPollingConfig {
    channelId: Types.ObjectId;
    host: string;
    port: number;
    user: string;
    password: string;
    tls: boolean;
    pollInterval: number; // milliseconds
}

class EmailPollingService {
    private pollers: Map<string, NodeJS.Timeout> = new Map();
    private connections: Map<string, InstanceType<typeof Imap>> = new Map();

    /**
     * Start polling for a specific email channel
     */
    async startPolling(config: EmailPollingConfig): Promise<void> {
        const channelId = config.channelId.toString();

        // Stop existing poller if any
        this.stopPolling(channelId);

        // Create IMAP connection
        const imap = new Imap({
            user: config.user,
            password: config.password,
            host: config.host,
            port: config.port,
            tls: config.tls,
            tlsOptions: { rejectUnauthorized: false },
        });

        this.connections.set(channelId, imap);

        // Set up IMAP event handlers
        imap.once('ready', () => {
            console.log(`IMAP connected for channel ${channelId}`);
            this.openInbox(imap, channelId);
        });

        imap.once('error', (err: Error) => {
            console.error(`IMAP error for channel ${channelId}:`, err);
            this.reconnect(config);
        });

        imap.once('end', () => {
            console.log(`IMAP connection ended for channel ${channelId}`);
        });

        // Connect
        imap.connect();

        // Set up polling interval
        const pollerId = setInterval(() => {
            this.checkNewMessages(imap, channelId);
        }, config.pollInterval);

        this.pollers.set(channelId, pollerId);
    }

    /**
     * Stop polling for a channel
     */
    stopPolling(channelId: string): void {
        // Clear interval
        const poller = this.pollers.get(channelId);
        if (poller) {
            clearInterval(poller);
            this.pollers.delete(channelId);
        }

        // Close IMAP connection
        const connection = this.connections.get(channelId);
        if (connection) {
            connection.end();
            this.connections.delete(channelId);
        }
    }

    /**
     * Open inbox folder
     */
    private openInbox(imap: InstanceType<typeof Imap>, channelId: string): void {
        imap.openBox('INBOX', false, (err: Error, box: { messages: { total: number } }) => {
            if (err) {
                console.error(`Error opening inbox for channel ${channelId}:`, err);
                return;
            }
            console.log(`Inbox opened for channel ${channelId}, ${box.messages.total} messages`);
        });
    }

    /**
     * Check for new messages
     */
    private checkNewMessages(imap: InstanceType<typeof Imap>, channelId: string): void {
        try {
            // Search for unseen messages
            imap.search(['UNSEEN'], (err: Error, results: number[]) => {
                if (err) {
                    console.error(`Error searching messages for channel ${channelId}:`, err);
                    return;
                }

                if (!results || results.length === 0) {
                    return; // No new messages
                }

                console.log(`Found ${results.length} new messages for channel ${channelId}`);

                // Fetch new messages
                const fetch = imap.fetch(results, {
                    bodies: '',
                    markSeen: true,
                });

                fetch.on('message', (msg: NodeJS.EventEmitter, _seqno: number) => {
                    msg.on('body', (stream: NodeJS.ReadableStream) => {
                        this.processMessage(stream, channelId);
                    });
                });
            });
        } catch (error: unknown) {
            console.error(`Error checking messages for channel ${channelId}:`, error);
        }
    }

    /**
     * Process incoming email message
     */
    private async processMessage(stream: NodeJS.ReadableStream, channelId: string): Promise<void> {
        try {
            const parsed = await simpleParser(stream);

            const fromEmail = parsed.from?.value[0]?.address || '';
            const subject = parsed.subject || '';
            const content = parsed.text || parsed.html || '';

            // Get channel
            const channel = await InboxChannel.findById(new Types.ObjectId(channelId));
            if (!channel) {
                console.error(`Channel ${channelId} not found`);
                return;
            }

            // Create or update conversation
            await inboxService.receiveMessage({
                channelId: new Types.ObjectId(channelId),
                payload: {
                    from: fromEmail,
                    subject,
                    content,
                    messageId: parsed.messageId,
                    date: parsed.date,
                },
            });

            console.log(`Processed email from ${fromEmail} for channel ${channelId}`);
        } catch (error: unknown) {
            console.error(`Error processing message for channel ${channelId}:`, error);
        }
    }

    /**
     * Reconnect after error
     */
    private reconnect(config: EmailPollingConfig): void {
        const channelId = config.channelId.toString();
        console.log(`Reconnecting IMAP for channel ${channelId}...`);

        setTimeout(() => {
            this.startPolling(config);
        }, 30000); // Retry after 30 seconds
    }

    /**
     * Start polling for all active email channels
     */
    async startAllPollers(): Promise<void> {
        try {
            const emailChannels = await InboxChannel.find({
                channelType: 'email',
                isActive: true,
            });

            for (const channel of emailChannels) {
                if (channel.config.imap) {
                    await this.startPolling({
                        channelId: channel._id,
                        host: channel.config.imap.host,
                        port: channel.config.imap.port,
                        user: channel.config.imap.username,
                        password: channel.config.imap.password,
                        tls: channel.config.imap.port === 993,
                        pollInterval: 60000, // Poll every 60 seconds
                    });
                }
            }

            console.log(`Started polling for ${emailChannels.length} email channels`);
        } catch (error: unknown) {
            console.error('Error starting email pollers:', error);
        }
    }

    /**
     * Stop all pollers
     */
    stopAllPollers(): void {
        for (const channelId of this.pollers.keys()) {
            this.stopPolling(channelId);
        }
    }
}

// Export singleton
export const emailPollingService = new EmailPollingService();

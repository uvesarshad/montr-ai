/**
 * SLA Monitoring Service
 * Monitors conversations for SLA breaches and sends alerts
 */

import InboxConversation, { IInboxConversation } from '@/lib/db/models/inbox-conversation.model';
import InboxChannel, { IInboxChannel } from '@/lib/db/models/inbox-channel.model';
import { Types } from 'mongoose';

type PopulatedConversation = IInboxConversation & { channelId: IInboxChannel; contactId: { name?: string } | Types.ObjectId };

interface SLAConfig {
    firstResponseTime: number; // minutes
    resolutionTime: number; // minutes
    enableAlerts: boolean;
    alertEmails?: string[];
}

class SLAMonitoringService {
    private monitoringInterval: NodeJS.Timeout | null = null;

    /**
     * Start SLA monitoring
     */
    startMonitoring(intervalMs: number = 60000): void {
        if (this.monitoringInterval) {
            return; // Already running
        }

        console.log('Starting SLA monitoring...');

        this.monitoringInterval = setInterval(() => {
            this.checkSLABreaches();
        }, intervalMs);

        // Run immediately
        this.checkSLABreaches();
    }

    /**
     * Stop SLA monitoring
     */
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log('SLA monitoring stopped');
        }
    }

    /**
     * Check for SLA breaches
     */
    private async checkSLABreaches(): Promise<void> {
        try {
            // Get all open/pending conversations
            const conversations = await InboxConversation.find({
                status: { $in: ['open', 'pending'] },
            }).populate('channelId');

            for (const conversation of conversations) {
                await this.checkConversationSLA(conversation);
            }
        } catch (error) {
            console.error('Error checking SLA breaches:', error);
        }
    }

    /**
     * Check SLA for a specific conversation
     */
    private async checkConversationSLA(conversation: PopulatedConversation): Promise<void> {
        try {
            const channel = conversation.channelId;
            if (!channel || !channel.config?.sla) {
                return; // No SLA configured
            }

            const slaConfig: SLAConfig = channel.config.sla;
            const now = new Date();

            // Check first response time
            if (!conversation.firstResponseTime && conversation.totalMessages === 1) {
                const timeSinceCreation = now.getTime() - conversation.createdAt.getTime();
                const slaDeadline = slaConfig.firstResponseTime * 60 * 1000; // Convert to ms

                if (timeSinceCreation > slaDeadline) {
                    // SLA breached
                    await this.handleSLABreach(conversation, 'first_response', {
                        deadline: slaDeadline,
                        elapsed: timeSinceCreation,
                    });
                } else if (timeSinceCreation > slaDeadline * 0.8) {
                    // At risk (80% of deadline)
                    await this.updateSLAStatus(conversation._id, 'at_risk');
                }
            }

            // Check resolution time
            if (conversation.status === 'open' || conversation.status === 'pending') {
                const timeSinceCreation = now.getTime() - conversation.createdAt.getTime();
                const slaDeadline = slaConfig.resolutionTime * 60 * 1000;

                if (timeSinceCreation > slaDeadline) {
                    // SLA breached
                    await this.handleSLABreach(conversation, 'resolution', {
                        deadline: slaDeadline,
                        elapsed: timeSinceCreation,
                    });
                } else if (timeSinceCreation > slaDeadline * 0.8) {
                    // At risk
                    await this.updateSLAStatus(conversation._id, 'at_risk');
                }
            }
        } catch (error) {
            console.error('Error checking conversation SLA:', error);
        }
    }

    /**
     * Handle SLA breach
     */
    private async handleSLABreach(
        conversation: PopulatedConversation,
        type: 'first_response' | 'resolution',
        details: { deadline: number; elapsed: number }
    ): Promise<void> {
        try {
            // Update conversation SLA status
            await this.updateSLAStatus(conversation._id, 'breached');

            // Send alert
            const channel = conversation.channelId;
            if (channel.config?.sla?.enableAlerts) {
                await this.sendSLAAlert(conversation, type, details);
            }

            console.log(
                `SLA breach detected: ${type} for conversation ${conversation._id}`
            );
        } catch (error) {
            console.error('Error handling SLA breach:', error);
        }
    }

    /**
     * Update SLA status
     */
    private async updateSLAStatus(
        conversationId: Types.ObjectId,
        status: 'on_track' | 'at_risk' | 'breached'
    ): Promise<void> {
        await InboxConversation.findByIdAndUpdate(conversationId, {
            slaStatus: status,
        });
    }

    /**
     * Send SLA alert notification
     */
    private async sendSLAAlert(
        conversation: PopulatedConversation,
        type: 'first_response' | 'resolution',
        details: { deadline: number; elapsed: number }
    ): Promise<void> {
        try {
            // TODO: Integrate with notification service (email, Slack, etc.)
            const contactId = conversation.contactId as { name?: string } | null;
            const contactName = contactId?.name || 'Unknown';

            const message = `
        SLA Breach Alert
        
        Type: ${type === 'first_response' ? 'First Response Time' : 'Resolution Time'}
        Conversation ID: ${conversation._id}
        Contact: ${contactName}
        Channel: ${conversation.channelId?.name || 'Unknown'}
        
        Deadline: ${Math.round(details.deadline / 60000)} minutes
        Elapsed: ${Math.round(details.elapsed / 60000)} minutes
        
        Please take immediate action.
      `;

            console.log('SLA Alert:', message);

            // Send email notification
            const alertEmails = conversation.channelId?.config?.sla?.alertEmails || [];
            for (const email of alertEmails) {
                // await emailService.send({ to: email, subject: 'SLA Breach Alert', body: message });
                console.log(`Alert sent to ${email}`);
            }
        } catch (error) {
            console.error('Error sending SLA alert:', error);
        }
    }

    /**
     * Calculate SLA deadline for a conversation
     */
    async calculateSLADeadline(params: {
        conversationId: Types.ObjectId;
        channelId: Types.ObjectId;
    }): Promise<Date | null> {
        try {
            const channel = await InboxChannel.findById(params.channelId);
            if (!channel || !channel.config?.sla) {
                return null;
            }

            const conversation = await InboxConversation.findById(params.conversationId);
            if (!conversation) {
                return null;
            }

            const slaConfig: SLAConfig = channel.config.sla;
            const deadline = new Date(
                conversation.createdAt.getTime() + slaConfig.resolutionTime * 60 * 1000
            );

            return deadline;
        } catch (error) {
            console.error('Error calculating SLA deadline:', error);
            return null;
        }
    }
}

export const slaMonitoringService = new SLAMonitoringService();

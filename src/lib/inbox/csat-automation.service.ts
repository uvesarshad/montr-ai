/**
 * CSAT Automation Service
 * Automatically sends CSAT surveys after conversation resolution
 */

import InboxConversation, { IInboxConversation } from '@/lib/db/models/inbox-conversation.model';
import InboxMessage from '@/lib/db/models/inbox-message.model';
import { Types } from 'mongoose';
import { adapterRegistry } from './adapters/adapter-registry';

interface CSATConfig {
    enabled: boolean;
    delayMinutes: number; // Delay after resolution before sending survey
    reminderEnabled: boolean;
    reminderDelayHours: number;
}

class CSATAutomationService {
    /**
     * Schedule CSAT survey for a resolved conversation
     */
    async scheduleCSAT(conversationId: Types.ObjectId): Promise<void> {
        try {
            const conversation = await InboxConversation.findById(conversationId).populate('channelId');

            if (!conversation || conversation.status !== 'resolved') {
                return;
            }

            // Check if CSAT already submitted
            if (conversation.csat?.rating) {
                return;
            }

            // Check if CSAT is enabled for this channel
            const csatConfig: CSATConfig = conversation.channelId?.config?.csat || {
                enabled: true,
                delayMinutes: 5,
                reminderEnabled: false,
                reminderDelayHours: 24,
            };

            if (!csatConfig.enabled) {
                return;
            }

            // Schedule survey
            setTimeout(async () => {
                await this.sendCSATSurvey(conversationId);
            }, csatConfig.delayMinutes * 60 * 1000);

            console.log(`CSAT survey scheduled for conversation ${conversationId}`);
        } catch (error) {
            console.error('Error scheduling CSAT:', error);
        }
    }

    /**
     * Send CSAT survey message
     */
    private async sendCSATSurvey(conversationId: Types.ObjectId): Promise<void> {
        try {
            const conversation = await InboxConversation.findById(conversationId).populate('channelId');

            if (!conversation) {
                return;
            }

            // Check if already submitted
            if (conversation.csat?.rating) {
                return;
            }

            // Get channel adapter
            const adapter = adapterRegistry.getAdapter(conversation.channelId.channelType);

            // Generate CSAT survey message
            const surveyMessage = this.generateSurveyMessage(conversation);

            // Send via channel adapter
            await adapter.sendMessage({
                channel: conversation.channelId,
                conversation,
                content: surveyMessage,
            });

            // Create internal note
            await InboxMessage.create({
                conversationId: conversation._id,
                channelId: conversation.channelId._id,
                contactId: conversation.contactId,
                direction: 'outbound',
                messageType: 'text',
                content: surveyMessage,
                isNote: true,
                status: 'sent',
            });

            console.log(`CSAT survey sent for conversation ${conversationId}`);
        } catch (error) {
            console.error('Error sending CSAT survey:', error);
        }
    }

    /**
     * Generate CSAT survey message
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateSurveyMessage(_conversation: IInboxConversation): string {
        return `
Thank you for contacting us! We hope we were able to help you.

How would you rate your experience with our support team?

Please reply with a number from 1 to 5:
⭐ 1 - Poor
⭐⭐ 2 - Fair
⭐⭐⭐ 3 - Good
⭐⭐⭐⭐ 4 - Very Good
⭐⭐⭐⭐⭐ 5 - Excellent

Your feedback helps us improve our service!
    `.trim();
    }

    /**
     * Process CSAT response from customer
     */
    async processCSATResponse(params: {
        conversationId: Types.ObjectId;
        message: string;
    }): Promise<boolean> {
        try {
            // Extract rating from message
            const rating = this.extractRating(params.message);

            if (!rating) {
                return false; // Not a valid CSAT response
            }

            // Update conversation with CSAT rating
            await InboxConversation.findByIdAndUpdate(params.conversationId, {
                'csat.rating': rating,
                'csat.submittedAt': new Date(),
            });

            console.log(`CSAT rating ${rating} recorded for conversation ${params.conversationId}`);
            return true;
        } catch (error) {
            console.error('Error processing CSAT response:', error);
            return false;
        }
    }

    /**
     * Extract rating from message
     */
    private extractRating(message: string): number | null {
        // Look for numbers 1-5
        const match = message.match(/[1-5]/);
        if (match) {
            const rating = parseInt(match[0]);
            if (rating >= 1 && rating <= 5) {
                return rating;
            }
        }
        return null;
    }

    /**
     * Send CSAT reminder
     */
    async sendReminder(conversationId: Types.ObjectId): Promise<void> {
        try {
            const conversation = await InboxConversation.findById(conversationId).populate('channelId');

            if (!conversation || conversation.csat?.rating) {
                return; // Already submitted
            }

            const csatConfig: CSATConfig = conversation.channelId?.config?.csat || {
                enabled: true,
                delayMinutes: 5,
                reminderEnabled: false,
                reminderDelayHours: 24,
            };

            if (!csatConfig.reminderEnabled) {
                return;
            }

            // Send reminder after delay
            setTimeout(async () => {
                await this.sendCSATSurvey(conversationId);
            }, csatConfig.reminderDelayHours * 60 * 60 * 1000);
        } catch (error) {
            console.error('Error sending CSAT reminder:', error);
        }
    }
}

export const csatAutomationService = new CSATAutomationService();

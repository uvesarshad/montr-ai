import CrmActivity from '@/lib/db/models/crm/activity.model';
import WhatsAppCampaign from '@/lib/db/models/whatsapp-campaign.model';
import { connectDB } from '@/lib/mongodb';
import { Types } from 'mongoose';

interface LeanMessage {
    _id: Types.ObjectId;
    contactId?: Types.ObjectId;
    createdAt: Date;
    messageMetadata?: {
        channel?: string;
        direction?: 'inbound' | 'outbound';
        accountId?: Types.ObjectId;
    };
}

export interface AnalyticsMetrics {
    totalMessages: {
        sent: number;
        received: number;
        total: number;
    };
    responseTime: {
        average: number; // in minutes
        median: number;
    };
    campaignPerformance: {
        total: number;
        completed: number;
        active: number;
        avgDeliveryRate: number;
        avgReadRate: number;
    };
    conversationVolume: {
        date: string;
        inbound: number;
        outbound: number;
    }[];
    templateUsage: {
        templateName: string;
        count: number;
    }[];
}

/**
 * WhatsApp Analytics Service
 * Aggregates and calculates analytics metrics
 */
export class WhatsAppAnalyticsService {
    /**
     * Get analytics for a specific time period
     */
    async getAnalytics(
        organizationId: string,
        accountId?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<AnalyticsMetrics> {
        await connectDB();

        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
        const end = endDate || new Date();

        const query: Record<string, unknown> = {
            type: 'message',
            'messageMetadata.channel': 'whatsapp',
            createdAt: { $gte: start, $lte: end },
        };

        if (accountId) {
            // Filter by account if specified
            query['messageMetadata.accountId'] = accountId;
        }

        // Fetch all messages
        const messages = (await CrmActivity.find(query).lean()) as unknown as LeanMessage[];

        // Calculate metrics
        const totalMessages = {
            sent: messages.filter(m => m.messageMetadata?.direction === 'outbound').length,
            received: messages.filter(m => m.messageMetadata?.direction === 'inbound').length,
            total: messages.length,
        };

        // Calculate response time
        const responseTimes = await this.calculateResponseTimes(messages);

        // Get campaign performance
        const campaignPerformance = await this.getCampaignPerformance(start, end);

        // Get conversation volume by date
        const conversationVolume = this.getConversationVolume(messages, start, end);

        // Get template usage
        const templateUsage = await this.getTemplateUsage(start, end);

        return {
            totalMessages,
            responseTime: responseTimes,
            campaignPerformance,
            conversationVolume,
            templateUsage,
        };
    }

    /**
     * Calculate average and median response times
     */
    private async calculateResponseTimes(messages: LeanMessage[]): Promise<{ average: number; median: number }> {
        const responseTimes: number[] = [];

        // Group messages by contact
        const messagesByContact = new Map<string, LeanMessage[]>();

        messages.forEach(msg => {
            const contactId = msg.contactId?.toString();
            if (!contactId) return;

            if (!messagesByContact.has(contactId)) {
                messagesByContact.set(contactId, []);
            }
            messagesByContact.get(contactId)!.push(msg);
        });

        // Calculate response times for each conversation
        messagesByContact.forEach(contactMessages => {
            contactMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            for (let i = 0; i < contactMessages.length - 1; i++) {
                const current = contactMessages[i];
                const next = contactMessages[i + 1];

                // If customer message followed by agent response
                if (current.messageMetadata?.direction === 'inbound' &&
                    next.messageMetadata?.direction === 'outbound') {
                    const timeDiff = (next.createdAt.getTime() - current.createdAt.getTime()) / (1000 * 60); // minutes
                    responseTimes.push(timeDiff);
                }
            }
        });

        if (responseTimes.length === 0) {
            return { average: 0, median: 0 };
        }

        const average = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const sorted = responseTimes.sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];

        return { average: Math.round(average), median: Math.round(median) };
    }

    /**
     * Get campaign performance metrics
     */
    private async getCampaignPerformance(
        startDate: Date,
        endDate: Date
    ): Promise<AnalyticsMetrics['campaignPerformance']> {
        const campaigns = await WhatsAppCampaign.find({
            createdAt: { $gte: startDate, $lte: endDate },
        }).lean();

        const completed = campaigns.filter(c => c.status === 'completed').length;
        const active = campaigns.filter(c => c.status === 'processing' || c.status === 'scheduled').length;

        let totalDelivered = 0;
        let totalSent = 0;
        let totalRead = 0;

        campaigns.forEach(campaign => {
            totalSent += campaign.stats?.sent || 0;
            totalDelivered += campaign.stats?.delivered || 0;
            totalRead += campaign.stats?.read || 0;
        });

        return {
            total: campaigns.length,
            completed,
            active,
            avgDeliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
            avgReadRate: totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0,
        };
    }

    /**
     * Get conversation volume by date
     */
    private getConversationVolume(messages: LeanMessage[], startDate: Date, endDate: Date): AnalyticsMetrics['conversationVolume'] {
        const volumeByDate = new Map<string, { inbound: number; outbound: number }>();

        // Initialize all dates in range
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            volumeByDate.set(dateStr, { inbound: 0, outbound: 0 });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Count messages by date
        messages.forEach(msg => {
            const dateStr = msg.createdAt.toISOString().split('T')[0];
            const volume = volumeByDate.get(dateStr);

            if (volume) {
                if (msg.messageMetadata?.direction === 'inbound') {
                    volume.inbound++;
                } else {
                    volume.outbound++;
                }
            }
        });

        // Convert to array
        return Array.from(volumeByDate.entries()).map(([date, counts]) => ({
            date,
            ...counts,
        }));
    }

    /**
     * Get template usage statistics
     */
    private async getTemplateUsage(
        startDate: Date,
        endDate: Date
    ): Promise<AnalyticsMetrics['templateUsage']> {
        const campaigns = await WhatsAppCampaign.find({
            createdAt: { $gte: startDate, $lte: endDate },
        })
            .populate('templateId', 'name')
            .lean();

        const templateCounts = new Map<string, number>();

        campaigns.forEach(campaign => {
            const populatedTemplate = campaign.templateId as unknown as { name?: string } | null;
            const templateName = populatedTemplate?.name || 'Unknown';
            const sent = campaign.stats?.sent || 0;
            templateCounts.set(templateName, (templateCounts.get(templateName) || 0) + sent);
        });

        return Array.from(templateCounts.entries())
            .map(([templateName, count]) => ({ templateName, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10
    }
}

export const whatsappAnalyticsService = new WhatsAppAnalyticsService();

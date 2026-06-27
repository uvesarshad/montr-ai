import CrmActivity from '@/lib/db/models/crm/activity.model';
import { connectDB } from '@/lib/mongodb';

interface ChannelEntry {
    type: string;
    identifier: string;
}

interface PopulatedContact {
    firstName?: string;
    lastName?: string;
    channels?: ChannelEntry[];
}

interface LeanActivity {
    createdAt: Date;
    contactId?: PopulatedContact | null;
    bodyPlain?: string;
    messageMetadata?: {
        direction?: string;
        status?: string;
        mediaType?: string;
        mediaUrls?: string[];
    };
}

export interface ExportOptions {
    contactId?: string;
    startDate?: Date;
    endDate?: Date;
    format: 'csv' | 'json';
}

/**
 * Conversation Export Service
 * Exports WhatsApp conversations to CSV or JSON
 */
export class ConversationExportService {
    /**
     * Export conversations
     */
    async exportConversations(
        options: ExportOptions
    ): Promise<string> {
        await connectDB();

        const query: Record<string, unknown> = {
            type: 'message',
            'messageMetadata.channel': 'whatsapp',
        };

        if (options.contactId) {
            query.contactId = options.contactId;
        }

        if (options.startDate || options.endDate) {
            const dateFilter: Record<string, Date> = {};
            if (options.startDate) dateFilter.$gte = options.startDate;
            if (options.endDate) dateFilter.$lte = options.endDate;
            query.createdAt = dateFilter;
        }

        const messages = await CrmActivity.find(query)
            .populate('contactId', 'firstName lastName channels')
            .sort({ createdAt: 1 })
            .lean() as unknown as LeanActivity[];

        if (options.format === 'json') {
            return this.exportAsJSON(messages);
        } else {
            return this.exportAsCSV(messages);
        }
    }

    /**
     * Export as JSON
     */
    private exportAsJSON(messages: LeanActivity[]): string {
        const formatted = messages.map(msg => ({
            timestamp: msg.createdAt,
            contact: `${msg.contactId?.firstName || ''} ${msg.contactId?.lastName || ''}`.trim(),
            phone: msg.contactId?.channels?.find((ch: ChannelEntry) => ch.type === 'whatsapp')?.identifier || '',
            direction: msg.messageMetadata?.direction || 'unknown',
            message: msg.bodyPlain || '',
            status: msg.messageMetadata?.status || '',
            mediaType: msg.messageMetadata?.mediaType || '',
            mediaUrls: msg.messageMetadata?.mediaUrls || [],
        }));

        return JSON.stringify(formatted, null, 2);
    }

    /**
     * Export as CSV
     */
    private exportAsCSV(messages: LeanActivity[]): string {
        const headers = ['Timestamp', 'Contact', 'Phone', 'Direction', 'Message', 'Status', 'Media Type', 'Media URLs'];
        const rows = messages.map(msg => [
            msg.createdAt.toISOString(),
            `${msg.contactId?.firstName || ''} ${msg.contactId?.lastName || ''}`.trim(),
            msg.contactId?.channels?.find((ch: ChannelEntry) => ch.type === 'whatsapp')?.identifier || '',
            msg.messageMetadata?.direction || 'unknown',
            (msg.bodyPlain || '').replace(/"/g, '""'), // Escape quotes
            msg.messageMetadata?.status || '',
            msg.messageMetadata?.mediaType || '',
            (msg.messageMetadata?.mediaUrls || []).join('; '),
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
        ].join('\n');

        return csvContent;
    }
}

export const conversationExportService = new ConversationExportService();

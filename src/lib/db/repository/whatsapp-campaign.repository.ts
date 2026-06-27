import { connectDB } from '@/lib/mongodb';
import WhatsAppCampaign, { IWhatsAppCampaign } from '@/lib/db/models/whatsapp-campaign.model';

export interface CreateWhatsAppCampaignInput {
    whatsappAccountId: string;
    name: string;
    createdById?: string;
    createdBy?: string;
    templateId?: string;
    scheduledAt?: Date;
    audienceType?: 'all' | 'segment' | 'tags' | 'list';
    audienceFilter?: Record<string, unknown>;
    targetType?: 'all' | 'groups' | 'individual' | 'filter';
    targetGroups?: unknown[];
    targetContacts?: unknown[];
    targetFilter?: Record<string, unknown>;
    messageType?: 'template' | 'text' | 'media';
    content?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    templateVariables?: Record<string, string>;
    timezone?: string;
    batchSize?: number;
    botEnabled?: boolean;
    status?: 'draft' | 'scheduled' | 'processing' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
}

export interface UpdateWhatsAppCampaignInput {
    name?: string;
    status?: 'draft' | 'scheduled' | 'processing' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
    scheduledAt?: Date;
    startedAt?: Date;
    completedAt?: Date;
    totalContacts?: number;
    stats?: {
        sent?: number;
        delivered?: number;
        read?: number;
        failed?: number;
        replied?: number;
    };
}

/**
 * WhatsApp Campaign Repository
 */
export const whatsappCampaignRepository = {
    /**
     * Create a new campaign
     */
    async create(input: CreateWhatsAppCampaignInput): Promise<IWhatsAppCampaign> {
        await connectDB();

        const campaign = new WhatsAppCampaign({
            ...input,
            status: input.scheduledAt ? 'scheduled' : 'draft',
        });

        return await campaign.save();
    },

    /**
     * Find by ID
     */
    async findById(id: string): Promise<IWhatsAppCampaign | null> {
        await connectDB();
        return await WhatsAppCampaign.findById(id)
            .populate('whatsappAccountId', 'name phoneNumber')
            .populate('templateId', 'name category');
    },

    /**
     * Find campaigns for an organization
     */
    async findByOrganizationId(limit = 20, offset = 0): Promise<IWhatsAppCampaign[]> {
        await connectDB();
        return await WhatsAppCampaign.find({ })
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .populate('templateId', 'name');
    },

    /**
     * Find campaigns by filter
     */
    async find(filter: Record<string, unknown>): Promise<IWhatsAppCampaign[]> {
        await connectDB();
        return await WhatsAppCampaign.find(filter)
            .sort({ createdAt: -1 })
            .populate('templateId', 'name');
    },

    /**
     * Update a campaign
     */
    async update(id: string, input: UpdateWhatsAppCampaignInput): Promise<IWhatsAppCampaign | null> {
        await connectDB();

        // Handle atomic updates for stats if provided
        if (input.stats) {
            // Logic handled by caller or simple replace for now - usually better to use $inc
        }

        return await WhatsAppCampaign.findByIdAndUpdate(id, input, { new: true });
    },

    /**
     * Increment campaign stats
     */
    async incrementStats(id: string, stats: { sent?: number; delivered?: number; read?: number; failed?: number; replied?: number }): Promise<void> {
        await connectDB();
        const update: Record<string, number> = {};

        // Build $inc update object
        for (const [key, value] of Object.entries(stats)) {
            if (value) {
                update[`stats.${key}`] = value;
            }
        }

        if (Object.keys(update).length > 0) {
            await WhatsAppCampaign.findByIdAndUpdate(id, { $inc: update });
        }
    },

    /**
     * Delete a campaign
     */
    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await WhatsAppCampaign.findByIdAndDelete(id);
        return !!result;
    },
};

export default whatsappCampaignRepository;

import { connectDB } from '@/lib/mongodb';
import AdLead, { IAdLead, AdLeadStatus } from '@/lib/db/models/ad-lead.model';
import type { AdPlatform } from '@/lib/db/models/ad-account.model';

export interface CreateAdLeadInput {
    brandId: string;
    platform: AdPlatform;
    adAccountId?: string;
    externalLeadId: string;
    campaignId?: string;
    campaignName?: string;
    adsetId?: string;
    adId?: string;
    formId?: string;
    formName?: string;
    pageId?: string;
    isTest?: boolean;
    fields: Record<string, string>;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    receivedAt?: Date;
}

export interface ListAdLeadsQuery {
    brandId?: string;
    platform?: AdPlatform;
    status?: AdLeadStatus;
    limit?: number;
    skip?: number;
}

/**
 * Ad Lead Repository — raw lead storage for the ads → CRM bridge.
 */
export const adLeadRepository = {
    /**
     * Insert a lead if it hasn't been seen yet (webhook redeliveries are
     * deduped on (platform, externalLeadId)). Returns null on duplicate.
     */
    async createIfNew(input: CreateAdLeadInput): Promise<IAdLead | null> {
        await connectDB();

        const existing = await AdLead.findOne({
            platform: input.platform,
            externalLeadId: input.externalLeadId,
        });
        if (existing) return null;

        try {
            const lead = new AdLead({
                ...input,
                receivedAt: input.receivedAt || new Date(),
                status: 'received',
            });
            return await lead.save();
        } catch (error) {
            // Race between concurrent deliveries — unique index wins
            if ((error as { code?: number }).code === 11000) return null;
            throw error;
        }
    },

    async findById(id: string): Promise<IAdLead | null> {
        await connectDB();
        return await AdLead.findById(id);
    },

    async list(query: ListAdLeadsQuery): Promise<{ leads: IAdLead[]; total: number }> {
        await connectDB();

        const filter: Record<string, unknown> = { };
        if (query.brandId) filter.brandId = query.brandId;
        if (query.platform) filter.platform = query.platform;
        if (query.status) filter.status = query.status;

        const limit = Math.min(query.limit ?? 50, 200);
        const skip = query.skip ?? 0;

        const [leads, total] = await Promise.all([
            AdLead.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limit),
            AdLead.countDocuments(filter),
        ]);

        return { leads, total };
    },

    async countByStatus(): Promise<Record<string, number>> {
        await connectDB();
        const rows = await AdLead.aggregate([
            { $match: { } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);
        return Object.fromEntries(rows.map((row: { _id: string; count: number }) => [row._id, row.count]));
    },

    async markSynced(id: string, contactId: string): Promise<void> {
        await connectDB();
        await AdLead.findByIdAndUpdate(id, {
            status: 'synced',
            contactId,
            syncedAt: new Date(),
            error: null,
        });
    },

    async markSkipped(id: string, reason: string): Promise<void> {
        await connectDB();
        await AdLead.findByIdAndUpdate(id, { status: 'skipped', error: reason });
    },

    async markFailed(id: string, error: string): Promise<void> {
        await connectDB();
        await AdLead.findByIdAndUpdate(id, { status: 'failed', error });
    },
};

export default adLeadRepository;

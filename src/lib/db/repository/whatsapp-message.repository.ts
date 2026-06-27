import mongoose from 'mongoose';
import WhatsAppMessage, { IWhatsAppMessage } from '../models/whatsapp-message.model';

export interface CreateMessageDto {
    whatsappAccountId: string;
    contactId?: string;
    campaignId?: string;
    phoneNumber?: string;
    direction: 'inbound' | 'outbound';
    messageType: 'text' | 'template' | 'image' | 'video' | 'audio' | 'document' | 'note';
    content: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    fileName?: string;
    mimeType?: string;
    templateId?: string;
    templateName?: string;
    templateVariables?: Record<string, string>;
    components?: unknown[];
    status?: 'scheduled' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    fbMessageId?: string;
    scheduledFor?: Date;
    isNote?: boolean;
    noteAuthorId?: string;
    noteAuthorName?: string;
    extra?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    sentAt?: Date;
    deliveredAt?: Date;
    readAt?: Date;
}

export interface UpdateMessageDto {
    status?: 'scheduled' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    fbMessageId?: string;
    whatsappMessageId?: string;
    failedReason?: string;
    errorMessage?: string;
    sentAt?: Date;
    deliveredAt?: Date;
    readAt?: Date;
    retryCount?: number;
    nextRetryAt?: Date;
}

export interface ComplianceWarning {
    code: string;
    message: string;
    context?: Record<string, unknown>;
    createdAt: Date;
}

export class WhatsAppMessageRepository {
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }

    async create(data: CreateMessageDto): Promise<IWhatsAppMessage> {
        await this.ensureConnection();
        const message = new WhatsAppMessage(data);
        return message.save();
    }

    /**
     * Find a message by id. Pass `organizationId` to scope the lookup so a
     * caller can never read another tenant's message by guessing its id.
     */
    async findById(id: string): Promise<IWhatsAppMessage | null> {
        await this.ensureConnection();
        const query: Record<string, unknown> = { _id: id };
        return WhatsAppMessage.findOne(query).exec();
    }

    /**
     * Generic find. Callers MUST include `organizationId` in the filter for any
     * tenant-scoped data — never forward an unsanitized client filter here.
     */
    async find(filter: Record<string, unknown>): Promise<IWhatsAppMessage[]> {
        await this.ensureConnection();
        return WhatsAppMessage.find(filter).sort({ createdAt: -1 }).exec();
    }

    async findByContact(
        contactId: string,
        limit: number = 50,
        skip: number = 0
    ): Promise<IWhatsAppMessage[]> {
        await this.ensureConnection();
        return WhatsAppMessage.find({
            contactId
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip)
            .exec();
    }

    async findByCampaign(
        campaignId: string,
        status?: string,
        limit: number = 100,
        skip: number = 0
    ): Promise<IWhatsAppMessage[]> {
        await this.ensureConnection();
        const query: Record<string, unknown> = { campaignId };
        if (status) query.status = status;

        return WhatsAppMessage.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip)
            .exec();
    }

    async findScheduledMessages(): Promise<IWhatsAppMessage[]> {
        await this.ensureConnection();
        return WhatsAppMessage.find({
            status: 'scheduled',
            scheduledFor: { $lte: new Date() },
        })
            .limit(100)
            .exec();
    }

    async findFailedForRetry(): Promise<IWhatsAppMessage[]> {
        await this.ensureConnection();
        return WhatsAppMessage.find({
            status: 'failed',
            retryCount: { $lt: mongoose.model('WhatsAppMessage').schema.path('maxRetries').options.default },
            $or: [
                { nextRetryAt: { $lte: new Date() } },
                { nextRetryAt: null },
            ],
        })
            .limit(50)
            .exec();
    }

    async update(id: string, data: UpdateMessageDto): Promise<IWhatsAppMessage | null> {
        await this.ensureConnection();
        const query: Record<string, unknown> = { _id: id };
        return WhatsAppMessage.findOneAndUpdate(query, { $set: data }, { new: true }).exec();
    }

    async updateByFbMessageId(fbMessageId: string, data: UpdateMessageDto): Promise<IWhatsAppMessage | null> {
        await this.ensureConnection();
        return WhatsAppMessage.findOneAndUpdate({ fbMessageId }, { $set: data }, { new: true }).exec();
    }

    async appendComplianceWarning(id: string, warning: ComplianceWarning): Promise<IWhatsAppMessage | null> {
        await this.ensureConnection();
        return WhatsAppMessage.findByIdAndUpdate(
            id,
            { $push: { 'extra.complianceWarnings': warning } },
            { new: true }
        ).exec();
    }

    async incrementRetryCount(id: string, nextRetryAt: Date): Promise<IWhatsAppMessage | null> {
        await this.ensureConnection();
        return WhatsAppMessage.findByIdAndUpdate(
            id,
            {
                $inc: { retryCount: 1 },
                $set: { nextRetryAt },
            },
            { new: true }
        ).exec();
    }

    async getCampaignStats(campaignId: string): Promise<{
        total: number;
        sent: number;
        delivered: number;
        read: number;
        failed: number;
    }> {
        await this.ensureConnection();
        const result = await WhatsAppMessage.aggregate([
            { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    sent: {
                        $sum: {
                            $cond: [{ $in: ['$status', ['sent', 'delivered', 'read']] }, 1, 0],
                        },
                    },
                    delivered: {
                        $sum: {
                            $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0],
                        },
                    },
                    read: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'read'] }, 1, 0],
                        },
                    },
                    failed: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'failed'] }, 1, 0],
                        },
                    },
                },
            },
        ]);

        return result[0] || { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    }

    async getContactLastMessage(contactId: string): Promise<IWhatsAppMessage | null> {
        await this.ensureConnection();
        return WhatsAppMessage.findOne({ contactId, isNote: false })
            .sort({ createdAt: -1 })
            .exec();
    }

    async getLastInboundMessage(contactId: string): Promise<IWhatsAppMessage | null> {
        await this.ensureConnection();
        return WhatsAppMessage.findOne({
            contactId,
            direction: 'inbound',
            isNote: false,
        })
            .sort({ createdAt: -1 })
            .exec();
    }

    async delete(id: string): Promise<boolean> {
        await this.ensureConnection();
        const query: Record<string, unknown> = { _id: id };
        const result = await WhatsAppMessage.deleteOne(query).exec();
        return result.deletedCount > 0;
    }
    async findPaginated(
        filter: Record<string, unknown> = {},
        options: {
            page: number;
            limit: number;
            sort?: Record<string, 1 | -1>;
            populate?: (string | { path: string; select?: string })[];
        }
    ): Promise<{
        data: IWhatsAppMessage[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            hasMore: boolean;
        };
    }> {
        await this.ensureConnection();
        const { page = 1, limit = 50, sort = { createdAt: -1 }, populate = [] } = options;
        const skip = (page - 1) * limit;

        const queryFn = WhatsAppMessage.find(filter).sort(sort).skip(skip).limit(limit);

        if (populate.length > 0) {
            populate.forEach((p) => {
                if (typeof p === 'string') {
                    queryFn.populate(p);
                } else {
                    queryFn.populate(p.path, p.select);
                }
            });
        }

        const [data, total] = await Promise.all([
            queryFn.exec(),
            WhatsAppMessage.countDocuments(filter).exec(),
        ]);

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page * limit < total,
            },
        };
    }
}

export const whatsappMessageRepository = new WhatsAppMessageRepository();

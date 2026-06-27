import SocialInteraction, {
    ISocialInteraction,
    SocialInteractionType,
    SocialInteractionStatus,
} from '../models/social-interaction.model';
import { connectDB } from '@/lib/mongodb';

export interface CreateSocialInteractionInput {
    brandId: string;
    accountId: string;
    platform: string;
    type: SocialInteractionType;
    externalId: string;
    conversationId?: string;
    parentExternalId?: string;
    authorHandle: string;
    authorDisplayName?: string;
    authorAvatarUrl?: string;
    authorPlatformId?: string;
    text?: string;
    mediaUrls?: string[];
    permalink?: string;
    contactId?: string;
    status?: SocialInteractionStatus;
    assignedToUserId?: string;
    occurredAt: Date;
    raw?: Record<string, unknown>;
}

export interface ListSocialInteractionsInput {
    brandId: string;
    status?: SocialInteractionStatus;
    platform?: string;
    limit?: number;
    skip?: number;
}

class SocialInteractionRepository {
    /**
     * Upsert by (accountId, externalId) to dedupe incoming interactions.
     */
    async create(input: CreateSocialInteractionInput): Promise<ISocialInteraction> {
        await connectDB();

        const { accountId, externalId, status, ...rest } = input;

        const doc = await SocialInteraction.findOneAndUpdate(
            { accountId, externalId },
            {
                $set: { ...rest, accountId, externalId },
                $setOnInsert: { status: status || 'unread' },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).exec();

        return doc as ISocialInteraction;
    }

    async findById(id: string): Promise<ISocialInteraction | null> {
        await connectDB();
        return SocialInteraction.findById(id).exec();
    }

    async listByBrand(input: ListSocialInteractionsInput): Promise<ISocialInteraction[]> {
        await connectDB();

        const { brandId, status, platform, limit = 50, skip = 0 } = input;

        const query: Record<string, unknown> = { brandId };
        if (status) {
            query.status = status;
        }
        if (platform) {
            query.platform = platform;
        }

        return SocialInteraction.find(query)
            .sort({ occurredAt: -1 })
            .skip(skip)
            .limit(limit)
            .exec();
    }

    async markRead(id: string): Promise<ISocialInteraction | null> {
        await connectDB();
        return SocialInteraction.findByIdAndUpdate(
            id,
            { $set: { status: 'read' } },
            { new: true }
        ).exec();
    }

    async markReplied(id: string): Promise<ISocialInteraction | null> {
        await connectDB();
        return SocialInteraction.findByIdAndUpdate(
            id,
            { $set: { repliedAt: new Date(), status: 'read' } },
            { new: true }
        ).exec();
    }

    async archive(id: string): Promise<ISocialInteraction | null> {
        await connectDB();
        return SocialInteraction.findByIdAndUpdate(
            id,
            { $set: { status: 'archived' } },
            { new: true }
        ).exec();
    }

    async countUnread(input: { brandId: string }): Promise<number> {
        await connectDB();
        return SocialInteraction.countDocuments({
            brandId: input.brandId,
            status: 'unread',
        }).exec();
    }
}

export const socialInteractionRepository = new SocialInteractionRepository();

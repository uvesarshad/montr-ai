import RssSource, { IRssSource } from '../models/rss-source.model';
import { connectDB } from '@/lib/mongodb';

export interface CreateRssSourceInput {
    brandId: string;
    userId: string;
    name: string;
    feedUrl: string;
    enabled?: boolean;
    targetAccountIds?: string[];
    targetPlatforms?: string[];
    generateImage?: boolean;
    autoApprove?: boolean;
    cadenceMinutes?: number;
}

export interface UpdateRssSourceInput {
    name?: string;
    feedUrl?: string;
    enabled?: boolean;
    targetAccountIds?: string[];
    targetPlatforms?: string[];
    generateImage?: boolean;
    autoApprove?: boolean;
    cadenceMinutes?: number;
}

class RssSourceRepository {
    async create(input: CreateRssSourceInput): Promise<IRssSource> {
        await connectDB();
        const source = new RssSource(input);
        return source.save();
    }

    async findById(id: string): Promise<IRssSource | null> {
        await connectDB();
        return RssSource.findById(id).exec();
    }

    async listByBrand(brandId: string): Promise<IRssSource[]> {
        await connectDB();
        return RssSource.find({ brandId })
            .sort({ createdAt: -1 })
            .exec();
    }

    async update(id: string, input: UpdateRssSourceInput): Promise<IRssSource | null> {
        await connectDB();
        return RssSource.findByIdAndUpdate(id, { $set: input }, { new: true }).exec();
    }

    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await RssSource.deleteOne({ _id: id }).exec();
        return result.deletedCount > 0;
    }

    /**
     * Find sources that are enabled and due for a fetch (lastFetchedAt older
     * than their cadence, or never fetched).
     */
    async listDue(limit: number = 100): Promise<IRssSource[]> {
        await connectDB();

        const now = new Date();

        // cadenceMinutes is per-document, so compare against a computed cutoff
        // using $expr: lastFetchedAt + cadenceMinutes*60000 <= now (or null).
        return RssSource.find({
            enabled: true,
            $or: [
                { lastFetchedAt: null },
                {
                    $expr: {
                        $lte: [
                            {
                                $add: [
                                    '$lastFetchedAt',
                                    { $multiply: ['$cadenceMinutes', 60000] },
                                ],
                            },
                            now,
                        ],
                    },
                },
            ],
        })
            .sort({ lastFetchedAt: 1 })
            .limit(limit)
            .exec();
    }

    async updateLastSeen(
        id: string,
        seen: { url?: string; guid?: string }
    ): Promise<IRssSource | null> {
        await connectDB();

        const set: Record<string, unknown> = {
            lastFetchedAt: new Date(),
            lastError: null,
        };
        if (seen.url !== undefined) {
            set.lastSeenUrl = seen.url;
        }
        if (seen.guid !== undefined) {
            set.lastSeenGuid = seen.guid;
        }

        return RssSource.findByIdAndUpdate(id, { $set: set }, { new: true }).exec();
    }

    async recordError(id: string, msg: string): Promise<IRssSource | null> {
        await connectDB();
        return RssSource.findByIdAndUpdate(
            id,
            { $set: { lastError: msg, lastFetchedAt: new Date() } },
            { new: true }
        ).exec();
    }
}

export const rssSourceRepository = new RssSourceRepository();

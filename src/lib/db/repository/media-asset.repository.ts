import mongoose from 'mongoose';
import MediaAsset, { IMediaAsset } from '../models/media-asset.model';
import MediaFolder from '../models/media-folder.model';

export interface CreateMediaAssetInput {
    brandId: string;
    userId: string;
    url: string;
    thumbnailUrl?: string;
    type: 'image' | 'video';
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    duration?: number;
    folderId?: string;
    tags?: string[];
    altText?: string;
    // Provenance for AI-generated assets (set by the generate endpoint).
    sourcePrompt?: string;
    sourceProvider?: string;
    aiStudioProjectId?: string;
    aiStudioSessionId?: string;
}

export interface UpdateMediaAssetInput {
    folderId?: string | null;
    tags?: string[];
    altText?: string;
}

export interface MediaAssetFilters {
    brandId: string;
    folderId?: string | null;
    type?: 'image' | 'video';
    tags?: string[];
    search?: string;
}

export class MediaAssetRepository {
    /**
     * Create a new media asset
     */
    async create(input: CreateMediaAssetInput): Promise<IMediaAsset> {
        await this.ensureConnection();

        const asset = new MediaAsset({
            ...input,
            tags: input.tags || [],
            usageCount: 0,
        });

        const saved = await asset.save();

        // Update folder asset count if in a folder
        if (input.folderId) {
            await MediaFolder.updateOne(
                { _id: input.folderId },
                { $inc: { assetCount: 1 } }
            );
        }

        return saved;
    }

    /**
     * Find asset by ID, scoped to a brand so callers can't read another
     * tenant's asset by guessing its id.
     */
    async findById(assetId: string, brandId: string): Promise<IMediaAsset | null> {
        await this.ensureConnection();
        return MediaAsset.findOne({ _id: assetId, brandId }).exec();
    }

    /**
     * Find assets with filters
     */
    async find(filters: MediaAssetFilters, limit: number = 50, offset: number = 0): Promise<IMediaAsset[]> {
        await this.ensureConnection();

        const query: Record<string, unknown> = { brandId: filters.brandId };

        // Handle folder - null means root, undefined means all
        if (filters.folderId === null) {
            query.folderId = null;
        } else if (filters.folderId) {
            query.folderId = filters.folderId;
        }

        if (filters.type) {
            query.type = filters.type;
        }

        if (filters.tags && filters.tags.length > 0) {
            query.tags = { $in: filters.tags };
        }

        if (filters.search) {
            query.$text = { $search: filters.search };
        }

        return MediaAsset.find(query)
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .exec();
    }

    /**
     * Find all assets by brand
     */
    async findByBrand(brandId: string, limit: number = 100): Promise<IMediaAsset[]> {
        await this.ensureConnection();
        return MediaAsset.find({ brandId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Find assets in a specific folder
     */
    async findByFolder(brandId: string, folderId: string | null, limit: number = 50): Promise<IMediaAsset[]> {
        await this.ensureConnection();
        return MediaAsset.find({ brandId, folderId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Search assets by text
     */
    async search(brandId: string, searchText: string, limit: number = 50): Promise<IMediaAsset[]> {
        await this.ensureConnection();
        return MediaAsset.find({
            brandId,
            $or: [
                { originalName: { $regex: searchText, $options: 'i' } },
                { tags: { $regex: searchText, $options: 'i' } },
                { altText: { $regex: searchText, $options: 'i' } },
            ],
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Update asset metadata. Scoped to a brand to prevent cross-tenant edits.
     */
    async update(assetId: string, brandId: string, data: UpdateMediaAssetInput): Promise<IMediaAsset | null> {
        await this.ensureConnection();

        // Get current asset for folder update
        const current = await MediaAsset.findOne({ _id: assetId, brandId });
        if (!current) return null;

        const updateData: Record<string, unknown> = {};
        if (data.tags !== undefined) updateData.tags = data.tags;
        if (data.altText !== undefined) updateData.altText = data.altText;
        if (data.folderId !== undefined) updateData.folderId = data.folderId;

        const updated = await MediaAsset.findOneAndUpdate(
            { _id: assetId, brandId },
            { $set: updateData },
            { new: true }
        ).exec();

        // Update folder counts if folder changed
        if (data.folderId !== undefined && current.folderId !== data.folderId) {
            if (current.folderId) {
                await MediaFolder.updateOne(
                    { _id: current.folderId },
                    { $inc: { assetCount: -1 } }
                );
            }
            if (data.folderId) {
                await MediaFolder.updateOne(
                    { _id: data.folderId },
                    { $inc: { assetCount: 1 } }
                );
            }
        }

        return updated;
    }

    /**
     * Increment usage count (brand-scoped).
     */
    async incrementUsage(assetId: string, brandId: string): Promise<void> {
        await this.ensureConnection();
        await MediaAsset.updateOne(
            { _id: assetId, brandId },
            { $inc: { usageCount: 1 } }
        );
    }

    /**
     * Delete asset. Scoped to a brand to prevent cross-tenant deletes.
     */
    async delete(assetId: string, brandId: string): Promise<boolean> {
        await this.ensureConnection();

        const asset = await MediaAsset.findOne({ _id: assetId, brandId });
        if (!asset) return false;

        // Update folder count
        if (asset.folderId) {
            await MediaFolder.updateOne(
                { _id: asset.folderId },
                { $inc: { assetCount: -1 } }
            );
        }

        const result = await MediaAsset.deleteOne({ _id: assetId, brandId });
        return result.deletedCount > 0;
    }

    /**
     * Bulk delete assets, scoped to a brand.
     */
    async bulkDelete(assetIds: string[], brandId: string): Promise<number> {
        await this.ensureConnection();
        const result = await MediaAsset.deleteMany({ _id: { $in: assetIds }, brandId });
        return result.deletedCount;
    }

    /**
     * Get media stats for brand
     */
    async getStats(brandId: string): Promise<{
        totalAssets: number;
        totalSize: number;
        imageCount: number;
        videoCount: number;
    }> {
        await this.ensureConnection();

        const stats = await MediaAsset.aggregate([
            { $match: { brandId } },
            {
                $group: {
                    _id: null,
                    totalAssets: { $sum: 1 },
                    totalSize: { $sum: '$size' },
                    imageCount: { $sum: { $cond: [{ $eq: ['$type', 'image'] }, 1, 0] } },
                    videoCount: { $sum: { $cond: [{ $eq: ['$type', 'video'] }, 1, 0] } },
                },
            },
        ]);

        return stats[0] || { totalAssets: 0, totalSize: 0, imageCount: 0, videoCount: 0 };
    }

    /**
     * Ensure MongoDB connection
     */
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

// Export singleton instance
export const mediaAssetRepository = new MediaAssetRepository();

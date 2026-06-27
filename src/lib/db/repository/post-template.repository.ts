import mongoose from 'mongoose';
import PostTemplate, { IPostTemplate } from '../models/post-template.model';

export interface CreateTemplateInput {
    brandId: string;
    userId: string;
    name: string;
    description?: string;
    content: string;
    media?: { url: string; type: 'image' | 'video'; altText?: string }[];
    platforms?: string[];
    category?: string;
    tags?: string[];
    isPublic?: boolean;
}

export class PostTemplateRepository {
    /**
     * Create a new template
     */
    async create(input: CreateTemplateInput): Promise<IPostTemplate> {
        await this.ensureConnection();
        const template = new PostTemplate({
            ...input,
            media: input.media || [],
            platforms: input.platforms || [],
            tags: input.tags || [],
            usageCount: 0,
        });
        return template.save();
    }

    /**
     * Find template by ID
     */
    async findById(templateId: string): Promise<IPostTemplate | null> {
        await this.ensureConnection();
        return PostTemplate.findOne({ _id: templateId, deletedAt: null }).exec();
    }

    /**
     * Find templates by brand
     */
    async findByBrand(brandId: string, category?: string): Promise<IPostTemplate[]> {
        await this.ensureConnection();
        const query: Record<string, unknown> = { brandId, deletedAt: null };
        if (category) query.category = category;
        return PostTemplate.find(query).sort({ usageCount: -1, updatedAt: -1 }).exec();
    }

    /**
     * Search templates
     */
    async search(brandId: string, searchText: string): Promise<IPostTemplate[]> {
        await this.ensureConnection();
        return PostTemplate.find({
            brandId,
            deletedAt: null,
            $or: [
                { name: { $regex: searchText, $options: 'i' } },
                { tags: { $regex: searchText, $options: 'i' } },
            ],
        }).sort({ usageCount: -1 }).limit(20).exec();
    }

    /**
     * Update template
     */
    async update(
        templateId: string,
        data: Partial<CreateTemplateInput>
    ): Promise<IPostTemplate | null> {
        await this.ensureConnection();
        return PostTemplate.findByIdAndUpdate(
            templateId,
            { $set: data },
            { new: true }
        ).exec();
    }

    /**
     * Increment usage count
     */
    async incrementUsage(templateId: string): Promise<void> {
        await this.ensureConnection();
        await PostTemplate.updateOne(
            { _id: templateId },
            { $inc: { usageCount: 1 } }
        );
    }

    /**
     * Soft-delete template (sets deletedAt; row retained for audit/recovery).
     */
    async delete(templateId: string): Promise<boolean> {
        await this.ensureConnection();
        const result = await PostTemplate.updateOne(
            { _id: templateId, deletedAt: null },
            { $set: { deletedAt: new Date() } }
        );
        return result.modifiedCount > 0;
    }

    /**
     * Hard-delete template (permanent). Retained for any caller that truly needs
     * physical removal.
     */
    async hardDelete(templateId: string): Promise<boolean> {
        await this.ensureConnection();
        const result = await PostTemplate.deleteOne({ _id: templateId });
        return result.deletedCount > 0;
    }

    /**
     * Get categories for brand
     */
    async getCategories(brandId: string): Promise<string[]> {
        await this.ensureConnection();
        const categories = await PostTemplate.distinct('category', {
            brandId,
            deletedAt: null,
            category: { $ne: null },
        });
        return categories.filter(Boolean);
    }

    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

export const postTemplateRepository = new PostTemplateRepository();

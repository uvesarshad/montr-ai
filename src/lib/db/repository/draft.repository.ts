import { connectDB } from '@/lib/mongodb';
import PostDraft, { IPostDraft, IDraftMedia, IDraftPlatformConfig } from '../models/draft.model';
import { contentRevisionRepository } from './content-revision.repository';
import type { RevisionChangeType } from '../models/content-revision.model';

/**
 * Derive the most-significant changeType for a draft edit by diffing the
 * existing snapshot against the new one (Epic 8). Content edits win over media
 * edits, which win over platform edits — falls back to 'content_edit'.
 */
function deriveDraftChangeType(prev: IPostDraft, next: IPostDraft): RevisionChangeType {
    if ((prev.content ?? '') !== (next.content ?? '')) return 'content_edit';

    const prevMedia = (prev.media ?? []).map((m) => m.url).join('|');
    const nextMedia = (next.media ?? []).map((m) => m.url).join('|');
    if (prevMedia !== nextMedia) return 'media_edit';

    const prevPlatforms = (prev.platforms ?? []).map((p) => p.accountId).sort().join('|');
    const nextPlatforms = (next.platforms ?? []).map((p) => p.accountId).sort().join('|');
    if (prevPlatforms !== nextPlatforms) return 'platform_edit';

    return 'content_edit';
}

export interface CreateDraftInput {
    brandId: string;
    userId: string;
    title?: string;
    content: string;
    media?: IDraftMedia[];
    platforms?: IDraftPlatformConfig[];
    scheduleCount?: number;
}

export interface UpdateDraftInput {
    title?: string;
    content?: string;
    media?: IDraftMedia[];
    platforms?: IDraftPlatformConfig[];
}

class DraftRepository {
    /**
     * Create a new draft
     */
    async create(input: CreateDraftInput): Promise<IPostDraft> {
        await connectDB();

        // Generate title from content if not provided
        const title = input.title || this.generateTitle(input.content);

        const draft = new PostDraft({
            ...input,
            title,
            media: input.media || [],
            platforms: input.platforms || [],
            scheduleCount: input.scheduleCount ?? 0,
            lastEditedAt: new Date(),
        });

        return draft.save();
    }

    /**
     * Generate a title from content
     */
    private generateTitle(content: string): string {
        if (!content || content.trim() === '') {
            return 'Untitled Draft';
        }
        // Get first line, max 50 chars
        const firstLine = content.split('\n')[0].trim();
        if (firstLine.length <= 50) {
            return firstLine || 'Untitled Draft';
        }
        return firstLine.slice(0, 47) + '...';
    }

    /**
     * Find draft by ID
     */
    async findById(id: string): Promise<IPostDraft | null> {
        await connectDB();
        return PostDraft.findOne({ _id: id, deletedAt: null }).exec();
    }

    /**
     * Find all drafts for a user
     */
    async findByUser(userId: string, limit: number = 50): Promise<IPostDraft[]> {
        await connectDB();
        return PostDraft.find({ userId, deletedAt: null })
            .sort({ lastEditedAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Find drafts for a brand
     */
    async findByBrand(brandId: string, limit: number = 50): Promise<IPostDraft[]> {
        await connectDB();
        return PostDraft.find({ brandId, deletedAt: null })
            .sort({ lastEditedAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Update a draft
     */
    async update(id: string, userId: string, input: UpdateDraftInput): Promise<IPostDraft | null> {
        await connectDB();

        // Epic 8: load the pre-edit snapshot so we can diff for changeType.
        const previous = await PostDraft.findOne({ _id: id, userId, deletedAt: null }).exec();

        const updateData: Record<string, unknown> = {
            lastEditedAt: new Date(),
        };

        if (input.content !== undefined) {
            updateData.content = input.content;
            // Auto-update title if not explicitly provided
            if (!input.title) {
                updateData.title = this.generateTitle(input.content);
            }
        }
        if (input.title !== undefined) updateData.title = input.title;
        if (input.media !== undefined) updateData.media = input.media;
        if (input.platforms !== undefined) updateData.platforms = input.platforms;

        const updated = await PostDraft.findOneAndUpdate(
            { _id: id, userId, deletedAt: null },
            { $set: updateData },
            { new: true }
        ).exec();

        // Epic 8: capture a revision snapshot of the NEW state. Always-on but
        // best-effort — any failure here must NEVER fail the edit itself.
        if (updated) {
            try {
                const changeType = previous
                    ? deriveDraftChangeType(previous, updated)
                    : 'content_edit';
                await contentRevisionRepository.record({
                    subjectType: 'draft',
                    subjectId: updated._id.toString(),
                    brandId: updated.brandId,
                    content: updated.content,
                    mediaUrls: updated.media.map((m) => m.url),
                    platformsSummary: updated.platforms.map((p) => p.platform),
                    title: updated.title,
                    editedBy: userId,
                    changeType,
                });
            } catch (err) {
                console.error('[content-revision] draft revision capture failed (non-fatal):', err);
            }
        }

        return updated;
    }

    /**
     * Increment how many times a draft has been scheduled
     */
    async incrementScheduleCount(id: string, userId: string): Promise<IPostDraft | null> {
        await connectDB();

        return PostDraft.findOneAndUpdate(
            { _id: id, userId, deletedAt: null },
            {
                $inc: { scheduleCount: 1 },
                $set: { lastEditedAt: new Date() },
            },
            { new: true }
        ).exec();
    }

    /**
     * Soft-delete a draft (sets deletedAt; row is retained for audit/recovery).
     */
    async delete(id: string, userId: string): Promise<boolean> {
        await connectDB();
        const result = await PostDraft.updateOne(
            { _id: id, userId, deletedAt: null },
            { $set: { deletedAt: new Date() } }
        ).exec();
        return result.modifiedCount > 0;
    }

    /**
     * Hard-delete a draft (permanent). Retained for any caller that truly needs
     * physical removal.
     */
    async hardDelete(id: string, userId: string): Promise<boolean> {
        await connectDB();
        const result = await PostDraft.deleteOne({ _id: id, userId }).exec();
        return result.deletedCount > 0;
    }

    /**
     * Count drafts for a user
     */
    async countByUser(userId: string): Promise<number> {
        await connectDB();
        return PostDraft.countDocuments({ userId, deletedAt: null }).exec();
    }

    /**
     * Soft-delete all drafts for a brand. Returns the number affected.
     */
    async deleteByBrand(brandId: string): Promise<number> {
        await connectDB();
        const result = await PostDraft.updateMany(
            { brandId, deletedAt: null },
            { $set: { deletedAt: new Date() } }
        ).exec();
        return result.modifiedCount || 0;
    }
}

export const draftRepository = new DraftRepository();

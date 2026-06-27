import ScheduledPost, {
    IScheduledPost,
    ScheduledPostStatus,
    IPlatformConfig,
    IPublishResult
} from '../models/scheduled-post.model';
import { PostAnalytics, MetricPlatform } from '../models/analytics.model';
import { connectDB } from '@/lib/mongodb';
import { contentRevisionRepository } from './content-revision.repository';
import type { RevisionChangeType } from '../models/content-revision.model';

/**
 * Derive the most-significant changeType for a scheduled-post edit by diffing
 * the pre-edit snapshot against the post-edit one (Epic 8). Mirrors
 * `deriveDraftChangeType` in draft.repository.ts: a reschedule (scheduledFor
 * changed) is reported as 'schedule_edit'; otherwise content edits win over
 * media edits, which win over platform edits — falls back to 'content_edit'.
 */
function deriveScheduledPostChangeType(
    prev: IScheduledPost,
    next: IScheduledPost,
): RevisionChangeType {
    if ((prev.scheduledFor?.getTime() ?? 0) !== (next.scheduledFor?.getTime() ?? 0)) {
        return 'schedule_edit';
    }

    if ((prev.content ?? '') !== (next.content ?? '')) return 'content_edit';

    const prevMedia = (prev.mediaUrls ?? []).join('|');
    const nextMedia = (next.mediaUrls ?? []).join('|');
    if (prevMedia !== nextMedia) return 'media_edit';

    const prevPlatforms = (prev.platforms ?? []).map((p) => p.accountId).sort().join('|');
    const nextPlatforms = (next.platforms ?? []).map((p) => p.accountId).sort().join('|');
    if (prevPlatforms !== nextPlatforms) return 'platform_edit';

    return 'content_edit';
}

export interface CreateScheduledPostInput {
    brandId: string;
    userId: string;
    status?: ScheduledPostStatus;
    sourceDraftId?: string;
    content: string;
    mediaUrls?: string[];
    mediaTypes?: ('image' | 'video')[];
    altText?: string;
    postFormat?: 'standard' | 'reel';
    platforms: IPlatformConfig[];
    scheduledFor: Date;
    timezone: string;
    recurrence?: {
        frequency: 'daily' | 'weekly' | 'monthly';
        interval?: number;
        endDate?: Date;
        daysOfWeek?: number[];
        dayOfMonth?: number;
    };
}

export interface UpdateScheduledPostInput {
    content?: string;
    mediaUrls?: string[];
    mediaTypes?: ('image' | 'video')[];
    altText?: string;
    postFormat?: 'standard' | 'reel';
    platforms?: IPlatformConfig[];
    scheduledFor?: Date;
    timezone?: string;
    status?: ScheduledPostStatus;
}

export interface ScheduledPostFilters {
    brandId?: string;
    userId?: string;
    status?: ScheduledPostStatus | ScheduledPostStatus[];
    fromDate?: Date;
    toDate?: Date;
}

// Pure publish-result merge/skip helpers (audit §D) live in a DB-free module
// so they are unit-testable in isolation; re-exported here for the worker.
export {
    publishTargetKey,
    isSystemResult,
    successfulTargetKeys,
    mergePublishResults,
} from '@/lib/social/publish-merge';

class ScheduledPostRepository {
    /**
     * Create a new scheduled post
     */
    async create(input: CreateScheduledPostInput): Promise<IScheduledPost> {
        await connectDB();

        const scheduledPost = new ScheduledPost({
            ...input,
            mediaUrls: input.mediaUrls || [],
            mediaTypes: input.mediaTypes || [],
            postFormat: input.postFormat || 'standard',
            status: input.status || 'scheduled',
            attemptCount: 0,
        });

        return scheduledPost.save();
    }

    /**
     * Find a scheduled post by ID
     */
    async findById(id: string): Promise<IScheduledPost | null> {
        await connectDB();
        return ScheduledPost.findById(id).exec();
    }

    /**
     * Find multiple scheduled posts by their IDs (single $in query).
     * Used by the approvals queue to enrich each approval with its post.
     */
    async findByIds(ids: string[]): Promise<IScheduledPost[]> {
        await connectDB();

        if (ids.length === 0) {
            return [];
        }

        return ScheduledPost.find({ _id: { $in: ids } }).exec();
    }

    /**
     * Find all scheduled posts for a brand
     */
    async findByBrand(brandId: string, filters?: Partial<ScheduledPostFilters>): Promise<IScheduledPost[]> {
        await connectDB();

        const query: Record<string, unknown> = { brandId };

        if (filters?.status) {
            query.status = Array.isArray(filters.status)
                ? { $in: filters.status }
                : filters.status;
        }

        if (filters?.fromDate || filters?.toDate) {
            query.scheduledFor = {};
            if (filters.fromDate) {
                (query.scheduledFor as Record<string, Date>).$gte = filters.fromDate;
            }
            if (filters.toDate) {
                (query.scheduledFor as Record<string, Date>).$lte = filters.toDate;
            }
        }

        return ScheduledPost.find(query)
            .sort({ scheduledFor: 1 })
            .exec();
    }

    /**
     * Find all scheduled posts for a user
     */
    async findByUser(userId: string, filters?: Partial<ScheduledPostFilters>): Promise<IScheduledPost[]> {
        await connectDB();

        const query: Record<string, unknown> = { userId };

        if (filters?.brandId) {
            query.brandId = filters.brandId;
        }

        if (filters?.status) {
            query.status = Array.isArray(filters.status)
                ? { $in: filters.status }
                : filters.status;
        }

        if (filters?.fromDate || filters?.toDate) {
            query.scheduledFor = {};
            if (filters.fromDate) {
                (query.scheduledFor as Record<string, Date>).$gte = filters.fromDate;
            }
            if (filters.toDate) {
                (query.scheduledFor as Record<string, Date>).$lte = filters.toDate;
            }
        }

        return ScheduledPost.find(query)
            .sort({ scheduledFor: 1 })
            .exec();
    }

    /**
     * Find active scheduled posts linked to draft IDs
     */
    async findActiveBySourceDraftIds(draftIds: string[], userId?: string): Promise<IScheduledPost[]> {
        await connectDB();

        if (draftIds.length === 0) {
            return [];
        }

        const query: Record<string, unknown> = {
            sourceDraftId: { $in: draftIds },
            status: { $in: ['scheduled', 'publishing'] },
        };

        if (userId) {
            query.userId = userId;
        }

        return ScheduledPost.find(query)
            .sort({ scheduledFor: 1 })
            .exec();
    }

    /**
     * Find posts that are due for publishing
     * Posts are due if:
     * - status is 'scheduled'
     * - scheduledFor is <= current time
     */
    async findDueForPublishing(limit: number = 100): Promise<IScheduledPost[]> {
        await connectDB();

        const now = new Date();

        return ScheduledPost.find({
            status: 'scheduled',
            scheduledFor: { $lte: now },
        })
            .sort({ scheduledFor: 1 })
            .limit(limit)
            .exec();
    }

    /**
     * Find posts stuck in 'publishing' — the worker died between
     * markAsPublishing and markAsPublished. `lastAttemptAt` is set by
     * markAsPublishing, so anything still 'publishing' past the cutoff is
     * orphaned (a healthy publish completes in seconds).
     */
    async findStuckPublishing(olderThan: Date, limit: number = 100): Promise<IScheduledPost[]> {
        await connectDB();

        return ScheduledPost.find({
            status: 'publishing',
            lastAttemptAt: { $lte: olderThan },
        })
            .sort({ lastAttemptAt: 1 })
            .limit(limit)
            .exec();
    }

    /**
     * Atomically fail-out a stuck 'publishing' post. The status + cutoff in
     * the filter make this a compare-and-set: if a live worker finished the
     * publish (or another sweeper instance claimed it) in the meantime, this
     * is a no-op and returns false.
     */
    async failOutStuckPublishing(id: string, olderThan: Date, error: string): Promise<boolean> {
        await connectDB();

        const res = await ScheduledPost.updateOne(
            { _id: id, status: 'publishing', lastAttemptAt: { $lte: olderThan } },
            {
                $set: { status: 'failed' },
                $push: {
                    publishResults: {
                        platform: 'system',
                        accountId: 'system',
                        success: false,
                        error,
                        publishedAt: new Date(),
                    },
                },
            }
        ).exec();

        return res.modifiedCount > 0;
    }

    /**
     * Find failed posts that can be retried
     * Retry criteria:
     * - status is 'failed'
     * - attemptCount < maxAttempts
     */
    async findRetryable(maxAttempts: number = 3, limit: number = 50): Promise<IScheduledPost[]> {
        await connectDB();

        return ScheduledPost.find({
            status: 'failed',
            attemptCount: { $lt: maxAttempts },
        })
            .sort({ lastAttemptAt: 1 })
            .limit(limit)
            .exec();
    }

    /**
     * Update a scheduled post
     */
    async update(id: string, input: UpdateScheduledPostInput): Promise<IScheduledPost | null> {
        await connectDB();

        // Only allow updates to posts that are still scheduled.
        // Epic 8: `post` doubles as the pre-edit snapshot for the revision diff.
        const post = await ScheduledPost.findById(id);
        if (!post || post.status !== 'scheduled') {
            return null;
        }

        const updated = await ScheduledPost.findByIdAndUpdate(
            id,
            { $set: input },
            { new: true }
        ).exec();

        // Epic 8: capture an immutable revision snapshot of the NEW state.
        // Always-on but strictly best-effort — any failure here must NEVER fail
        // the edit itself. `editedBy` is the post's own userId (the update()
        // signature is fixed; another caller depends on it), and a reschedule
        // is reported as 'schedule_edit'.
        if (updated) {
            try {
                const changeType = deriveScheduledPostChangeType(post, updated);
                await contentRevisionRepository.record({
                    subjectType: 'scheduled_post',
                    subjectId: updated._id.toString(),
                    brandId: updated.brandId,
                    content: updated.content,
                    mediaUrls: updated.mediaUrls,
                    platformsSummary: updated.platforms.map((p) => p.platform),
                    editedBy: updated.userId,
                    changeType,
                });
            } catch (err) {
                console.error(
                    '[content-revision] scheduled-post revision capture failed (non-fatal):',
                    err,
                );
            }
        }

        return updated;
    }

    /**
     * Cancel a scheduled post
     */
    async cancel(id: string): Promise<IScheduledPost | null> {
        await connectDB();

        return ScheduledPost.findOneAndUpdate(
            { _id: id, status: 'scheduled' },
            { $set: { status: 'cancelled' } },
            { new: true }
        ).exec();
    }

    /**
     * Set post status without changing other fields
     */
    async setStatus(id: string, status: ScheduledPostStatus): Promise<IScheduledPost | null> {
        await connectDB();

        return ScheduledPost.findByIdAndUpdate(
            id,
            { $set: { status } },
            { new: true }
        ).exec();
    }

    /**
     * Mark post as publishing (in progress)
     */
    async markAsPublishing(id: string): Promise<IScheduledPost | null> {
        await connectDB();

        return ScheduledPost.findByIdAndUpdate(
            id,
            {
                $set: {
                    status: 'publishing',
                    lastAttemptAt: new Date(),
                },
                $inc: { attemptCount: 1 },
            },
            { new: true }
        ).exec();
    }

    /**
     * Mark post as published with results
     */
    async markAsPublished(
        id: string,
        results: IPublishResult[]
    ): Promise<IScheduledPost | null> {
        await connectDB();

        // Check if all platforms succeeded
        const anySuccess = results.some(r => r.success);

        // If at least one succeeded, mark as published; otherwise failed
        const status: ScheduledPostStatus = anySuccess ? 'published' : 'failed';

        const updatedPost = await ScheduledPost.findByIdAndUpdate(
            id,
            {
                $set: {
                    status,
                    publishResults: results,
                },
            },
            { new: true }
        ).exec();

        // Create analytics records for successful publications
        if (updatedPost && anySuccess) {
            try {
                const successfulResults = results.filter(r => r.success);

                await Promise.all(successfulResults.map((res) =>
                    // Only create if we have a postId or it's a platform we want to track
                    // Note: MetricPlatform type check is implicitly handled by the model's enum validation
                    PostAnalytics.findOneAndUpdate(
                        {
                            platform: res.platform as MetricPlatform,
                            externalPostId: res.postId || `internal_${id}_${res.platform}`
                        },
                        {
                            $set: {
                                scheduledPostId: id,
                                brandId: updatedPost.brandId,
                                userId: updatedPost.userId,
                                platformAccountId: res.accountId,
                                postUrl: res.postUrl,
                                publishedAt: res.publishedAt || new Date(),
                                contentPreview: updatedPost.content.slice(0, 200),
                                hasMedia: updatedPost.mediaUrls.length > 0,
                                lastFetchedAt: new Date(),
                            },
                            $setOnInsert: {
                                metrics: { likes: 0, comments: 0, shares: 0 },
                                historicalMetrics: [],
                                fetchCount: 0
                            }
                        },
                        { upsert: true, new: true }
                    )
                ));
            } catch (analyticsError) {
                console.error('Failed to create analytics records:', analyticsError);
                // We don't want to fail the whole process if analytics creation fails
            }
        }

        return updatedPost;
    }

    /**
     * Mark post as failed
     */
    async markAsFailed(id: string, error?: string): Promise<IScheduledPost | null> {
        await connectDB();

        const update: Record<string, unknown> = {
            $set: {
                status: 'failed',
                lastAttemptAt: new Date(),
            },
        };

        if (error) {
            update.$push = {
                publishResults: {
                    platform: 'system',
                    accountId: 'system',
                    success: false,
                    error,
                    publishedAt: new Date(),
                },
            };
        }

        return ScheduledPost.findByIdAndUpdate(id, update, { new: true }).exec();
    }

    /**
     * Get calendar view data for a date range
     */
    async getCalendarView(
        brandId: string,
        startDate: Date,
        endDate: Date
    ): Promise<IScheduledPost[]> {
        await connectDB();

        return ScheduledPost.find({
            brandId,
            scheduledFor: {
                $gte: startDate,
                $lte: endDate,
            },
            status: { $in: ['scheduled', 'published', 'failed'] },
        })
            .sort({ scheduledFor: 1 })
            .exec();
    }

    /**
     * Delete a scheduled post (only if cancelled or not yet published)
     */
    async delete(id: string): Promise<boolean> {
        await connectDB();

        const result = await ScheduledPost.deleteOne({
            _id: id,
            status: { $in: ['scheduled', 'cancelled'] },
        }).exec();

        return result.deletedCount > 0;
    }

    /**
     * Count posts by status for a brand
     */
    async countByStatus(brandId: string): Promise<Record<ScheduledPostStatus, number>> {
        await connectDB();

        const counts = await ScheduledPost.aggregate([
            { $match: { brandId } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]).exec();

        const result: Record<ScheduledPostStatus, number> = {
            pending_approval: 0,
            scheduled: 0,
            publishing: 0,
            published: 0,
            failed: 0,
            cancelled: 0,
        };

        for (const item of counts) {
            result[item._id as ScheduledPostStatus] = item.count;
        }

        return result;
    }
}

export const scheduledPostRepository = new ScheduledPostRepository();

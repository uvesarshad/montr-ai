import mongoose from 'mongoose';
import PostApproval, { IPostApproval } from '../models/post-approval.model';

export interface CreateApprovalInput {
    postId: string;
    postType: 'draft' | 'scheduled';
    brandId: string;
    submittedBy: string;
}

export interface ApprovalFilters {
    brandId?: string;
    submittedBy?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export class PostApprovalRepository {
    /**
     * Submit a post for approval
     */
    async create(input: CreateApprovalInput): Promise<IPostApproval> {
        await this.ensureConnection();

        // Check if there's already a pending approval for this post
        const existing = await PostApproval.findOne({
            postId: input.postId,
            postType: input.postType,
            status: 'pending',
        });

        if (existing) {
            throw new Error('This post already has a pending approval request');
        }

        const approval = new PostApproval({
            ...input,
            status: 'pending',
        });

        return approval.save();
    }

    /**
     * Find approval by ID
     */
    async findById(approvalId: string): Promise<IPostApproval | null> {
        await this.ensureConnection();
        return PostApproval.findById(approvalId).exec();
    }

    /**
     * Find approval by post
     */
    async findByPost(postId: string, postType: 'draft' | 'scheduled'): Promise<IPostApproval | null> {
        await this.ensureConnection();
        return PostApproval.findOne({ postId, postType })
            .sort({ createdAt: -1 })
            .exec();
    }

    /**
     * Find pending approval for a post
     */
    async findPendingForPost(postId: string, postType: 'draft' | 'scheduled'): Promise<IPostApproval | null> {
        await this.ensureConnection();
        return PostApproval.findOne({
            postId,
            postType,
            status: 'pending',
        }).exec();
    }

    /**
     * Find approvals with filters
     */
    async find(filters: ApprovalFilters, limit: number = 50): Promise<IPostApproval[]> {
        await this.ensureConnection();

        const query: Record<string, unknown> = {};
        if (filters.brandId) query.brandId = filters.brandId;
        if (filters.submittedBy) query.submittedBy = filters.submittedBy;
        if (filters.status) query.status = filters.status;

        return PostApproval.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Get pending approvals for organization (admin view)
     */
    async findPendingByOrganization(): Promise<IPostApproval[]> {
        await this.ensureConnection();
        return PostApproval.find({
            status: 'pending',
        })
            .sort({ createdAt: -1 })
            .exec();
    }

    /**
     * Approve a post
     */
    async approve(approvalId: string, reviewedBy: string, reviewNote?: string): Promise<IPostApproval | null> {
        await this.ensureConnection();

        return PostApproval.findByIdAndUpdate(
            approvalId,
            {
                $set: {
                    status: 'approved',
                    reviewedBy,
                    reviewedAt: new Date(),
                    reviewNote: reviewNote || null,
                },
            },
            { new: true }
        ).exec();
    }

    /**
     * Reject a post
     */
    async reject(approvalId: string, reviewedBy: string, reviewNote: string): Promise<IPostApproval | null> {
        await this.ensureConnection();

        return PostApproval.findByIdAndUpdate(
            approvalId,
            {
                $set: {
                    status: 'rejected',
                    reviewedBy,
                    reviewedAt: new Date(),
                    reviewNote,
                },
            },
            { new: true }
        ).exec();
    }

    /**
     * Cancel a submission (by submitter)
     */
    async cancel(approvalId: string, userId: string): Promise<IPostApproval | null> {
        await this.ensureConnection();

        // Only allow cancellation by the submitter and only if pending
        const approval = await PostApproval.findOne({
            _id: approvalId,
            submittedBy: userId,
            status: 'pending',
        });

        if (!approval) {
            return null;
        }

        return PostApproval.findByIdAndUpdate(
            approvalId,
            {
                $set: {
                    status: 'cancelled',
                },
            },
            { new: true }
        ).exec();
    }

    /**
     * Append a review comment to an approval thread.
     */
    async addComment(
        approvalId: string,
        comment: { userId: string; userName?: string; text: string },
    ): Promise<IPostApproval | null> {
        await this.ensureConnection();

        return PostApproval.findByIdAndUpdate(
            approvalId,
            {
                $push: {
                    comments: {
                        userId: comment.userId,
                        userName: comment.userName,
                        text: comment.text,
                        createdAt: new Date(),
                    },
                },
            },
            { new: true }
        ).exec();
    }

    /**
     * Get approval stats for organization dashboard
     */
    async getStats(): Promise<{
        pending: number;
        approved: number;
        rejected: number;
    }> {
        await this.ensureConnection();

        const stats = await PostApproval.aggregate([
            { $match: { } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const result = {
            pending: 0,
            approved: 0,
            rejected: 0,
        };

        stats.forEach((stat: { _id: string; count: number }) => {
            if (stat._id === 'pending') result.pending = stat.count;
            if (stat._id === 'approved') result.approved = stat.count;
            if (stat._id === 'rejected') result.rejected = stat.count;
        });

        return result;
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
export const postApprovalRepository = new PostApprovalRepository();

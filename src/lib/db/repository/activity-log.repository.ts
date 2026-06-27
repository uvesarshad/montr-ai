import mongoose from 'mongoose';
import ActivityLog, { IActivityLog, ActivityAction } from '../models/activity-log.model';

export interface LogActivityInput {
    brandId?: string;
    userId: string;
    userName: string;
    action: ActivityAction;
    targetType: 'draft' | 'scheduled_post' | 'approval' | 'brand' | 'account' | 'member';
    targetId: string;
    targetName?: string;
    metadata?: Record<string, unknown>;
}

export interface ActivityFilters {
    brandId?: string;
    userId?: string;
    action?: ActivityAction;
    targetType?: string;
}

export class ActivityLogRepository {
    /**
     * Log an activity
     */
    async log(input: LogActivityInput): Promise<IActivityLog> {
        await this.ensureConnection();

        const activity = new ActivityLog(input);
        return activity.save();
    }

    /**
     * Find activities with filters
     */
    async find(filters: ActivityFilters, limit: number = 50, offset: number = 0): Promise<IActivityLog[]> {
        await this.ensureConnection();

        const query: Record<string, unknown> = {};
        if (filters.brandId) query.brandId = filters.brandId;
        if (filters.userId) query.userId = filters.userId;
        if (filters.action) query.action = filters.action;
        if (filters.targetType) query.targetType = filters.targetType;

        return ActivityLog.find(query)
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .exec();
    }

    /**
     * Get organization activity feed
     */
    async findByOrganization(limit: number = 50): Promise<IActivityLog[]> {
        await this.ensureConnection();

        return ActivityLog.find({ })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Get brand-specific activity
     */
    async findByBrand(brandId: string, limit: number = 50): Promise<IActivityLog[]> {
        await this.ensureConnection();

        return ActivityLog.find({ brandId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Get user's activity
     */
    async findByUser(userId: string, limit: number = 50): Promise<IActivityLog[]> {
        await this.ensureConnection();

        return ActivityLog.find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Get recent activity for multiple organizations (for super admin)
     */
    async findRecent(limit: number = 100): Promise<IActivityLog[]> {
        await this.ensureConnection();

        return ActivityLog.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Get activity count by action type for organization
     */
    async getActionCounts(since?: Date): Promise<Record<string, number>> {
        await this.ensureConnection();

        const match: Record<string, unknown> = { };
        if (since) {
            match.createdAt = { $gte: since };
        }

        const stats = await ActivityLog.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$action',
                    count: { $sum: 1 },
                },
            },
        ]);

        const result: Record<string, number> = {};
        stats.forEach((stat: { _id: string; count: number }) => {
            result[stat._id] = stat.count;
        });

        return result;
    }

    /**
     * Get daily activity summary for charts
     */
    async getDailyActivitySummary(
        days: number = 30
    ): Promise<{ date: string; count: number }[]> {
        await this.ensureConnection();

        const since = new Date();
        since.setDate(since.getDate() - days);

        const stats = await ActivityLog.aggregate([
            {
                $match: {
                    createdAt: { $gte: since },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        return stats.map((stat: { _id: string; count: number }) => ({
            date: stat._id,
            count: stat.count,
        }));
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
export const activityLogRepository = new ActivityLogRepository();

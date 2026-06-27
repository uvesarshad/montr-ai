import mongoose, { FilterQuery } from 'mongoose';
import SystemLog, { ISystemLog } from '../models/system-log.model';

export interface SystemLogFilters {
    level?: string;
    event?: string;
    userId?: string;
    since?: Date;
    until?: Date;
    search?: string;
}

export interface SystemLogPagination {
    page: number;
    limit: number;
}

export class SystemLogRepository {
    /**
     * Insert a batch of log docs. Used by the fail-soft logger transport, so
     * this swallows all errors — stdout already has the lines.
     */
    async insertBatch(docs: Partial<ISystemLog>[]): Promise<void> {
        if (!docs.length) return;
        try {
            await this.ensureConnection();
            await SystemLog.insertMany(docs, { ordered: false });
        } catch {
            // Fail-soft: drop the batch (already on stdout). Never throw.
        }
    }

    /**
     * List logs for the super-admin browser. Sorted newest-first, paginated.
     */
    async list(
        filters: SystemLogFilters,
        pagination: SystemLogPagination
    ): Promise<{ data: ISystemLog[]; total: number }> {
        await this.ensureConnection();

        const query: FilterQuery<ISystemLog> = {};

        if (filters.level) query.level = filters.level;
        if (filters.event) query.event = filters.event;
        if (filters.userId) query.userId = filters.userId;

        if (filters.since || filters.until) {
            query.ts = {};
            if (filters.since) query.ts.$gte = filters.since;
            if (filters.until) query.ts.$lte = filters.until;
        }

        if (filters.search) {
            // Escape regex metacharacters so user input is treated literally.
            const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp(escaped, 'i');
            query.$or = [{ message: rx }, { event: rx }];
        }

        const page = Math.max(1, pagination.page);
        const limit = Math.max(1, pagination.limit);
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            SystemLog.find(query).sort({ ts: -1 }).skip(skip).limit(limit).lean<ISystemLog[]>().exec(),
            SystemLog.countDocuments(query).exec(),
        ]);

        return { data, total };
    }

    /**
     * Ensure MongoDB connection via Mongoose
     */
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

// Export singleton instance
export const systemLogRepository = new SystemLogRepository();

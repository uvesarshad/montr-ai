import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Persisted application log line.
 *
 * Written by the Mongo transport in `src/lib/logger.ts` when `LOG_PERSIST=true`
 * and read back by the super-admin log browser (`/admin/logs`). Stored in a
 * CAPPED collection (`system_logs`, 512MB / 1M docs) so the collection
 * self-trims oldest-first without a TTL index or sweeper.
 *
 * NOTE: capped collections forbid TTL indexes and document growth/removal —
 * do not add a TTL index here.
 */
export interface ISystemLog extends Document {
    ts: Date;
    level: string; // 'debug' | 'info' | 'warn' | 'error'
    service: string;
    env: string;
    event?: string;
    component?: string;
    message?: string;
    userId?: string;
    requestId?: string;
    err?: {
        name?: string;
        message?: string;
        stack?: string;
    };
    fields?: Record<string, unknown>;
}

const SystemLogSchema = new Schema<ISystemLog>(
    {
        ts: {
            type: Date,
            default: Date.now,
            index: true,
        },
        level: {
            type: String,
            required: true,
        },
        service: {
            type: String,
            required: true,
        },
        env: {
            type: String,
            required: true,
        },
        event: { type: String },
        component: { type: String },
        message: { type: String },
        userId: { type: String },
        requestId: { type: String },
        err: {
            name: { type: String },
            message: { type: String },
            stack: { type: String },
        },
        fields: { type: Schema.Types.Mixed },
    },
    {
        // 512MB cap, 1M doc ceiling — oldest-first eviction, no TTL needed.
        capped: { size: 536870912, max: 1000000 },
        collection: 'system_logs',
        timestamps: false,
    }
);

// Query indexes (capped collections allow secondary indexes, just not TTL).
SystemLogSchema.index({ ts: -1 });
SystemLogSchema.index({ level: 1, ts: -1 });
SystemLogSchema.index({ ts: -1 });
SystemLogSchema.index({ event: 1 });

const SystemLog: Model<ISystemLog> =
    mongoose.models.SystemLog || mongoose.model<ISystemLog>('SystemLog', SystemLogSchema);

export default SystemLog;

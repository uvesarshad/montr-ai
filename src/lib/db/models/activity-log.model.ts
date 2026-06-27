import mongoose, { Schema, Document, Model } from 'mongoose';

export type ActivityAction =
    | 'post_created'
    | 'post_submitted'
    | 'post_approved'
    | 'post_rejected'
    | 'post_published'
    | 'post_scheduled'
    | 'post_cancelled'
    | 'draft_saved'
    | 'draft_deleted'
    | 'brand_created'
    | 'account_connected'
    | 'account_disconnected'
    | 'member_added'
    | 'member_removed';

export interface IActivityLog extends Document {
    brandId?: string;
    userId: string;                 // Who performed the action
    userName: string;               // Cached for display
    action: ActivityAction;
    targetType: 'draft' | 'scheduled_post' | 'approval' | 'brand' | 'account' | 'member';
    targetId: string;
    targetName?: string;            // Human-readable target name
    metadata?: Record<string, unknown>; // Additional context
    createdAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
    {
        brandId: {
            type: String,
            default: null,
            index: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
        },
        userName: {
            type: String,
            required: true,
        },
        action: {
            type: String,
            enum: [
                'post_created',
                'post_submitted',
                'post_approved',
                'post_rejected',
                'post_published',
                'post_scheduled',
                'post_cancelled',
                'draft_saved',
                'draft_deleted',
                'brand_created',
                'account_connected',
                'account_disconnected',
                'member_added',
                'member_removed',
            ],
            required: true,
            index: true,
        },
        targetType: {
            type: String,
            enum: ['draft', 'scheduled_post', 'approval', 'brand', 'account', 'member'],
            required: true,
        },
        targetId: {
            type: String,
            required: true,
        },
        targetName: {
            type: String,
            default: null,
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        collection: 'activity_logs',
    }
);

// Compound indexes for common queries
ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ brandId: 1, createdAt: -1 });
ActivityLogSchema.index({ userId: 1, createdAt: -1 });

// Prevent model recompilation in development
const ActivityLog: Model<IActivityLog> =
    mongoose.models.ActivityLog || mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);

export default ActivityLog;

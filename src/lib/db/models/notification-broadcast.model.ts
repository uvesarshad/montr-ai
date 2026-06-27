import mongoose, { Schema, Document, Model } from 'mongoose';
import type { NotificationSeverity } from './notification.model';

/**
 * Audit log of super-admin broadcasts (marketing / system announcements).
 *
 * One row per broadcast send — distinct from the per-recipient `notifications`
 * documents the broadcast fans out into. Powers the admin "History" view with
 * delivery counts.
 */

export type BroadcastAudienceType = 'all' | 'organization' | 'role';

export interface INotificationBroadcast extends Document {
    title: string;
    body?: string;
    severity: NotificationSeverity;
    actionUrl?: string;
    actionLabel?: string;
    audienceType: BroadcastAudienceType;
    /** organizationId or role, depending on audienceType. */
    audienceTarget?: string;
    /** Human-readable audience summary, e.g. "All users", "Admins". */
    audienceLabel: string;
    deliveredCount: number;
    createdBy: string;
    createdByName?: string;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationBroadcastSchema = new Schema<INotificationBroadcast>(
    {
        title: { type: String, required: true, trim: true },
        body: { type: String, trim: true },
        severity: {
            type: String,
            enum: ['info', 'success', 'warning', 'error', 'critical'],
            default: 'info',
        },
        actionUrl: { type: String },
        actionLabel: { type: String },
        audienceType: {
            type: String,
            enum: ['all', 'organization', 'role'],
            required: true,
        },
        audienceTarget: { type: String },
        audienceLabel: { type: String, required: true },
        deliveredCount: { type: Number, default: 0 },
        createdBy: { type: String, required: true, index: true },
        createdByName: { type: String },
    },
    {
        timestamps: true,
        collection: 'notification_broadcasts',
    }
);

NotificationBroadcastSchema.index({ createdAt: -1 });

if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.NotificationBroadcast) {
        delete mongoose.models.NotificationBroadcast;
    }
}

const NotificationBroadcast: Model<INotificationBroadcast> =
    mongoose.models.NotificationBroadcast ||
    mongoose.model<INotificationBroadcast>('NotificationBroadcast', NotificationBroadcastSchema);

export default NotificationBroadcast;

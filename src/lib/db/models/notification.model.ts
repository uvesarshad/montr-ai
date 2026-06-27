import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Notification — one document per recipient (fan-out on write).
 *
 * Covers every in-app notification surface: module failures, credit alerts,
 * scheduled-task results, approval requests/decisions, super-admin marketing
 * announcements, and generic system alerts.
 *
 * Multi-tenant: `userId` is the recipient; `organizationId` is denormalised so
 * org-scoped listing/cleanup stays cheap. Always query by `userId`.
 */

export type NotificationCategory =
    | 'failure'
    | 'approval'
    | 'credit'
    | 'task'
    | 'marketing'
    | 'system';

export type NotificationSeverity =
    | 'info'
    | 'success'
    | 'warning'
    | 'error'
    | 'critical';

export type NotificationActionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface INotificationSource {
    module?: string;
    entityType?: string;
    entityId?: string;
}

export interface INotification extends Document {
    userId: string;
    category: NotificationCategory;
    /** Namespaced type, e.g. `failure.automation`, `credit.low`, `approval.requested`. */
    type: string;
    severity: NotificationSeverity;
    title: string;
    body?: string;
    /** Contextual payload — entity ids, error messages, amounts, etc. */
    data?: Record<string, unknown>;
    source?: INotificationSource;
    /** Deep link the item navigates to when clicked. */
    actionUrl?: string;
    actionLabel?: string;
    read: boolean;
    readAt?: Date | null;
    archived: boolean;
    /** True for items the recipient must act on (e.g. approvals). */
    requiresAction?: boolean;
    actionStatus?: NotificationActionStatus;
    /** Idempotency guard — unique per intended notification. Sparse. */
    dedupeKey?: string;
    /** Who triggered this (e.g. super-admin id for marketing broadcasts). */
    createdBy?: string;
    expiresAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        category: {
            type: String,
            enum: ['failure', 'approval', 'credit', 'task', 'marketing', 'system'],
            required: true,
        },
        type: {
            type: String,
            required: true,
        },
        severity: {
            type: String,
            enum: ['info', 'success', 'warning', 'error', 'critical'],
            default: 'info',
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        body: {
            type: String,
            trim: true,
        },
        data: {
            type: Schema.Types.Mixed,
            default: undefined,
        },
        source: {
            module: { type: String },
            entityType: { type: String },
            entityId: { type: String },
        },
        actionUrl: {
            type: String,
        },
        actionLabel: {
            type: String,
        },
        read: {
            type: Boolean,
            default: false,
            index: true,
        },
        readAt: {
            type: Date,
            default: null,
        },
        archived: {
            type: Boolean,
            default: false,
        },
        requiresAction: {
            type: Boolean,
            default: false,
        },
        actionStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'expired'],
            default: undefined,
        },
        dedupeKey: {
            type: String,
            default: undefined,
        },
        createdBy: {
            type: String,
            default: undefined,
        },
        expiresAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'notifications',
    }
);

// Primary feed query: a user's notifications newest-first, filtered by read state.
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
// Category tab filtering.
NotificationSchema.index({ userId: 1, category: 1, createdAt: -1 });
// Idempotency guard — unique only when a dedupeKey is present.
NotificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
// Optional TTL cleanup for expiring notifications.
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.Notification) {
        delete mongoose.models.Notification;
    }
}

const Notification: Model<INotification> =
    mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;

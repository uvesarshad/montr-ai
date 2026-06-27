import mongoose, { Schema, Document, Model } from 'mongoose';
import type { NotificationCategory } from './notification.model';

/**
 * Per-user notification preferences.
 *
 * One document per user (unique `userId`). Lazily created with sensible
 * defaults the first time it's read. Controls in-app + email delivery per
 * category, plus a global mute and a daily email digest opt-in.
 */

export interface INotificationChannelPref {
    inApp: boolean;
    email: boolean;
}

export type NotificationPrefMap = Record<NotificationCategory, INotificationChannelPref>;

export interface INotificationPreference extends Document {
    userId: string;
    muteAll: boolean;
    /** Receive a once-daily email digest of unread notifications. */
    emailDigest: boolean;
    categories: NotificationPrefMap;
    createdAt: Date;
    updatedAt: Date;
}

/** Sensible defaults — failures/approvals email-on, marketing email-off. */
export const DEFAULT_CATEGORY_PREFS: NotificationPrefMap = {
    failure: { inApp: true, email: true },
    approval: { inApp: true, email: true },
    credit: { inApp: true, email: true },
    task: { inApp: true, email: false },
    marketing: { inApp: true, email: false },
    system: { inApp: true, email: false },
};

const ChannelPrefSchema = new Schema<INotificationChannelPref>(
    {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
    },
    { _id: false }
);

const NotificationPreferenceSchema = new Schema<INotificationPreference>(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        muteAll: {
            type: Boolean,
            default: false,
        },
        emailDigest: {
            type: Boolean,
            default: false,
        },
        categories: {
            failure: { type: ChannelPrefSchema, default: () => ({ inApp: true, email: true }) },
            approval: { type: ChannelPrefSchema, default: () => ({ inApp: true, email: true }) },
            credit: { type: ChannelPrefSchema, default: () => ({ inApp: true, email: true }) },
            task: { type: ChannelPrefSchema, default: () => ({ inApp: true, email: false }) },
            marketing: { type: ChannelPrefSchema, default: () => ({ inApp: true, email: false }) },
            system: { type: ChannelPrefSchema, default: () => ({ inApp: true, email: false }) },
        },
    },
    {
        timestamps: true,
        collection: 'notification_preferences',
    }
);

if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.NotificationPreference) {
        delete mongoose.models.NotificationPreference;
    }
}

const NotificationPreference: Model<INotificationPreference> =
    mongoose.models.NotificationPreference ||
    mongoose.model<INotificationPreference>('NotificationPreference', NotificationPreferenceSchema);

export default NotificationPreference;

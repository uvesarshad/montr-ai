import mongoose from 'mongoose';
import Notification, { INotification, NotificationCategory } from '../models/notification.model';
import NotificationPreference, {
    INotificationPreference,
    INotificationChannelPref,
    DEFAULT_CATEGORY_PREFS,
} from '../models/notification-preference.model';
import NotificationBroadcast, { INotificationBroadcast } from '../models/notification-broadcast.model';

export interface CreateNotificationData {
    userId: string;
    category: NotificationCategory;
    type: string;
    severity?: INotification['severity'];
    title: string;
    body?: string;
    data?: Record<string, unknown>;
    source?: INotification['source'];
    actionUrl?: string;
    actionLabel?: string;
    requiresAction?: boolean;
    actionStatus?: INotification['actionStatus'];
    dedupeKey?: string;
    createdBy?: string;
    expiresAt?: Date | null;
}

export interface ListNotificationsOptions {
    category?: NotificationCategory;
    read?: boolean;
    archived?: boolean;
    page?: number;
    limit?: number;
}

export interface PaginatedNotifications {
    data: INotification[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasMore: boolean;
    };
}

class NotificationRepository {
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }

    /** Create a single notification. */
    async create(data: CreateNotificationData): Promise<INotification> {
        await this.ensureConnection();
        const doc = new Notification(data);
        return doc.save();
    }

    /**
     * Idempotent create keyed by `dedupeKey`. Returns the notification plus a
     * `created` flag so callers only push a realtime event for genuinely new
     * items (the domain bus can deliver the same event twice in-process).
     */
    async upsertByDedupeKey(
        data: CreateNotificationData & { dedupeKey: string }
    ): Promise<{ notification: INotification; created: boolean }> {
        await this.ensureConnection();

        const res = (await Notification.findOneAndUpdate(
            { dedupeKey: data.dedupeKey },
            { $setOnInsert: data },
            { upsert: true, new: true, includeResultMetadata: true }
        ).exec()) as unknown as { value: INotification; lastErrorObject?: { updatedExisting?: boolean } };

        const created = !res.lastErrorObject?.updatedExisting;
        return { notification: res.value, created };
    }

    /** Bulk insert for fan-out (org/role/broadcast). */
    async createMany(docs: CreateNotificationData[]): Promise<INotification[]> {
        await this.ensureConnection();
        if (docs.length === 0) return [];
        // ordered:false so a single duplicate dedupeKey doesn't abort the batch.
        return Notification.insertMany(docs, { ordered: false }) as unknown as INotification[];
    }

    async findForUser(userId: string, options: ListNotificationsOptions = {}): Promise<PaginatedNotifications> {
        await this.ensureConnection();

        const page = Math.max(1, options.page ?? 1);
        const limit = Math.min(Math.max(1, options.limit ?? 25), 100);

        const query: Record<string, unknown> = { userId };
        if (options.category) query.category = options.category;
        if (typeof options.read === 'boolean') query.read = options.read;
        // Default to non-archived unless explicitly asked for archived items.
        query.archived = options.archived ?? false;

        const [data, total] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            Notification.countDocuments(query).exec(),
        ]);

        const totalPages = Math.ceil(total / limit) || 1;

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasMore: page < totalPages,
            },
        };
    }

    async countUnread(userId: string): Promise<number> {
        await this.ensureConnection();
        return Notification.countDocuments({ userId, read: false, archived: false }).exec();
    }

    async markRead(id: string, userId: string): Promise<INotification | null> {
        await this.ensureConnection();
        return Notification.findOneAndUpdate(
            { _id: id, userId },
            { $set: { read: true, readAt: new Date() } },
            { new: true }
        ).exec();
    }

    async markAllRead(userId: string): Promise<number> {
        await this.ensureConnection();
        const res = await Notification.updateMany(
            { userId, read: false },
            { $set: { read: true, readAt: new Date() } }
        ).exec();
        return res.modifiedCount;
    }

    async archive(id: string, userId: string): Promise<INotification | null> {
        await this.ensureConnection();
        return Notification.findOneAndUpdate(
            { _id: id, userId },
            { $set: { archived: true, read: true, readAt: new Date() } },
            { new: true }
        ).exec();
    }

    async remove(id: string, userId: string): Promise<boolean> {
        await this.ensureConnection();
        const res = await Notification.deleteOne({ _id: id, userId }).exec();
        return res.deletedCount > 0;
    }

    async setActionStatus(
        id: string,
        userId: string,
        actionStatus: NonNullable<INotification['actionStatus']>
    ): Promise<INotification | null> {
        await this.ensureConnection();
        return Notification.findOneAndUpdate(
            { _id: id, userId },
            { $set: { actionStatus, read: true, readAt: new Date() } },
            { new: true }
        ).exec();
    }

    async findById(id: string, userId: string): Promise<INotification | null> {
        await this.ensureConnection();
        return Notification.findOne({ _id: id, userId }).exec();
    }

    /** Unread, non-archived items created since `since` — used by the email digest. */
    async findUnreadSince(userId: string, since: Date): Promise<INotification[]> {
        await this.ensureConnection();
        return Notification.find({
            userId,
            read: false,
            archived: false,
            createdAt: { $gte: since },
        })
            .sort({ createdAt: -1 })
            .limit(50)
            .exec();
    }

    // ---- Preferences ----

    /** Get prefs for a user, lazily creating defaults on first access. */
    async getPreferences(userId: string): Promise<INotificationPreference> {
        await this.ensureConnection();
        let prefs = await NotificationPreference.findOne({ userId }).exec();
        if (!prefs) {
            prefs = await NotificationPreference.create({
                userId,
                categories: DEFAULT_CATEGORY_PREFS,
            });
        }
        return prefs;
    }

    async updatePreferences(
        userId: string,
        patch: {
            muteAll?: boolean;
            emailDigest?: boolean;
            categories?: Record<string, Partial<INotificationChannelPref>>;
        }
    ): Promise<INotificationPreference> {
        await this.ensureConnection();
        const set: Record<string, unknown> = {};
        if (typeof patch.muteAll === 'boolean') set.muteAll = patch.muteAll;
        if (typeof patch.emailDigest === 'boolean') set.emailDigest = patch.emailDigest;
        if (patch.categories) {
            for (const [cat, pref] of Object.entries(patch.categories)) {
                if (pref && typeof pref === 'object') {
                    if (typeof pref.inApp === 'boolean') set[`categories.${cat}.inApp`] = pref.inApp;
                    if (typeof pref.email === 'boolean') set[`categories.${cat}.email`] = pref.email;
                }
            }
        }

        return NotificationPreference.findOneAndUpdate(
            { userId },
            { $set: set, $setOnInsert: { userId } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).exec() as Promise<INotificationPreference>;
    }

    /** Users who opted into the daily email digest. */
    async findDigestOptIns(): Promise<INotificationPreference[]> {
        await this.ensureConnection();
        return NotificationPreference.find({ emailDigest: true, muteAll: false }).exec();
    }

    // ---- Broadcast log (super-admin) ----

    async logBroadcast(data: Partial<INotificationBroadcast>): Promise<INotificationBroadcast> {
        await this.ensureConnection();
        return NotificationBroadcast.create(data);
    }

    async listBroadcasts(limit = 25): Promise<INotificationBroadcast[]> {
        await this.ensureConnection();
        return NotificationBroadcast.find().sort({ createdAt: -1 }).limit(limit).exec();
    }
}

export const notificationRepository = new NotificationRepository();

/**
 * Notification service — the API the rest of the platform calls to notify users.
 *
 * Responsibilities:
 *   - resolve category/severity defaults from the type registry
 *   - honour per-user preferences (mute / per-category in-app + email)
 *   - persist (idempotently when a dedupeKey is given)
 *   - push the realtime socket event (+ fresh unread count)
 *   - fire an immediate email for high-severity / opted-in categories
 *
 * Works from any process (HTTP or worker): persistence hits Mongo directly and
 * the socket signal travels over Redis via `notification-bus`.
 */

import { notificationRepository, CreateNotificationData } from '@/lib/db/repository/notification.repository';
import type { INotification, NotificationCategory, NotificationSeverity } from '@/lib/db/models/notification.model';
import { metaForType } from './types';
import { publishNotificationEventAsync } from './notification-bus';

export interface NotifyInput {
    userId: string;
    type: string;
    /** Override the registry category/severity if needed. */
    category?: NotificationCategory;
    severity?: NotificationSeverity;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
    source?: CreateNotificationData['source'];
    actionUrl?: string;
    actionLabel?: string;
    requiresAction?: boolean;
    actionStatus?: INotification['actionStatus'];
    dedupeKey?: string;
    createdBy?: string;
    expiresAt?: Date | null;
    /** Skip preference checks (used by per-user fan-out that already filtered). */
    skipPrefs?: boolean;
}

interface FanOutOptions {
    roles?: Array<'user' | 'admin' | 'super_admin'>;
}

const EMAIL_SEVERITIES: NotificationSeverity[] = ['error', 'critical'];

function toClient(n: INotification): Record<string, unknown> {
    return {
        _id: String(n._id),
        userId: n.userId,
        category: n.category,
        type: n.type,
        severity: n.severity,
        title: n.title,
        body: n.body,
        data: n.data,
        source: n.source,
        actionUrl: n.actionUrl,
        actionLabel: n.actionLabel,
        read: n.read,
        archived: n.archived,
        requiresAction: n.requiresAction ?? false,
        actionStatus: n.actionStatus,
        createdAt: n.createdAt,
    };
}

/**
 * Create a notification for a single user. Returns the document, or null when
 * suppressed by preferences / deduped.
 */
export async function notify(input: NotifyInput): Promise<INotification | null> {
    const meta = metaForType(input.type);
    const category = input.category ?? meta.category;
    const severity = input.severity ?? meta.severity;

    // Preference gate (unless caller already filtered).
    let emailWanted = false;
    if (!input.skipPrefs) {
        try {
            const prefs = await notificationRepository.getPreferences(input.userId);
            if (prefs.muteAll) return null;
            const catPref = prefs.categories?.[category];
            if (catPref && catPref.inApp === false) {
                // In-app disabled for this category — nothing to store/show.
                return null;
            }
            emailWanted = !!catPref?.email;
        } catch (err) {
            console.error('[notifications] preference lookup failed:', err);
        }
    }

    const data: CreateNotificationData = {
        userId: input.userId,
        category,
        type: input.type,
        severity,
        title: input.title,
        body: input.body,
        data: input.data,
        source: input.source,
        actionUrl: input.actionUrl,
        actionLabel: input.actionLabel,
        requiresAction: input.requiresAction,
        actionStatus: input.requiresAction ? input.actionStatus ?? 'pending' : input.actionStatus,
        dedupeKey: input.dedupeKey,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt ?? null,
    };

    let notification: INotification;
    if (input.dedupeKey) {
        const { notification: n, created } = await notificationRepository.upsertByDedupeKey({
            ...data,
            dedupeKey: input.dedupeKey,
        });
        if (!created) return n; // already delivered — don't re-emit / re-email
        notification = n;
    } else {
        notification = await notificationRepository.create(data);
    }

    // Realtime push with fresh unread count.
    try {
        const unreadCount = await notificationRepository.countUnread(input.userId);
        publishNotificationEventAsync({
            userId: input.userId,
            notification: toClient(notification),
            unreadCount,
        });
    } catch (err) {
        console.error('[notifications] realtime publish failed:', err);
    }

    // Immediate email for high-severity / opted-in categories. Digest handles the rest.
    if (emailWanted && (EMAIL_SEVERITIES.includes(severity) || category === 'marketing')) {
        try {
            const { sendImmediateNotificationEmail } = await import('./notification-email');
            void sendImmediateNotificationEmail(input.userId, notification);
        } catch (err) {
            console.error('[notifications] email dispatch failed:', err);
        }
    }

    return notification;
}

export async function notifyUser(userId: string, input: Omit<NotifyInput, 'userId'>): Promise<INotification | null> {
    return notify({ ...input, userId });
}

async function fanOut(
    users: Array<{ _id: unknown; }>,
    input: Omit<NotifyInput, 'userId'>
): Promise<number> {
    let delivered = 0;
    await Promise.all(
        users.map(async (u) => {
            const userId = String(u._id);
            const perUserDedupe = input.dedupeKey ? `${input.dedupeKey}:${userId}` : undefined;
            const result = await notify({
                ...input,
                userId,
                dedupeKey: perUserDedupe,
            });
            if (result) delivered += 1;
        })
    );
    return delivered;
}

/** Notify every member of an organization (optionally limited to certain roles). */
export async function notifyOrg(
    input: Omit<NotifyInput, 'userId'>,
    options: FanOutOptions = {}
): Promise<number> {
    const { userRepository } = await import('@/lib/db/repository/user.repository');
    let users = await userRepository.findByOrganization();
    if (options.roles?.length) {
        users = users.filter((u) => options.roles!.includes((u as { role: 'user' | 'admin' | 'super_admin' }).role));
    }
    return fanOut(users, { ...input });
}

/** Notify the admins (admin + super_admin) of an organization. */
export async function notifyAdmins(
    input: Omit<NotifyInput, 'userId'>
): Promise<number> {
    return notifyOrg(input, { roles: ['admin', 'super_admin'] });
}

/** Notify all users with a given role (platform-wide). */
export async function notifyRole(
    role: 'user' | 'admin' | 'super_admin',
    input: Omit<NotifyInput, 'userId'>
): Promise<number> {
    const { userRepository } = await import('@/lib/db/repository/user.repository');
    const all = await userRepository.findAll();
    const users = all.filter((u) => (u as { role: string }).role === role);
    return fanOut(users, input);
}

/**
 * Super-admin marketing broadcast. Fan-out on write, excluding users who muted
 * everything. Batched insert + per-recipient socket nudge.
 */
export async function broadcast(
    input: Omit<NotifyInput, 'userId'> & { type?: string },
    audience: { type: 'all' } | { type: 'organization'; } | { type: 'role'; role: 'user' | 'admin' | 'super_admin' }
): Promise<number> {
    const { userRepository } = await import('@/lib/db/repository/user.repository');

    let users: Array<{ _id: unknown;
 role?: string }>;
    if (audience.type === 'organization') {
        users = await userRepository.findByOrganization();
    } else {
        const all = await userRepository.findAll();
        users = audience.type === 'role' ? all.filter((u) => (u as { role: string }).role === audience.role) : all;
    }

    // Exclude users who muted everything.
    const NotificationPreference = (await import('@/lib/db/models/notification-preference.model')).default;
    const userIds = users.map((u) => String(u._id));
    const muted = await NotificationPreference.find({ userId: { $in: userIds }, muteAll: true }).select('userId').lean();
    const mutedSet = new Set(muted.map((m: { userId: string }) => m.userId));

    const recipients = users.filter((u) => !mutedSet.has(String(u._id)));
    if (recipients.length === 0) return 0;

    const type = input.type ?? 'marketing.announcement';
    const meta = metaForType(type);
    const docs: CreateNotificationData[] = recipients.map((u) => ({
        userId: String(u._id),
        category: input.category ?? meta.category,
        type,
        severity: input.severity ?? meta.severity,
        title: input.title,
        body: input.body,
        data: input.data,
        actionUrl: input.actionUrl,
        actionLabel: input.actionLabel,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt ?? null,
    }));

    // Chunked bulk insert.
    const CHUNK = 1000;
    const created: INotification[] = [];
    for (let i = 0; i < docs.length; i += CHUNK) {
        const inserted = await notificationRepository.createMany(docs.slice(i, i + CHUNK));
        created.push(...inserted);
    }

    // Per-recipient socket nudge (best-effort).
    await Promise.all(
        created.map(async (n) => {
            try {
                const unreadCount = await notificationRepository.countUnread(n.userId);
                publishNotificationEventAsync({ userId: n.userId, notification: toClient(n), unreadCount });
            } catch {
                /* best-effort */
            }
        })
    );

    return created.length;
}

export const notificationService = {
    notify,
    notifyUser,
    notifyOrg,
    notifyAdmins,
    notifyRole,
    broadcast,
};

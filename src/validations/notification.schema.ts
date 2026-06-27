import { z } from 'zod';

export const notificationCategoryEnum = z.enum([
    'failure',
    'approval',
    'credit',
    'task',
    'marketing',
    'system',
]);

export const notificationSeverityEnum = z.enum(['info', 'success', 'warning', 'error', 'critical']);

/** Query params for GET /api/v2/notifications */
export const listNotificationsQuerySchema = z.object({
    category: notificationCategoryEnum.optional(),
    read: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    archived: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
});

/** PATCH /api/v2/notifications/[id] */
export const patchNotificationSchema = z
    .object({
        read: z.boolean().optional(),
        archived: z.boolean().optional(),
    })
    .refine((d) => d.read !== undefined || d.archived !== undefined, {
        message: 'Provide at least one of: read, archived',
    });

/** POST /api/v2/notifications/[id]/action */
export const notificationActionSchema = z.object({
    decision: z.enum(['approved', 'rejected']),
    note: z.string().max(2000).optional(),
});

const channelPrefSchema = z.object({
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
});

/** PATCH /api/v2/notifications/preferences */
export const updatePreferencesSchema = z.object({
    muteAll: z.boolean().optional(),
    emailDigest: z.boolean().optional(),
    categories: z
        .object({
            failure: channelPrefSchema.optional(),
            approval: channelPrefSchema.optional(),
            credit: channelPrefSchema.optional(),
            task: channelPrefSchema.optional(),
            marketing: channelPrefSchema.optional(),
            system: channelPrefSchema.optional(),
        })
        .optional(),
});

/** POST /api/v2/notifications/admin/broadcast (super-admin marketing) */
export const broadcastSchema = z.object({
    title: z.string().min(1).max(200),
    body: z.string().max(5000).optional(),
    severity: notificationSeverityEnum.default('info'),
    actionUrl: z.string().url().optional().or(z.literal('').transform(() => undefined)),
    actionLabel: z.string().max(60).optional(),
    audience: z.discriminatedUnion('type', [
        z.object({ type: z.literal('all') }),
        z.object({ type: z.literal('organization') }),
        z.object({ type: z.literal('role'), role: z.enum(['user', 'admin', 'super_admin']) }),
    ]),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type BroadcastInput = z.infer<typeof broadcastSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type NotificationActionInput = z.infer<typeof notificationActionSchema>;

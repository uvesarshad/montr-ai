import { z } from 'zod';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const metricsSourceTypeSchema = z.enum([
    'meta_ads', 'google_ads', 'ga4', 'search_console', 'youtube',
    'facebook', 'instagram', 'threads', 'linkedin', 'tiktok', 'x',
]);

export const metricsEntityTypeSchema = z.enum([
    'account', 'campaign', 'adset', 'ad', 'page', 'channel',
    'property', 'site', 'query', 'page_path', 'channel_group',
]);

/** Shared query params for the /api/v2/analytics read endpoints */
export const analyticsRangeQuerySchema = z.object({
    brandId: z.string().min(1).optional(),
    sourceType: metricsSourceTypeSchema.optional(),
    sourceId: z.string().min(1).optional(),
    entityType: metricsEntityTypeSchema.optional(),
    entityId: z.string().min(1).optional(),
    parentEntityId: z.string().min(1).optional(),
    dateFrom: dateKey.optional(),
    dateTo: dateKey.optional(),
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;

/** POST /api/v2/analytics/sync body */
export const analyticsSyncRequestSchema = z.object({
    connectionId: z.string().min(1).optional(),
    sourceType: metricsSourceTypeSchema.optional(),
    days: z.number().int().min(1).max(365).optional(),
}).refine(
    (value) => !value.connectionId || !!value.sourceType,
    { message: 'sourceType is required when connectionId is provided' },
);

export type AnalyticsSyncRequest = z.infer<typeof analyticsSyncRequestSchema>;

import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import PostDraft from '@/lib/db/models/draft.model';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { analyticsRepository } from '@/lib/db/repository/analytics.repository';
import type { ISocialAccount } from '@/lib/db/models/social-account.model';
import type { IPlatformConfig, IRecurrence } from '@/lib/db/models/scheduled-post.model';
import type { IDraftPlatformConfig } from '@/lib/db/models/draft.model';
import { PLATFORM_CAPABILITIES } from '@/lib/social/providers/registry';

/**
 * Resolve which connected accounts a post should target.
 *
 * - `selectors` omitted  → ALL connected accounts (full fan-out).
 * - selector with `accountId` → that single account (must belong to the brand).
 * - selector with `platform` only → ALL connected accounts of that platform.
 */
function resolveTargetAccounts(
    accounts: ISocialAccount[],
    selectors?: { platform?: string; accountId?: string }[]
): ISocialAccount[] {
    if (!selectors || selectors.length === 0) {
        return accounts;
    }

    const picked = new Map<string, ISocialAccount>();

    for (const sel of selectors) {
        if (sel.accountId) {
            const match = accounts.find((a) => a._id.toString() === sel.accountId);
            if (match) picked.set(match._id.toString(), match);
        } else if (sel.platform) {
            for (const a of accounts.filter((acc) => acc.platform === sel.platform)) {
                picked.set(a._id.toString(), a);
            }
        }
    }

    return Array.from(picked.values());
}

/** Per-platform options the agent may attach to a schedule/draft (Epic 4.2). */
interface PlatformPostOptions {
    firstComment?: string;
    threadSegments?: string[];
    platformSettings?: Record<string, Record<string, unknown>>;
}

/**
 * Build the platform configs, threading per-platform options onto each one.
 *
 * `firstComment` and threads (`isThread`/`threadParts`) are only applied to
 * platforms whose `PLATFORM_CAPABILITIES` advertise support; `settings` is a
 * free-form per-provider blob keyed by platform.
 */
function toPlatformConfigs(
    accounts: ISocialAccount[],
    options?: PlatformPostOptions,
): IPlatformConfig[] {
    return accounts.map((a) => {
        const config: IPlatformConfig = {
            accountId: a._id.toString(),
            platform: a.platform,
            platformUsername: a.platformUsername,
        };

        const caps = PLATFORM_CAPABILITIES[a.platform];

        if (options?.firstComment && caps?.firstComment) {
            config.firstComment = options.firstComment;
        }

        if (
            options?.threadSegments &&
            options.threadSegments.length > 0 &&
            caps?.threads
        ) {
            config.isThread = true;
            config.threadParts = options.threadSegments;
        }

        const settings = options?.platformSettings?.[a.platform];
        if (settings) {
            config.settings = settings;
        }

        return config;
    });
}

/**
 * Create/schedule a social media post across one or many connected accounts.
 *
 * Gated tool (HITL danger list) — no hitlPolicy declared here on purpose.
 */
export const schedulePostTool = {
    name: 'schedulePost',
    description:
        'Create or schedule a social media post. Targets one connected account, all accounts of a platform, or every connected account (full fan-out). Provide scheduledFor (ISO datetime) to schedule it; omit it to save a draft for review.',
    parameters: z.object({
        content: z.string().describe('The full text content of the social media post.'),
        title: z.string().optional().describe("A short title for the draft (e.g. 'Monday Launch Announcement')."),
        scheduledFor: z
            .string()
            .optional()
            .describe('ISO datetime to publish at. Omit to save as a draft instead of scheduling.'),
        platforms: z
            .array(
                z.object({
                    platform: z.string().optional().describe('Target ALL connected accounts of this platform (e.g. "x", "linkedin").'),
                    accountId: z.string().optional().describe('Target one specific connected account by its id.'),
                })
            )
            .optional()
            .describe('Account/platform selectors. Omit entirely to post to every connected account.'),
        mediaUrls: z.array(z.string()).optional().describe('Media URLs (images/videos) to attach. Multiple URLs become a carousel on platforms that support it.'),
        firstComment: z
            .string()
            .optional()
            .describe('A first comment to attach after the post (applied only to platforms that support it, e.g. Instagram, LinkedIn).'),
        threadSegments: z
            .array(z.string())
            .optional()
            .describe('Segments of a native thread (chained posts). Applied only to thread-capable platforms (e.g. X, Threads, Mastodon, Bluesky).'),
        platformSettings: z
            .record(z.string(), z.record(z.string(), z.unknown()))
            .optional()
            .describe('Per-platform advanced settings keyed by platform (e.g. { tiktok: { privacy_level: "PUBLIC" }, youtube: { title, privacy } }).'),
        recurrence: z
            .object({
                frequency: z.enum(['daily', 'weekly', 'monthly']),
                interval: z.number().int().positive().optional().describe('Repeat every N days/weeks/months (default 1).'),
                endDate: z.string().optional().describe('ISO date when the recurrence stops.'),
                daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().describe('For weekly: 0=Sun … 6=Sat.'),
                dayOfMonth: z.number().int().min(1).max(31).optional().describe('For monthly: day of month.'),
            })
            .optional()
            .describe('Make this a recurring post.'),
    }),
    factory: (context: AgentContext) =>
        tool({
            description: 'Create or schedule a social media post across connected accounts.',
            parameters: z.object({
                content: z.string(),
                title: z.string().optional(),
                scheduledFor: z.string().optional(),
                platforms: z
                    .array(
                        z.object({
                            platform: z.string().optional(),
                            accountId: z.string().optional(),
                        })
                    )
                    .optional(),
                mediaUrls: z.array(z.string()).optional(),
                firstComment: z.string().optional(),
                threadSegments: z.array(z.string()).optional(),
                platformSettings: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
                recurrence: z
                    .object({
                        frequency: z.enum(['daily', 'weekly', 'monthly']),
                        interval: z.number().int().positive().optional(),
                        endDate: z.string().optional(),
                        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
                        dayOfMonth: z.number().int().min(1).max(31).optional(),
                    })
                    .optional(),
            }),
            execute: async (args) => {
                try {
                    const brandId = context.brandId || context.userId;
                    console.log(`[Agent Tool - schedulePost] brand ${brandId}, scheduledFor=${args.scheduledFor ?? '(draft)'}`);

                    const connectedAccounts = await socialAccountRepository.findByBrandId(brandId);
                    if (connectedAccounts.length === 0) {
                        return { success: false, error: 'No social accounts connected for this brand.' };
                    }

                    const targets = resolveTargetAccounts(connectedAccounts, args.platforms);
                    if (targets.length === 0) {
                        return {
                            success: false,
                            error: 'None of the requested platforms/accounts are connected for this brand.',
                        };
                    }

                    const postOptions: PlatformPostOptions = {
                        firstComment: args.firstComment,
                        threadSegments: args.threadSegments,
                        platformSettings: args.platformSettings,
                    };
                    const platformConfigs = toPlatformConfigs(targets, postOptions);
                    const accounts = targets.map((a) => ({ platform: a.platform, username: a.platformUsername }));

                    // Normalize recurrence (string endDate → Date) for persistence.
                    let recurrence: IRecurrence | undefined;
                    if (args.recurrence) {
                        recurrence = {
                            frequency: args.recurrence.frequency,
                            interval: args.recurrence.interval ?? 1,
                            endDate: args.recurrence.endDate ? new Date(args.recurrence.endDate) : undefined,
                            daysOfWeek: args.recurrence.daysOfWeek,
                            dayOfMonth: args.recurrence.dayOfMonth,
                        };
                    }

                    // Scheduled post path — route through submitSocialPost() so
                    // agent-created posts respect the org approval policy +
                    // admin notifications (audit C8 §A8) and actually enqueue
                    // the BullMQ publish job (the old direct repository.create
                    // never called schedulePost(), so nothing ever published).
                    if (args.scheduledFor) {
                        const scheduledAt = new Date(args.scheduledFor);
                        if (isNaN(scheduledAt.getTime())) {
                            return { success: false, error: `Invalid scheduledFor datetime: "${args.scheduledFor}".` };
                        }

                        const { submitSocialPost } = await import('@/lib/social/social-post-submissions');
                        const { scheduledPost, requiresApproval } = await submitSocialPost({
                            userId: context.userId,
                            intent: 'schedule',
                            brandId,
                            content: args.content,
                            mediaUrls: args.mediaUrls || [],
                            platforms: platformConfigs,
                            scheduledFor: scheduledAt,
                            timezone: 'UTC',
                            recurrence,
                        });

                        return {
                            success: true,
                            postId: scheduledPost._id.toString(),
                            accounts,
                            scheduledAt: scheduledAt.toISOString(),
                            requiresApproval,
                            message: requiresApproval
                                ? `Submitted for admin approval (org policy) across ${accounts.length} account(s); it will publish at ${scheduledAt.toISOString()} once approved.`
                                : `Scheduled across ${accounts.length} account(s) for ${scheduledAt.toISOString()}.`,
                            deepLink: requiresApproval ? '/social/approvals' : '/social/calendar',
                        };
                    }

                    // Draft path — attach the resolved platforms so the draft is ready to schedule.
                    const draftPlatforms: IDraftPlatformConfig[] = targets.map((a) => ({
                        accountId: a._id.toString(),
                        platform: a.platform,
                        platformUsername: a.platformUsername,
                    }));

                    const draft = await PostDraft.create({
                        brandId,
                        userId: context.userId,
                        title: args.title || args.content.slice(0, 50) + '...',
                        content: args.content,
                        media: (args.mediaUrls || []).map((url, i) => ({
                            id: `m${i}`,
                            url,
                            type: 'image' as const,
                        })),
                        platforms: draftPlatforms,
                        scheduleCount: 0,
                    });

                    return {
                        success: true,
                        postId: draft._id.toString(),
                        accounts,
                        message: `Draft created: "${draft.title}" with ${accounts.length} account(s) attached. Review in Social → Drafts.`,
                        deepLink: '/social/drafts',
                    };
                } catch (error: unknown) {
                    return { success: false, error: error instanceof Error ? error.message : 'Failed to create post' };
                }
            },
        }),
};

/**
 * Get social media analytics/metrics
 */
export const getAnalyticsTool = {
    name: 'getAnalytics',
    description: 'Get social media post analytics and performance metrics. Use this when a user asks about their social media performance.',
    parameters: z.object({
        period: z.enum(['7d', '30d', '90d']).optional().describe("Time period for analytics (default: 30d)."),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Get social media analytics.',
        parameters: z.object({
            period: z.enum(['7d', '30d', '90d']).optional(),
        }),
        execute: async (args) => {
            try {
                console.log(`[Agent Tool - getAnalytics] Getting analytics for brand ${context.brandId}`);

                // Get draft/post counts as a basic metric
                const brandId = context.brandId || context.userId;
                const cutoffDate = new Date();
                const days = args.period === '7d' ? 7 : args.period === '90d' ? 90 : 30;
                cutoffDate.setDate(cutoffDate.getDate() - days);

                const totalDrafts = await PostDraft.countDocuments({
                    brandId,
                    createdAt: { $gte: cutoffDate },
                });

                const scheduledDrafts = await PostDraft.countDocuments({
                    brandId,
                    createdAt: { $gte: cutoffDate },
                    scheduleCount: { $gt: 0 },
                });

                return {
                    success: true,
                    analytics: {
                        period: args.period || '30d',
                        totalDrafts,
                        scheduledPosts: scheduledDrafts,
                        unscheduledDrafts: totalDrafts - scheduledDrafts,
                    },
                    message: `In the last ${days} days: ${totalDrafts} drafts created, ${scheduledDrafts} scheduled.`,
                    deepLink: '/social/analytics',
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to get analytics' };
            }
        }
    })
};

/**
 * List the brand's connected social accounts.
 */
export const listSocialAccountsTool = {
    name: 'list_social_accounts',
    description: 'List the social media accounts connected for the current brand, with their platform and username.',
    hitlPolicy: 'never' as const,
    parameters: z.object({}),
    factory: (context: AgentContext) =>
        tool({
            description: 'List connected social accounts for the current brand.',
            parameters: z.object({}),
            execute: async () => {
                try {
                    const brandId = context.brandId || context.userId;
                    const accounts = await socialAccountRepository.findByBrandId(brandId);

                    return {
                        success: true,
                        count: accounts.length,
                        accounts: accounts.map((a) => ({
                            id: a._id.toString(),
                            platform: a.platform,
                            platformUsername: a.platformUsername,
                            platformDisplayName: a.platformDisplayName || null,
                            isActive: a.isActive,
                        })),
                        deepLink: '/social/accounts',
                    };
                } catch (error: unknown) {
                    return { success: false, error: error instanceof Error ? error.message : 'Failed to list accounts' };
                }
            },
        }),
};

const SCHEDULED_POST_STATUSES = [
    'pending_approval',
    'scheduled',
    'publishing',
    'published',
    'failed',
    'cancelled',
] as const;

/**
 * List scheduled/upcoming posts for the current brand.
 */
export const listScheduledPostsTool = {
    name: 'list_scheduled_posts',
    description: 'List scheduled and upcoming social media posts for the current brand. Filter by status and a lookahead window in days.',
    hitlPolicy: 'never' as const,
    parameters: z.object({
        status: z.enum(SCHEDULED_POST_STATUSES).optional().describe('Filter by post status.'),
        days: z.number().int().positive().optional().describe('Lookahead window in days from now.'),
    }),
    factory: (context: AgentContext) =>
        tool({
            description: 'List scheduled posts for the current brand.',
            parameters: z.object({
                status: z.enum(SCHEDULED_POST_STATUSES).optional(),
                days: z.number().int().positive().optional(),
            }),
            execute: async (args) => {
                try {
                    const brandId = context.brandId || context.userId;

                    const filters: { status?: typeof SCHEDULED_POST_STATUSES[number]; fromDate?: Date; toDate?: Date } = {};
                    if (args.status) filters.status = args.status;
                    if (args.days) {
                        const toDate = new Date();
                        toDate.setDate(toDate.getDate() + args.days);
                        filters.toDate = toDate;
                    }

                    const posts = await scheduledPostRepository.findByBrand(brandId, filters);

                    return {
                        success: true,
                        count: posts.length,
                        posts: posts.map((p) => ({
                            id: p._id.toString(),
                            contentPreview: p.content.slice(0, 120),
                            platforms: p.platforms.map((pf) => ({ platform: pf.platform, username: pf.platformUsername })),
                            status: p.status,
                            scheduledAt: p.scheduledFor ? new Date(p.scheduledFor).toISOString() : null,
                        })),
                        deepLink: '/social/calendar',
                    };
                } catch (error: unknown) {
                    return { success: false, error: error instanceof Error ? error.message : 'Failed to list scheduled posts' };
                }
            },
        }),
};

/**
 * Per-post performance read for published posts in a window.
 */
export const getPostPerformanceTool = {
    name: 'get_post_performance',
    description: 'Get per-post performance metrics (likes, comments, shares, impressions, reach, engagement rate) for the brand\'s published posts in a recent window, ranked by engagement.',
    hitlPolicy: 'never' as const,
    parameters: z.object({
        days: z.number().int().min(1).max(90).optional().describe('Lookback window in days (default 30).'),
        platform: z.string().optional().describe('Filter to a single platform (e.g. "x", "instagram").'),
    }),
    factory: (context: AgentContext) =>
        tool({
            description: 'Get per-post performance metrics for the current brand.',
            parameters: z.object({
                days: z.number().int().min(1).max(90).optional(),
                platform: z.string().optional(),
            }),
            execute: async (args) => {
                try {
                    const brandId = context.brandId || context.userId;
                    const days = args.days ?? 30;
                    const fromDate = new Date();
                    fromDate.setDate(fromDate.getDate() - days);

                    const records = await analyticsRepository.getByBrand(brandId, {
                        fromDate,
                        // analyticsRepository accepts MetricPlatform; pass through as-is.
                        platform: args.platform as never,
                        limit: 500,
                    });

                    // Per-post analytics store is genuinely empty — fall back to publishResults.
                    if (records.length === 0) {
                        const toDate = new Date();
                        const published = await scheduledPostRepository.findByBrand(brandId, {
                            status: 'published',
                            fromDate,
                            toDate,
                        });

                        const fallbackPosts = published
                            .filter((p) => !args.platform || p.platforms.some((pf) => pf.platform === args.platform))
                            .map((p) => {
                                const successes = (p.publishResults || []).filter((r) => r.success);
                                return {
                                    contentPreview: p.content.slice(0, 120),
                                    platforms: successes.map((r) => r.platform),
                                    publishedAt: (successes[0]?.publishedAt
                                        ? new Date(successes[0].publishedAt)
                                        : new Date(p.scheduledFor)
                                    ).toISOString(),
                                    publishedCount: successes.length,
                                    metrics: null,
                                };
                            });

                        return {
                            success: true,
                            source: 'publishResults',
                            note: 'No per-post analytics available yet; summarizing publish results for published posts instead.',
                            window: `${days}d`,
                            count: fallbackPosts.length,
                            posts: fallbackPosts.slice(0, 20),
                            deepLink: '/social/analytics',
                        };
                    }

                    const ranked = records
                        .map((r) => {
                            const m = r.metrics || ({} as typeof r.metrics);
                            const engagement = (m.likes || 0) + (m.comments || 0) + (m.shares || 0);
                            return {
                                contentPreview: r.contentPreview,
                                platform: r.platform,
                                publishedAt: new Date(r.publishedAt).toISOString(),
                                metrics: {
                                    likes: m.likes || 0,
                                    comments: m.comments || 0,
                                    shares: m.shares || 0,
                                    impressions: m.impressions ?? undefined,
                                    reach: m.reach ?? undefined,
                                    engagementRate: m.engagementRate ?? undefined,
                                },
                                engagement,
                            };
                        })
                        .sort((a, b) => b.engagement - a.engagement);

                    const totals = ranked.reduce(
                        (acc, p) => {
                            acc.likes += p.metrics.likes;
                            acc.comments += p.metrics.comments;
                            acc.shares += p.metrics.shares;
                            acc.impressions += p.metrics.impressions || 0;
                            acc.reach += p.metrics.reach || 0;
                            return acc;
                        },
                        { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 }
                    );

                    return {
                        success: true,
                        source: 'postAnalytics',
                        window: `${days}d`,
                        count: ranked.length,
                        totals: { ...totals, posts: ranked.length },
                        posts: ranked.slice(0, 20),
                        deepLink: '/social/analytics',
                    };
                } catch (error: unknown) {
                    return { success: false, error: error instanceof Error ? error.message : 'Failed to get post performance' };
                }
            },
        }),
};

toolRegistry.register(schedulePostTool);
toolRegistry.register(getAnalyticsTool);
toolRegistry.register(listSocialAccountsTool);
toolRegistry.register(listScheduledPostsTool);
toolRegistry.register(getPostPerformanceTool);

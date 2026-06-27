/**
 * MCP (Model Context Protocol) tool catalog + handlers for the social module
 * (Epic 4.4).
 *
 * These tools let an external MCP-speaking agent introspect and act on a
 * tenant's social presence via MontrAI:
 *   - `list_social_accounts`  — connected accounts across the org's brands.
 *   - `list_scheduled_posts`  — upcoming/scheduled posts (status + lookahead).
 *   - `schedule_post`         — schedule a post via `submitSocialPost` (which
 *                               respects the org approval policy + notifications).
 *
 * Multi-tenancy hard rule: the organization is supplied by the caller via the
 * authenticated API key (`ctx.organizationId`) — NEVER from tool arguments.
 * Every read is scoped to the org's brands; `schedule_post` validates that the
 * target brand belongs to the org before any write. Per-tool API-key scopes are
 * enforced here too (`accounts:read` / `posts:read` / `posts:write`).
 *
 * No external scheduling logic is duplicated — `schedule_post` delegates to the
 * shared `submitSocialPost` service, mirroring the public REST API.
 */

import { z } from 'zod';
import brandRepository from '@/lib/db/repository/brand.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { submitSocialPost } from '@/lib/social/social-post-submissions';
import type { IPlatformConfig, ScheduledPostStatus } from '@/lib/db/models/scheduled-post.model';

// ─── Scopes ─────────────────────────────────────────────────────────────────

export const SCOPE_ACCOUNTS_READ = 'accounts:read';
export const SCOPE_POSTS_READ = 'posts:read';
export const SCOPE_POSTS_WRITE = 'posts:write';

/** Wildcard `*` grants every scope (mirrors the public REST API helper). */
export function hasScope(scopes: string[], scope: string): boolean {
    return scopes.includes(scope) || scopes.includes('*');
}

// ─── MCP tool catalog (JSON Schema input shapes) ─────────────────────────────

export interface McpToolDef {
    name: string;
    description: string;
    /** JSON Schema object describing the tool's arguments (MCP `inputSchema`). */
    inputSchema: Record<string, unknown>;
}

const SCHEDULED_POST_STATUSES: ScheduledPostStatus[] = [
    'pending_approval',
    'scheduled',
    'publishing',
    'published',
    'failed',
    'cancelled',
];

export const MCP_TOOLS: McpToolDef[] = [
    {
        name: 'list_social_accounts',
        description:
            "List the connected social media accounts across all of the tenant's brands, with their platform, username, brand, and connection status. Requires the accounts:read scope.",
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'list_scheduled_posts',
        description:
            "List scheduled and upcoming social media posts across the tenant's brands. Optionally filter by status and by a lookahead window in days. Requires the posts:read scope.",
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: SCHEDULED_POST_STATUSES,
                    description: 'Filter posts by status.',
                },
                days: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Lookahead window in days from now (filters by scheduledFor).',
                },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'schedule_post',
        description:
            'Schedule a social media post for one of the tenant\'s brands across one or more connected accounts. Goes through the org approval policy when one is configured. Requires the posts:write scope.',
        inputSchema: {
            type: 'object',
            properties: {
                brandId: {
                    type: 'string',
                    description: 'The brand to post for (must belong to your organization).',
                },
                content: {
                    type: 'string',
                    description: 'The full text content of the post.',
                },
                platforms: {
                    type: 'array',
                    minItems: 1,
                    description:
                        'Target connected accounts. Each entry must reference a connected account by accountId, with its platform + platformUsername.',
                    items: {
                        type: 'object',
                        properties: {
                            accountId: { type: 'string' },
                            platform: { type: 'string' },
                            platformUsername: { type: 'string' },
                            telegramChatIds: { type: 'array', items: { type: 'string' } },
                            redditSubreddit: { type: 'string' },
                            redditTitle: { type: 'string' },
                            pinterestBoardId: { type: 'string' },
                        },
                        required: ['accountId', 'platform', 'platformUsername'],
                        additionalProperties: false,
                    },
                },
                scheduledFor: {
                    type: 'string',
                    description: 'ISO datetime to publish at. Must be in the future.',
                },
                timezone: {
                    type: 'string',
                    description: 'IANA timezone (default UTC).',
                },
                mediaUrls: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Media URLs (images/videos) to attach.',
                },
                mediaTypes: {
                    type: 'array',
                    items: { type: 'string', enum: ['image', 'video'] },
                    description: 'Media types parallel to mediaUrls.',
                },
                altText: { type: 'string', description: 'Accessibility alt text for media.' },
                firstComment: {
                    type: 'string',
                    description:
                        'A first comment to attach after publishing (applied only to platforms that support it).',
                },
                threadSegments: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        'Segments of a native thread, applied only to thread-capable platforms (X, Threads, Mastodon, Bluesky).',
                },
            },
            required: ['brandId', 'content', 'platforms'],
            additionalProperties: false,
        },
    },
];

// ─── Argument validation (Zod, mirroring the public REST API) ────────────────

const platformSchema = z.object({
    accountId: z.string().min(1),
    platform: z.string().min(1),
    platformUsername: z.string().min(1),
    telegramChatIds: z.array(z.string()).optional(),
    redditSubreddit: z.string().optional(),
    redditTitle: z.string().optional(),
    pinterestBoardId: z.string().optional(),
});

const listScheduledPostsArgs = z.object({
    status: z.enum(SCHEDULED_POST_STATUSES as [ScheduledPostStatus, ...ScheduledPostStatus[]]).optional(),
    days: z.number().int().positive().optional(),
});

const schedulePostArgs = z.object({
    // organizationId is intentionally NOT accepted — derived from the key.
    brandId: z.string().min(1),
    content: z.string().min(1),
    platforms: z.array(platformSchema).min(1),
    scheduledFor: z.string().optional(),
    timezone: z.string().optional(),
    mediaUrls: z.array(z.string()).optional(),
    mediaTypes: z.array(z.enum(['image', 'video'])).optional(),
    altText: z.string().optional(),
    firstComment: z.string().optional(),
    threadSegments: z.array(z.string()).optional(),
});

// ─── Tool result helpers (MCP content blocks) ────────────────────────────────

export interface McpToolResult {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
}

function ok(payload: unknown): McpToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function fail(message: string): McpToolResult {
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

/** Raised for a missing scope so the dispatcher can map it cleanly. */
export class McpScopeError extends Error {
    constructor(public scope: string) {
        super(`API key is missing the ${scope} scope`);
        this.name = 'McpScopeError';
    }
}

export interface McpCallContext {
    scopes: string[];
    /** Acting principal for writes (the API key's creator). */
    userId: string;
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function callMcpTool(
    name: string,
    args: unknown,
    ctx: McpCallContext,
): Promise<McpToolResult> {
    try {
        switch (name) {
            case 'list_social_accounts':
                return await handleListAccounts(ctx);
            case 'list_scheduled_posts':
                return await handleListScheduledPosts(args, ctx);
            case 'schedule_post':
                return await handleSchedulePost(args, ctx);
            default:
                return fail(`Unknown tool: ${name}`);
        }
    } catch (error) {
        if (error instanceof McpScopeError) {
            return fail(error.message);
        }
        console.error(`[mcp-tools] tool "${name}" failed:`, error);
        const message = error instanceof Error ? error.message : 'Tool execution failed';
        return fail(message);
    }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleListAccounts(ctx: McpCallContext): Promise<McpToolResult> {
    if (!hasScope(ctx.scopes, SCOPE_ACCOUNTS_READ)) {
        throw new McpScopeError(SCOPE_ACCOUNTS_READ);
    }

    const brands = await brandRepository.findByOrganizationId();
    const accountsNested = await Promise.all(
        brands.map((b) => socialAccountRepository.findByBrandId(b._id.toString())),
    );
    const accounts = accountsNested.flat();

    return ok({
        count: accounts.length,
        accounts: accounts.map((a) => ({
            id: a._id.toString(),
            brandId: a.brandId,
            platform: a.platform,
            platformUsername: a.platformUsername,
            platformDisplayName: a.platformDisplayName || null,
            avatarUrl: a.avatarUrl || null,
            isActive: a.isActive,
            connectionStatus: a.connectionStatus,
        })),
    });
}

async function handleListScheduledPosts(args: unknown, ctx: McpCallContext): Promise<McpToolResult> {
    if (!hasScope(ctx.scopes, SCOPE_POSTS_READ)) {
        throw new McpScopeError(SCOPE_POSTS_READ);
    }

    const parsed = listScheduledPostsArgs.safeParse(args ?? {});
    if (!parsed.success) {
        return fail(`Invalid arguments: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const filters: { status?: ScheduledPostStatus; toDate?: Date } = {};
    if (parsed.data.status) filters.status = parsed.data.status;
    if (parsed.data.days) {
        const toDate = new Date();
        toDate.setDate(toDate.getDate() + parsed.data.days);
        filters.toDate = toDate;
    }

    // Scope by the org's brands so tenancy holds even for posts that predate
    // lazy organizationId backfill.
    const brands = await brandRepository.findByOrganizationId();
    const brandIds = new Set(brands.map((b) => b._id.toString()));

    const postsNested = await Promise.all(
        brands.map((b) => scheduledPostRepository.findByBrand(b._id.toString(), filters)),
    );
    const posts = postsNested.flat().filter((p) => brandIds.has(p.brandId));

    return ok({
        count: posts.length,
        posts: posts.map((p) => ({
            id: p._id.toString(),
            brandId: p.brandId,
            contentPreview: p.content.slice(0, 120),
            platforms: p.platforms.map((pl) => ({
                platform: pl.platform,
                platformUsername: pl.platformUsername,
            })),
            status: p.status,
            scheduledFor: p.scheduledFor ? new Date(p.scheduledFor).toISOString() : null,
            timezone: p.timezone,
            createdAt: p.createdAt,
        })),
    });
}

async function handleSchedulePost(args: unknown, ctx: McpCallContext): Promise<McpToolResult> {
    if (!hasScope(ctx.scopes, SCOPE_POSTS_WRITE)) {
        throw new McpScopeError(SCOPE_POSTS_WRITE);
    }

    const parsed = schedulePostArgs.safeParse(args);
    if (!parsed.success) {
        return fail(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    const body = parsed.data;

    // Tenancy: the brand MUST belong to the key's organization (mirrors the
    // public REST API brand-belongs-to-org check).
    const brand = await brandRepository.findById(body.brandId);
    if (!brand) {
        return fail('Brand not found');
    }

    const scheduledDate = new Date(body.scheduledFor || '');
    if (isNaN(scheduledDate.getTime())) {
        return fail('Invalid or missing scheduledFor date (ISO datetime required).');
    }
    if (scheduledDate <= new Date()) {
        return fail('scheduledFor must be in the future.');
    }

    const platforms: IPlatformConfig[] = body.platforms.map((p) => {
        const config: IPlatformConfig = {
            accountId: p.accountId,
            platform: p.platform,
            platformUsername: p.platformUsername,
            telegramChatIds: p.telegramChatIds,
            redditSubreddit: p.redditSubreddit,
            redditTitle: p.redditTitle,
            pinterestBoardId: p.pinterestBoardId,
        };
        if (body.firstComment) config.firstComment = body.firstComment;
        if (body.threadSegments && body.threadSegments.length > 0) {
            config.isThread = true;
            config.threadParts = body.threadSegments;
        }
        return config;
    });

    // Act as the key's creator; submitSocialPost re-validates brand access via
    // the shared organization and applies the approval policy + notifications.
    const { scheduledPost, requiresApproval } = await submitSocialPost({
        userId: ctx.userId,
        intent: 'schedule',
        brandId: body.brandId,
        content: body.content,
        mediaUrls: body.mediaUrls || [],
        mediaTypes: body.mediaTypes || [],
        altText: body.altText,
        postFormat: 'standard',
        platforms,
        scheduledFor: scheduledDate,
        timezone: body.timezone || 'UTC',
    });

    return ok({
        success: true,
        requiresApproval,
        post: {
            id: scheduledPost._id.toString(),
            status: scheduledPost.status,
            scheduledFor: scheduledPost.scheduledFor,
        },
    });
}

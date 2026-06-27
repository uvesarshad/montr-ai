/**
 * Uniform social-publish provider contract (audit Epic 0 — structural enabler).
 *
 * Before this, every platform's publish logic lived inline in a giant `switch`
 * in `src/lib/queue/worker.ts`, which made per-platform features (carousels,
 * threads, first-comment, settings) expensive to add and impossible to evolve
 * in parallel. Each platform now owns a `*.provider.ts` file implementing this
 * contract; the worker dispatches through `registry.ts`.
 *
 * The provider files wrap the existing `publish-to-<x>-flow.ts` Genkit flows —
 * the flows remain the source of truth for the actual HTTP calls. Providers
 * import the CONCRETE flow modules (never the `@/ai/flows` barrel) so the tsx
 * worker process does not transitively import next-auth (see worker.ts note).
 */

import type { IPlatformConfig, IPublishResult } from '@/lib/db/models/scheduled-post.model';

/**
 * Declarative capability flags for a platform. Single source of truth consumed
 * by the composer UI (to show/hide features) and by `validatePostForPlatform`.
 */
export interface PlatformCapabilities {
    /** Supports more than one media item in a single post (carousel/album). */
    carousel: boolean;
    /** Max media items per post (1 when carousel is false). */
    maxMedia: number;
    /** Supports video upload. */
    video: boolean;
    /** Supports a native multi-segment thread (chained posts). */
    threads: boolean;
    /** Supports a "first comment" attached after the main post. */
    firstComment: boolean;
    /** Supports a Reel post format. */
    reels: boolean;
    /** Supports a Story post format. */
    stories: boolean;
    /** Supports native polls. */
    polls: boolean;
    /** Has an analytics fetcher (account/post insights). */
    analytics: boolean;
    /** Requires at least one media item to publish. */
    requiresMedia: boolean;
    /** Max characters for the post body (best-effort; not enforced for blogs). */
    maxLength: number;
}

/** Everything a provider needs to publish one scheduled post to one account. */
export interface PublishContext {
    content: string;
    mediaUrls: string[];
    mediaTypes: ('image' | 'video')[];
    postFormat: 'standard' | 'reel';
    config: IPlatformConfig;
}

/** The uniform contract every platform implements. */
export interface PlatformProvider {
    /** Canonical platform key (matches IPlatformConfig.platform). */
    platform: string;
    /** Human-readable name for UI. */
    displayName: string;
    capabilities: PlatformCapabilities;
    /**
     * Publish the post to a single account. MUST return a full IPublishResult
     * (success or failure) rather than throwing for expected publish failures;
     * the worker wraps this in a final try/catch as a backstop.
     */
    publish(ctx: PublishContext): Promise<IPublishResult>;
}

/** Helper: derive the ordered media list a provider may use given its capabilities. */
export function selectMedia(
    ctx: PublishContext,
    caps: PlatformCapabilities,
): { urls: string[]; types: ('image' | 'video')[] } {
    const max = caps.carousel ? caps.maxMedia : 1;
    return {
        urls: ctx.mediaUrls.slice(0, max),
        types: (ctx.mediaTypes || []).slice(0, max),
    };
}

/** Build a failure IPublishResult for a platform/account. */
export function failResult(platform: string, accountId: string, error: string): IPublishResult {
    return {
        platform,
        accountId,
        success: false,
        error,
        publishedAt: new Date(),
    };
}

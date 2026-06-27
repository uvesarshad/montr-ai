/**
 * AI endpoint rate limiting.
 *
 * Expensive AI routes (workflow generation, agent chat, copilot, image/video
 * generation, template generation, etc.) are gated per authenticated user to
 * stop scripted clients from bleeding credits or running up provider bills.
 *
 * Falls open if Redis is down — these endpoints are not security-critical,
 * just expensive; we'd rather degrade gracefully than block legitimate users.
 */

import { NextResponse } from 'next/server';
import { checkRateLimitGeneric, getClientIp } from '@/lib/rate-limiter';

export type AiRateLimitBucket =
    | 'ai:workflow-generate'
    | 'ai:copilot-chat'
    | 'ai:agent-chat'
    | 'ai:marketing-email-template'
    | 'ai:social-enhance'
    | 'ai:social-ideas'
    | 'ai:social-hashtags'
    | 'ai:social-translate'
    | 'ai:social-repurpose'
    | 'ai:social-image'
    | 'ai:social-slideshow'
    | 'ai:chatbot'
    | 'ai:ads-copy'
    | 'ai:ads-insights'
    | 'ai:default';

interface BucketPolicy {
    limit: number;
    windowSeconds: number;
}

// Per-user limits. Set conservatively — a real user clicking through the UI
// won't bump these; a script that holds the button down will.
const POLICIES: Record<AiRateLimitBucket, BucketPolicy> = {
    'ai:workflow-generate': { limit: 20, windowSeconds: 60 * 60 },
    'ai:copilot-chat': { limit: 60, windowSeconds: 60 },
    'ai:agent-chat': { limit: 60, windowSeconds: 60 },
    'ai:marketing-email-template': { limit: 30, windowSeconds: 60 * 60 },
    'ai:social-enhance': { limit: 60, windowSeconds: 60 },
    'ai:social-ideas': { limit: 30, windowSeconds: 60 },
    'ai:social-hashtags': { limit: 60, windowSeconds: 60 },
    'ai:social-translate': { limit: 60, windowSeconds: 60 },
    'ai:social-repurpose': { limit: 30, windowSeconds: 60 },
    'ai:social-image': { limit: 20, windowSeconds: 60 * 60 },
    'ai:social-slideshow': { limit: 6, windowSeconds: 60 * 60 }, // heavy: images + TTS + ffmpeg
    'ai:chatbot': { limit: 60, windowSeconds: 60 },
    'ai:ads-copy': { limit: 30, windowSeconds: 60 * 60 },
    'ai:ads-insights': { limit: 10, windowSeconds: 60 * 60 },
    'ai:default': { limit: 30, windowSeconds: 60 },
};

/**
 * Apply AI rate limit for a specific bucket. `userId` is the canonical key when
 * available; anonymous/internal callers fall back to IP so the path stays
 * protected even without a session.
 *
 * Returns a 429 NextResponse to short-circuit the handler, or null to proceed.
 */
export async function applyAiRateLimit(
    request: Request,
    bucket: AiRateLimitBucket,
    userId?: string | null,
): Promise<NextResponse | null> {
    const policy = POLICIES[bucket] ?? POLICIES['ai:default'];
    const identifier = userId ?? `ip:${getClientIp(request.headers)}`;

    const result = await checkRateLimitGeneric({
        bucket,
        identifier,
        limit: policy.limit,
        windowSeconds: policy.windowSeconds,
        // AI routes are expensive but not security-critical — fail open if
        // Redis is unavailable so a momentary outage doesn't block real work.
        failMode: 'open',
    });

    if (!result.allowed) {
        return NextResponse.json(
            {
                error: 'AI rate limit exceeded. Slow down and retry shortly.',
                retryAfter: result.retryAfter,
            },
            { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
        );
    }

    return null;
}

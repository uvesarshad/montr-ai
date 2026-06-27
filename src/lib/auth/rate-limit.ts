/**
 * Auth-route rate limiting.
 *
 * Brute-force protection for login, signup, OTP, password-reset, and similar
 * unauthenticated endpoints. Limits are intentionally tight (per-IP and, where
 * we know it, per-target-identifier) and fail closed when Redis is unavailable
 * — silently disabling rate limiting on the only endpoints that protect the
 * account-recovery surface is exactly what we want to avoid.
 *
 * Returns a 429 response when the bucket is full; the route handler should
 * return that response unchanged.
 */

import { NextResponse } from 'next/server';
import { checkRateLimitGeneric, getClientIp } from '@/lib/rate-limiter';

export type AuthRateLimitBucket =
    | 'auth:login'
    | 'auth:signup'
    | 'auth:forgot-password'
    | 'auth:reset-password'
    | 'auth:send-otp'
    | 'auth:verify-email'
    | 'auth:update-password';

interface BucketPolicy {
    limit: number;
    windowSeconds: number;
}

const POLICIES: Record<AuthRateLimitBucket, BucketPolicy> = {
    'auth:login': { limit: 10, windowSeconds: 15 * 60 },
    'auth:signup': { limit: 5, windowSeconds: 60 * 60 },
    'auth:forgot-password': { limit: 5, windowSeconds: 15 * 60 },
    'auth:reset-password': { limit: 10, windowSeconds: 15 * 60 },
    'auth:send-otp': { limit: 3, windowSeconds: 5 * 60 },
    'auth:verify-email': { limit: 20, windowSeconds: 15 * 60 },
    'auth:update-password': { limit: 10, windowSeconds: 15 * 60 },
};

/**
 * Apply rate limiting for an auth endpoint. Returns a 429 NextResponse when
 * the request should be rejected, or null when it can proceed. Always fails
 * closed (denies) when Redis is unavailable.
 *
 * Pass `target` (typically an email or user-id) when the endpoint is keyed to
 * a specific account — the limit then applies per IP AND per target, so an
 * attacker can't cycle IPs to brute one account while a victim recycling IPs
 * doesn't accidentally lock their own legitimate retries from one source.
 */
export async function applyAuthRateLimit(
    request: Request,
    bucket: AuthRateLimitBucket,
    target?: string,
): Promise<NextResponse | null> {
    const policy = POLICIES[bucket];
    const ip = getClientIp(request.headers);

    // Check per-IP limit first.
    const perIp = await checkRateLimitGeneric({
        bucket: `${bucket}:ip`,
        identifier: ip,
        limit: policy.limit,
        windowSeconds: policy.windowSeconds,
        failMode: 'closed',
    });
    if (!perIp.allowed) {
        return NextResponse.json(
            {
                error: perIp.enforced
                    ? 'Too many requests. Please try again later.'
                    : 'Service temporarily unavailable. Please try again later.',
            },
            { status: 429, headers: { 'Retry-After': String(perIp.retryAfter) } },
        );
    }

    // Optionally check per-target limit (e.g. per email for forgot-password).
    if (target) {
        const perTarget = await checkRateLimitGeneric({
            bucket: `${bucket}:target`,
            identifier: target.toLowerCase(),
            limit: policy.limit,
            windowSeconds: policy.windowSeconds,
            failMode: 'closed',
        });
        if (!perTarget.allowed) {
            return NextResponse.json(
                {
                    error: perTarget.enforced
                        ? 'Too many requests for this account. Please try again later.'
                        : 'Service temporarily unavailable. Please try again later.',
                },
                { status: 429, headers: { 'Retry-After': String(perTarget.retryAfter) } },
            );
        }
    }

    return null;
}

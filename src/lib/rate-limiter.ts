import { getRedisClient, isRedisAvailable } from './redis';

/**
 * Rate limiter for social media API calls
 * 
 * Tracks API usage per platform and enforces limits
 */

interface RateLimitConfig {
    maxRequests: number;
    windowSeconds: number;
}

// Platform-specific rate limits (conservative estimates)
const PLATFORM_LIMITS: Record<string, RateLimitConfig> = {
    twitter: { maxRequests: 300, windowSeconds: 900 },      // 300 per 15 min
    linkedin: { maxRequests: 100, windowSeconds: 86400 },   // 100 per day
    facebook: { maxRequests: 200, windowSeconds: 3600 },    // 200 per hour
    instagram: { maxRequests: 200, windowSeconds: 3600 },   // 200 per hour
    tiktok: { maxRequests: 100, windowSeconds: 86400 },     // 100 per day
    pinterest: { maxRequests: 1000, windowSeconds: 3600 },  // 1000 per hour
    youtube: { maxRequests: 10000, windowSeconds: 86400 },  // 10000 per day
    reddit: { maxRequests: 60, windowSeconds: 60 },         // 60 per minute
    threads: { maxRequests: 200, windowSeconds: 3600 },     // 200 per hour
    dribbble: { maxRequests: 100, windowSeconds: 3600 },    // 100 per hour
};

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number;  // seconds until reset
    limit: number;
}

/**
 * Check if a request is within rate limits
 */
export async function checkRateLimit(
    platform: string,
    accountId: string
): Promise<RateLimitResult> {
    const config = PLATFORM_LIMITS[platform] || { maxRequests: 100, windowSeconds: 3600 };
    const key = `ratelimit:${platform}:${accountId}`;

    try {
        const available = await isRedisAvailable();
        if (!available) {
            // If Redis unavailable, allow request but log warning
            console.warn('Redis unavailable for rate limiting');
            return {
                allowed: true,
                remaining: config.maxRequests,
                resetIn: config.windowSeconds,
                limit: config.maxRequests,
            };
        }

        const redis = getRedisClient();
        const now = Math.floor(Date.now() / 1000);
        const windowStart = now - config.windowSeconds;

        // Remove old entries
        await redis.zremrangebyscore(key, 0, windowStart);

        // Count current requests
        const currentCount = await redis.zcard(key);

        if (currentCount >= config.maxRequests) {
            // Get oldest entry to calculate reset time
            const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
            const oldestTime = oldest.length > 1 ? parseInt(oldest[1]) : now;
            const resetIn = Math.max(0, oldestTime + config.windowSeconds - now);

            return {
                allowed: false,
                remaining: 0,
                resetIn,
                limit: config.maxRequests,
            };
        }

        return {
            allowed: true,
            remaining: config.maxRequests - currentCount,
            resetIn: config.windowSeconds,
            limit: config.maxRequests,
        };
    } catch (error) {
        console.error('Rate limit check error:', error);
        return {
            allowed: true,
            remaining: config.maxRequests,
            resetIn: config.windowSeconds,
            limit: config.maxRequests,
        };
    }
}

/**
 * Record a request for rate limiting
 */
export async function recordRequest(
    platform: string,
    accountId: string
): Promise<void> {
    const config = PLATFORM_LIMITS[platform] || { maxRequests: 100, windowSeconds: 3600 };
    const key = `ratelimit:${platform}:${accountId}`;

    try {
        const available = await isRedisAvailable();
        if (!available) return;

        const redis = getRedisClient();
        const now = Math.floor(Date.now() / 1000);

        // Add request timestamp
        await redis.zadd(key, now, `${now}:${Math.random()}`);

        // Set expiry on the key
        await redis.expire(key, config.windowSeconds);
    } catch (error) {
        console.error('Rate limit record error:', error);
    }
}

/**
 * Get rate limit status for all platforms for an account
 */
export async function getRateLimitStatus(
    accountId: string
): Promise<Record<string, RateLimitResult>> {
    const results: Record<string, RateLimitResult> = {};

    const platforms = Object.keys(PLATFORM_LIMITS);
    const checked = await Promise.all(
        platforms.map(platform => checkRateLimit(platform, accountId))
    );
    platforms.forEach((platform, i) => {
        results[platform] = checked[i];
    });

    return results;
}

/**
 * Check if near rate limit (80% used)
 */
export function isNearLimit(result: RateLimitResult): boolean {
    return result.remaining < result.limit * 0.2;
}

export { PLATFORM_LIMITS };

// ---------------------------------------------------------------------------
// Generic sliding-window rate limiter
// ---------------------------------------------------------------------------

export interface GenericRateLimitOptions {
    /** Unique bucket name — used as the Redis key prefix. */
    bucket: string;
    /** Per-bucket identifier (IP, userId, etc.). */
    identifier: string;
    /** Maximum requests permitted per window. */
    limit: number;
    /** Window length in seconds. */
    windowSeconds: number;
    /**
     * Behaviour when Redis is unavailable.
     *   - "open"   (default): allow the request. Use for best-effort throttling.
     *   - "closed": deny the request. Use for auth-critical paths where a
     *     missing Redis must not silently disable protection.
     */
    failMode?: 'open' | 'closed';
}

export interface GenericRateLimitResult {
    allowed: boolean;
    remaining: number;
    /** Seconds until the oldest entry rolls off (i.e. when one more slot opens). */
    retryAfter: number;
    /** True iff Redis was actually consulted. */
    enforced: boolean;
}

/**
 * Generic per-identifier rate limit. Increments only when allowed so failed
 * attempts don't burn slots from a successful follow-up. Choose `failMode`
 * deliberately — use 'closed' for login/signup/forgot-password, 'open' for
 * best-effort throttling like UI button spam.
 */
export async function checkRateLimitGeneric(
    options: GenericRateLimitOptions,
): Promise<GenericRateLimitResult> {
    const { bucket, identifier, limit, windowSeconds } = options;
    const failMode = options.failMode ?? 'open';
    const key = `ratelimit:${bucket}:${identifier}`;

    try {
        const available = await isRedisAvailable();
        if (!available) {
            if (failMode === 'closed') {
                return {
                    allowed: false,
                    remaining: 0,
                    retryAfter: windowSeconds,
                    enforced: false,
                };
            }
            return {
                allowed: true,
                remaining: limit,
                retryAfter: windowSeconds,
                enforced: false,
            };
        }

        const redis = getRedisClient();
        const now = Math.floor(Date.now() / 1000);
        const windowStart = now - windowSeconds;

        await redis.zremrangebyscore(key, 0, windowStart);
        const current = await redis.zcard(key);

        if (current >= limit) {
            const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
            const oldestTime = oldest.length > 1 ? parseInt(oldest[1]) : now;
            const retryAfter = Math.max(1, oldestTime + windowSeconds - now);
            return { allowed: false, remaining: 0, retryAfter, enforced: true };
        }

        await redis.zadd(key, now, `${now}:${Math.random()}`);
        await redis.expire(key, windowSeconds);

        return {
            allowed: true,
            remaining: limit - current - 1,
            retryAfter: windowSeconds,
            enforced: true,
        };
    } catch (error) {
        console.error(`Rate limit (${bucket}) error:`, error);
        if (failMode === 'closed') {
            return {
                allowed: false,
                remaining: 0,
                retryAfter: windowSeconds,
                enforced: false,
            };
        }
        return {
            allowed: true,
            remaining: limit,
            retryAfter: windowSeconds,
            enforced: false,
        };
    }
}

/** Extract the client IP from a Next.js request, with a stable fallback. */
/**
 * Extract the client IP from a Next.js request.
 *
 * `x-forwarded-for` is a comma-separated chain — the rightmost entries are
 * trusted proxies between us and the client. An attacker who can hit the
 * origin directly (or who sits behind a trusted proxy that forwards their
 * own bogus `x-forwarded-for`) can stuff this header to forge an arbitrary
 * "client IP". To avoid that we trust only the last `TRUST_PROXY_DEPTH`
 * entries — i.e. `xff[xff.length - 1 - TRUST_PROXY_DEPTH]` is the real
 * client IP.
 *
 * Set `TRUST_PROXY_DEPTH=1` if you run behind a single load balancer,
 * `=2` if there's a CDN in front, etc. Default is 1 (single proxy is the
 * common case). Set `=0` to ignore xff entirely and use the connection IP.
 */
export function getClientIp(headers: Headers): string {
    const depth = parseInt(process.env.TRUST_PROXY_DEPTH || '1', 10);

    if (depth > 0) {
        const fwd = headers.get('x-forwarded-for');
        if (fwd) {
            const parts = fwd.split(',').map(s => s.trim()).filter(Boolean);
            if (parts.length > 0) {
                // Walk from the right past `depth` trusted proxies.
                const index = Math.max(0, parts.length - depth);
                const candidate = parts[index];
                if (candidate) return candidate;
            }
        }

        // x-real-ip is set by a single proxy hop; safe iff depth >= 1.
        const realIp = headers.get('x-real-ip');
        if (realIp) return realIp.trim();
    }

    return 'unknown';
}

// ---------------------------------------------------------------------------
// IP-based rate limiter for public form submissions
// Limit: 10 submissions per IP per form per hour
// ---------------------------------------------------------------------------

const FORM_SUBMISSION_LIMIT = 10;
const FORM_SUBMISSION_WINDOW_SECONDS = 3600;

export async function checkFormSubmissionRateLimit(
    formId: string,
    ip: string
): Promise<{ allowed: boolean; retryAfter: number }> {
    const key = `form_submit:${formId}:${ip}`;

    try {
        const available = await isRedisAvailable();
        if (!available) {
            return { allowed: true, retryAfter: 0 };
        }

        const redis = getRedisClient();
        const now = Math.floor(Date.now() / 1000);
        const windowStart = now - FORM_SUBMISSION_WINDOW_SECONDS;

        await redis.zremrangebyscore(key, 0, windowStart);
        const count = await redis.zcard(key);

        if (count >= FORM_SUBMISSION_LIMIT) {
            const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
            const oldestTime = oldest.length > 1 ? parseInt(oldest[1]) : now;
            const retryAfter = Math.max(0, oldestTime + FORM_SUBMISSION_WINDOW_SECONDS - now);
            return { allowed: false, retryAfter };
        }

        await redis.zadd(key, now, `${now}:${Math.random()}`);
        await redis.expire(key, FORM_SUBMISSION_WINDOW_SECONDS);

        return { allowed: true, retryAfter: 0 };
    } catch {
        return { allowed: true, retryAfter: 0 };
    }
}

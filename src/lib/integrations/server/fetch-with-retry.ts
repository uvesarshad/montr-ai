/**
 * fetchWithRetry — shared resilience wrapper for the integration service layer.
 *
 * Retries transient failures (network errors, HTTP 429, HTTP 5xx) with
 * exponential backoff + jitter, honoring a `Retry-After` header (seconds or an
 * HTTP date) capped at 60s. Everything else (2xx, 3xx, 4xx other than 429) is
 * returned to the caller untouched — same Response object, same throw behavior.
 *
 * It is fetch-implementation agnostic: services that route through the SSRF
 * guard (`safeOutboundFetch`) keep doing so by passing it as `fetchImpl`.
 * Default is `globalThis.fetch`.
 *
 * Design notes:
 *  - Pass-through for happy paths: a successful first attempt incurs zero extra
 *    work beyond reading the status code.
 *  - We never clone/consume the response body here — the caller owns it.
 *  - `signal` on the caller's RequestInit is respected across attempts (an
 *    already-aborted signal stops retries immediately).
 */

/**
 * Minimal response shape the retry logic needs. Both the DOM `Response` and
 * undici's `Response` (what `safeOutboundFetch` returns) satisfy it, so callers
 * using either fetch impl type-check without coupling this file to undici.
 */
interface RetryableResponse {
    status: number;
    headers: { get(name: string): string | null };
}

/** A fetch-shaped function. globalThis.fetch and safeOutboundFetch both satisfy it. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<RetryableResponse>;

export interface FetchWithRetryOptions {
    /** Max total attempts including the first. Default 3. */
    maxAttempts?: number;
    /** Base backoff in ms (attempt N waits ~base * 2^(N-1) + jitter). Default 500. */
    baseDelayMs?: number;
    /** Upper bound on any single wait, including Retry-After. Default 60_000. */
    maxDelayMs?: number;
    /** fetch implementation to use. Default globalThis.fetch. */
    fetchImpl?: FetchLike;
    /** Optional label for log lines. */
    label?: string;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 60_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Parse a `Retry-After` header into milliseconds.
 * Accepts either a delta-seconds integer or an HTTP date. Returns null when the
 * header is absent/unparseable, and clamps the result to [0, maxDelayMs].
 */
export function parseRetryAfter(headerValue: string | null, maxDelayMs: number, now = Date.now()): number | null {
    if (!headerValue) return null;
    const trimmed = headerValue.trim();
    if (trimmed === '') return null;

    // delta-seconds form
    if (/^\d+$/.test(trimmed)) {
        const seconds = Number(trimmed);
        if (!Number.isFinite(seconds)) return null;
        return Math.min(Math.max(seconds * 1000, 0), maxDelayMs);
    }

    // HTTP-date form
    const dateMs = Date.parse(trimmed);
    if (Number.isNaN(dateMs)) return null;
    const delta = dateMs - now;
    return Math.min(Math.max(delta, 0), maxDelayMs);
}

/** Exponential backoff with full jitter for attempt number `attempt` (1-based). */
function backoffWithJitter(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    const exp = baseDelayMs * 2 ** (attempt - 1);
    const capped = Math.min(exp, maxDelayMs);
    // Full jitter: random in [0, capped].
    return Math.floor(Math.random() * capped);
}

function isAbortError(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
    );
}

/**
 * fetch with automatic retry of transient failures.
 *
 * Returns the final Response (which may itself be a 429/5xx if retries were
 * exhausted — the caller's existing `!response.ok` handling still applies).
 * Re-throws the last network error if every attempt failed at the transport
 * layer. Caller-initiated aborts/timeouts are never retried.
 */
export async function fetchWithRetry<R extends RetryableResponse = Response>(
    url: string,
    init?: RequestInit,
    opts: FetchWithRetryOptions = {}
): Promise<R> {
    const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    const doFetch = (opts.fetchImpl ??
        (globalThis.fetch.bind(globalThis) as FetchLike)) as (
        url: string,
        init?: RequestInit
    ) => Promise<R>;
    const label = opts.label ?? 'integration';

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Honor a caller signal that aborted between attempts.
        const signal = init?.signal;
        if (signal && 'aborted' in signal && signal.aborted) {
            throw lastError ?? new DOMException('Aborted', 'AbortError');
        }

        let response: R;
        try {
            response = await doFetch(url, init);
        } catch (error) {
            // Caller-initiated abort/timeout: do not retry, propagate immediately.
            if (isAbortError(error)) throw error;

            lastError = error;
            if (attempt >= maxAttempts) throw error;

            const wait = backoffWithJitter(attempt, baseDelayMs, maxDelayMs);
            console.warn(
                `[fetchWithRetry:${label}] network error on attempt ${attempt}/${maxAttempts}, retrying in ${wait}ms — ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            await sleep(wait);
            continue;
        }

        // Non-retryable status (2xx/3xx/4xx-other) → hand back to the caller.
        if (!isRetryableStatus(response.status)) {
            return response;
        }

        // Out of attempts — return the failing response so the caller's error
        // handling produces its usual message.
        if (attempt >= maxAttempts) {
            return response;
        }

        const retryAfter = parseRetryAfter(response.headers.get('retry-after'), maxDelayMs);
        const wait = retryAfter ?? backoffWithJitter(attempt, baseDelayMs, maxDelayMs);
        console.warn(
            `[fetchWithRetry:${label}] HTTP ${response.status} on attempt ${attempt}/${maxAttempts}, retrying in ${wait}ms`
        );
        await sleep(wait);
    }

    // Unreachable in practice (loop always returns/throws), but satisfies types.
    throw lastError ?? new Error(`[fetchWithRetry:${label}] exhausted retries`);
}

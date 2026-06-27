/**
 * URL short-linking (Epic 6).
 *
 * `shortenUrlsInText(text, organizationId)` finds every http(s) URL in the
 * supplied text and, IF a shortener is configured via env, replaces each with a
 * shortened link. Provider precedence:
 *   1. `DUB_API_KEY`     → dub.co (https://api.dub.co/links)
 *   2. `SHORTIO_API_KEY` → short.io (https://api.short.io/links)
 *   3. none configured   → text returned unchanged
 *
 * All outbound calls go through `safeOutboundFetch` (SSRF-guarded). The function
 * is defensive: any error shortening a given URL leaves that URL untouched, and
 * the whole call can never throw to the caller — wire it from the worker before
 * publishing so links in post content are wrapped/trackable.
 */

import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';

const URL_REGEX = /https?:\/\/[^\s<>"')]+/g;
const SHORTEN_TIMEOUT_MS = 6000;

type Shortener = (url: string) => Promise<string>;

function getShortener(): Shortener | null {
    const dubKey = process.env.DUB_API_KEY;
    if (dubKey) {
        return async (url: string) => shortenWithDub(url, dubKey);
    }
    const shortioKey = process.env.SHORTIO_API_KEY;
    if (shortioKey) {
        return async (url: string) => shortenWithShortIo(url, shortioKey);
    }
    return null;
}

async function shortenWithDub(url: string, apiKey: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SHORTEN_TIMEOUT_MS);
    try {
        const res = await safeOutboundFetch('https://api.dub.co/links', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
            signal: controller.signal,
        });
        if (!res.ok) return url;
        const data = (await res.json()) as { shortLink?: string };
        return typeof data.shortLink === 'string' && data.shortLink ? data.shortLink : url;
    } catch {
        return url;
    } finally {
        clearTimeout(timer);
    }
}

async function shortenWithShortIo(url: string, apiKey: string): Promise<string> {
    const domain = process.env.SHORTIO_DOMAIN;
    if (!domain) return url; // short.io requires a configured domain
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SHORTEN_TIMEOUT_MS);
    try {
        const res = await safeOutboundFetch('https://api.short.io/links', {
            method: 'POST',
            headers: {
                Authorization: apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ originalURL: url, domain }),
            signal: controller.signal,
        });
        if (!res.ok) return url;
        const data = (await res.json()) as { shortURL?: string };
        return typeof data.shortURL === 'string' && data.shortURL ? data.shortURL : url;
    } catch {
        return url;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Replace http(s) URLs in `text` with shortened links when a shortener is
 * configured. Returns the original text unchanged when no provider is set or on
 * any error. `organizationId` is accepted for future per-org config / analytics
 * scoping and to keep the worker call site tenant-aware.
 */
export async function shortenUrlsInText(
    text: string
): Promise<string> {
    try {
        if (!text) return text;
        const shorten = getShortener();
        if (!shorten) return text;

        const matches = Array.from(new Set(text.match(URL_REGEX) ?? []));
        if (!matches.length) return text;

        // Shorten unique URLs once, then substitute all occurrences.
        const replacements = await Promise.all(
            matches.map(async (url) => {
                try {
                    const short = await shorten(url);
                    return [url, short] as const;
                } catch {
                    return [url, url] as const;
                }
            }),
        );

        let result = text;
        for (const [original, short] of replacements) {
            if (short && short !== original) {
                result = result.split(original).join(short);
            }
        }
        return result;
    } catch {
        return text;
    }
}

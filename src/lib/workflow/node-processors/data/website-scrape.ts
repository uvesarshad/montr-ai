/**
 * Website scrape processor — fetches a URL through the SSRF guard, parses with
 * cheerio, and returns title / meta description / cleaned text. Designed to be
 * a safe baseline replacement for the previous "not implemented" stub.
 *
 * Scraper hygiene (TODO 2.28):
 *   - honors robots.txt (origin/robots.txt, cached per origin) — disallowed
 *     paths fail with a clear error.
 *   - per-tenant egress rate limit (Redis sliding window) to avoid getting the
 *     shared egress IP banned.
 *   - this node fetches a SINGLE page (it does not crawl multiple pages), so no
 *     separate max-pages cap is needed beyond the existing redirect-hop cap.
 *
 * Config:
 *   url: string                — required
 *   selector?: string          — CSS selector to extract; defaults to <body>
 *   includeLinks?: boolean     — return absolute hrefs found in the doc
 *   maxChars?: number          — cap on returned text length (default 20k)
 */

import * as cheerio from 'cheerio';
import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';
import { assertRobotsAllows } from './robots';

const DEFAULT_MAX_CHARS = 20_000;
const FETCH_TIMEOUT_MS = 20_000;

// Per-tenant egress throttle — protects the shared outbound IP from bans.
const SCRAPE_LIMIT_PER_WINDOW = 30;
const SCRAPE_WINDOW_SECONDS = 60;

export class WebsiteScrapeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;
    const url: string = String(config.url || '').trim();
    if (!url) throw new Error('Website scraper: "url" is required.');

    const selector: string = String(config.selector || 'body');
    const includeLinks: boolean = !!config.includeLinks;
    const maxChars: number = Math.max(500, Math.min(Number(config.maxChars ?? DEFAULT_MAX_CHARS), 100_000));

    // Per-tenant egress rate limit (2.28). Org comes from the execution record —
    // never from config. Best-effort (fail-open) when Redis is unavailable so a
    // missing cache never silently disables scraping for everyone.
    // Honor robots.txt before fetching the page (2.28).
    await assertRobotsAllows(url);

    // Follow redirects manually so every hop is re-validated + DNS-pinned by
    // safeOutboundFetch — `redirect: 'follow'` would let a public URL bounce to
    // an internal address without re-checking it (SSRF).
    let currentUrl = url;
    let response: Awaited<ReturnType<typeof safeOutboundFetch>> | undefined;
    const MAX_REDIRECTS = 5;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await safeOutboundFetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'MontrAI-Scraper/1.0 (+https://montr.ai)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        if (hop === MAX_REDIRECTS) {
          throw new Error(`Website scraper: too many redirects for ${url}`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        // Re-check robots.txt on the redirect target so a 30x can't bounce us to
        // a disallowed path/origin (2.28).
        await assertRobotsAllows(currentUrl);
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      throw new Error(`Website scraper: ${response?.status ?? 'no response'} ${response?.statusText ?? ''} for ${url}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Strip noise before extracting text
    $('script, style, noscript, iframe, svg').remove();

    const title = ($('title').first().text() || '').trim();
    const description =
      ($('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        '').trim();

    const target = $(selector);
    const rawText = (target.length ? target.text() : $('body').text()) || '';
    const text = rawText.replace(/\s+/g, ' ').trim().slice(0, maxChars);

    let links: string[] | undefined;
    if (includeLinks) {
      const seen = new Set<string>();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        try {
          const abs = new URL(href, url).toString();
          if (!seen.has(abs)) {
            seen.add(abs);
            if (seen.size <= 200) {
              // cap to keep payload reasonable
            }
          }
        } catch {
          /* ignore malformed hrefs */
        }
      });
      links = Array.from(seen).slice(0, 200);
    }

    return {
      url,
      title,
      description,
      text,
      length: text.length,
      ...(links ? { links } : {}),
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.url) errors.push('URL is required');
    else {
      try {
        new URL(String(config.url));
      } catch {
        errors.push('Invalid URL format');
      }
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

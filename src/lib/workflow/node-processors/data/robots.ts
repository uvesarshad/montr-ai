/**
 * Minimal robots.txt honoring for the website scraper (TODO 2.28 — scraper hygiene).
 *
 * Fetches `<origin>/robots.txt` through the SSRF guard, caches it (per-origin,
 * short Redis TTL with an in-process fallback for the current run), and checks a
 * path against the `User-agent: *` group's `Disallow` rules using longest-match
 * precedence (the conventional robots.txt resolution). This is intentionally a
 * lean parser — `Allow` overrides and wildcard `*`/`$` patterns are supported;
 * crawl-delay / sitemap / per-agent groups beyond `*` are out of scope.
 */

import { safeOutboundFetch } from '../../ssrf-guard';

const ROBOTS_TTL_SECONDS = 3600; // 1h — robots.txt rarely changes.
const ROBOTS_FETCH_TIMEOUT_MS = 8_000;
const ROBOTS_MAX_BYTES = 512 * 1024;

interface RobotsRules {
  /** Disallow path-prefix patterns for User-agent: * (and merged generic groups). */
  disallow: string[];
  /** Allow path-prefix patterns (override disallow on longer match). */
  allow: string[];
}

// In-process cache keyed by origin — survives for the lifetime of the worker
// process and short-circuits Redis on repeated fetches in a single run.
const memCache = new Map<string, { rules: RobotsRules; expiresAt: number }>();

function redisKey(origin: string): string {
  return `robots:${origin}`;
}

/** Parse a robots.txt body into the `User-agent: *` rule set. */
export function parseRobots(body: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [] };
  let appliesToStar = false;
  let sawAnyGroup = false;

  for (const rawLine of body.split(/\r?\n/)) {
    // Strip comments + whitespace.
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      sawAnyGroup = true;
      // A run of consecutive user-agent lines shares the next directive block.
      appliesToStar = value === '*';
      continue;
    }

    if (!appliesToStar) continue;
    if (field === 'disallow') {
      if (value) rules.disallow.push(value);
    } else if (field === 'allow') {
      if (value) rules.allow.push(value);
    }
  }

  // No groups at all → treat as "allow everything".
  if (!sawAnyGroup) return { disallow: [], allow: [] };
  return rules;
}

/** Does `pattern` (a robots.txt path pattern with optional * and $) match `path`? */
function patternMatches(pattern: string, path: string): boolean {
  // Convert robots pattern → regex. `*` = any run, `$` (only at end) = end anchor.
  let p = pattern;
  let anchorEnd = false;
  if (p.endsWith('$')) {
    anchorEnd = true;
    p = p.slice(0, -1);
  }
  const escaped = p
    .split('*')
    .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const re = new RegExp('^' + escaped + (anchorEnd ? '$' : ''));
  return re.test(path);
}

/** Length of the longest matching pattern in `patterns`, or -1 if none match. */
function longestMatch(patterns: string[], path: string): number {
  let best = -1;
  for (const pat of patterns) {
    if (patternMatches(pat, path)) best = Math.max(best, pat.length);
  }
  return best;
}

/**
 * True if scraping `path` is allowed under `rules`. Longest-match wins; ties go
 * to Allow (least restrictive), matching common crawler behaviour.
 */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const dis = longestMatch(rules.disallow, path);
  if (dis === -1) return true; // nothing disallows it
  const allow = longestMatch(rules.allow, path);
  return allow >= dis; // an equal-or-longer Allow overrides the Disallow
}

/** Fetch + cache robots.txt rules for an origin. Fail-open (returns allow-all) on error. */
export async function getRobotsRules(origin: string): Promise<RobotsRules> {
  const now = Date.now();
  const cached = memCache.get(origin);
  if (cached && cached.expiresAt > now) return cached.rules;

  // Redis cache (cross-run / cross-process). Best-effort.
  try {
    const { isRedisAvailable, getRedisClient } = await import('../../../redis');
    if (await isRedisAvailable()) {
      const raw = await getRedisClient().get(redisKey(origin));
      if (raw) {
        const rules = JSON.parse(raw) as RobotsRules;
        memCache.set(origin, { rules, expiresAt: now + ROBOTS_TTL_SECONDS * 1000 });
        return rules;
      }
    }
  } catch {
    /* Redis miss/unavailable — fall through to fetch. */
  }

  let rules: RobotsRules = { disallow: [], allow: [] };
  try {
    const resp = await safeOutboundFetch(`${origin}/robots.txt`, {
      method: 'GET',
      headers: { 'User-Agent': 'MontrAI-Scraper/1.0 (+https://montr.ai)', Accept: 'text/plain' },
      signal: AbortSignal.timeout(ROBOTS_FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });
    // 4xx (incl. 404) ⇒ no robots.txt ⇒ allow all. Only parse a 2xx body.
    if (resp.ok) {
      const body = (await resp.text()).slice(0, ROBOTS_MAX_BYTES);
      rules = parseRobots(body);
    }
  } catch {
    // Network error fetching robots.txt — fail open (allow), but don't cache long.
    rules = { disallow: [], allow: [] };
  }

  memCache.set(origin, { rules, expiresAt: now + ROBOTS_TTL_SECONDS * 1000 });
  try {
    const { isRedisAvailable, getRedisClient } = await import('../../../redis');
    if (await isRedisAvailable()) {
      await getRedisClient().set(redisKey(origin), JSON.stringify(rules), 'EX', ROBOTS_TTL_SECONDS);
    }
  } catch {
    /* best-effort cache write */
  }

  return rules;
}

/**
 * Throws a clear error if robots.txt disallows scraping `targetUrl`.
 * Org-agnostic; cached per origin.
 */
export async function assertRobotsAllows(targetUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(targetUrl);
  } catch {
    return; // malformed URLs are caught elsewhere
  }
  const origin = u.origin;
  const path = `${u.pathname}${u.search}` || '/';
  const rules = await getRobotsRules(origin);
  if (!isPathAllowed(rules, path)) {
    throw new Error(`robots.txt disallows scraping this path: ${path}`);
  }
}

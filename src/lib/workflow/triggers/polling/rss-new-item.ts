/**
 * RSS / Atom "new item" poll fetcher (H5).
 *
 * Fetches a USER-SUPPLIED feed URL — therefore ALWAYS through safeOutboundFetch
 * (SSRF guard mandatory). Parses RSS <item> and Atom <entry> elements with a
 * small tolerant regex extractor (no XML parser is a project dependency).
 *
 * Cursor (capped to keep the doc small):
 *   cursor = { seenGuids: string[] (max 200, newest first), lastPubDate?: string }
 *
 * Dedup is by guid (falling back to link, then a title+pubDate hash). On the FIRST
 * run we record the current guids as the baseline and emit nothing — switching the
 * trigger on should not replay the whole feed.
 */

import crypto from 'node:crypto';
import { safeOutboundFetch } from '../../ssrf-guard';
import type { PollFetcher, PollFetcherInput, PollFetcherResult } from './types';

const SEEN_GUID_CAP = 200;
/** Cap items parsed per tick — feeds can be huge. */
const MAX_ITEMS = 100;
/** Cap response body we'll parse (bytes) to avoid a memory blowup on a hostile feed. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

interface ParsedItem {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** Extract the inner text of the first <tag>…</tag> within a block (namespace-tolerant). */
function tagText(block: string, tag: string): string {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i');
  const m = re.exec(block);
  return m ? decodeEntities(m[1]) : '';
}

/** Atom <link href="…"/> — grab the href attribute when no element text is present. */
function atomLinkHref(block: string): string {
  const m = /<(?:[\w-]+:)?link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>(?:<\/(?:[\w-]+:)?link>)?/i.exec(block);
  return m ? decodeEntities(m[1]) : '';
}

function parseFeed(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  // Match both RSS <item>…</item> and Atom <entry>…</entry>.
  const blockRe = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(xml)) && items.length < MAX_ITEMS) {
    const block = match[0];
    const title = tagText(block, 'title');
    const link = tagText(block, 'link') || atomLinkHref(block);
    const pubDate = tagText(block, 'pubDate') || tagText(block, 'published') || tagText(block, 'updated') || tagText(block, 'date');
    let guid = tagText(block, 'guid') || tagText(block, 'id') || link;
    if (!guid) {
      guid = crypto.createHash('sha1').update(`${title}|${pubDate}`).digest('hex');
    }
    items.push({ guid, title, link, pubDate });
  }
  return items;
}

export const rssNewItemFetcher: PollFetcher = {
  source: 'rss_new_item',

  async fetch(input: PollFetcherInput): Promise<PollFetcherResult> {
    const feedUrl = String(input.config.feedUrl || '').trim();
    if (!feedUrl) throw new Error('rss_new_item: feedUrl is required');

    const res = await safeOutboundFetch(feedUrl, {
      method: 'GET',
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`rss_new_item: feed returned ${res.status} ${res.statusText}`);
    let body = await res.text();
    if (body.length > MAX_BODY_BYTES) body = body.slice(0, MAX_BODY_BYTES);

    const parsed = parseFeed(body); // feed order (typically newest-first)

    const cursorObj = (input.cursor && typeof input.cursor === 'object') ? (input.cursor as Record<string, unknown>) : {};
    const prevSeen = Array.isArray(cursorObj.seenGuids) ? (cursorObj.seenGuids as string[]) : [];
    const firstRun = prevSeen.length === 0 && cursorObj.lastPubDate === undefined;
    const seenSet = new Set(prevSeen);

    // New = not previously seen. Reverse to oldest-first for stable dispatch order.
    const fresh = firstRun ? [] : parsed.filter((it) => !seenSet.has(it.guid)).reverse();

    const newItems = fresh.map((it) => ({
      id: it.guid,
      title: it.title,
      link: it.link,
      guid: it.guid,
      pubDate: it.pubDate,
    }));

    // Next cursor: union of newly-seen + previously-seen guids, capped (newest first).
    const allGuids = [...parsed.map((it) => it.guid), ...prevSeen];
    const dedupedGuids: string[] = [];
    const cap = new Set<string>();
    for (const g of allGuids) {
      if (cap.has(g)) continue;
      cap.add(g);
      dedupedGuids.push(g);
      if (dedupedGuids.length >= SEEN_GUID_CAP) break;
    }
    const lastPubDate = parsed[0]?.pubDate || (cursorObj.lastPubDate as string | undefined);

    return {
      newItems,
      nextCursor: { seenGuids: dedupedGuids, lastPubDate },
    };
  },
};

/**
 * Google Search processor.
 *
 * Supports two providers (both BYOK — no shared keys):
 *   serper:  https://google.serper.dev/search (fast, cheap, returns rich SERP)
 *   google:  Google Programmable Search (Custom Search JSON API) — requires
 *            both an API key AND a search engine ID (cx).
 *
 * Config:
 *   credentialId?: string       — credential key { apiKey, cx? }
 *   provider?: 'serper' | 'google'   (default 'serper')
 *   apiKey?: string             — direct
 *   cx?: string                 — Google CSE engine id (google provider only)
 *   query: string               — required
 *   num?: number                — results to return (default 10, cap 50)
 *   page?: number               — 1-based (serper only). Google uses `start`.
 *   start?: number              — 1-based offset (google provider)
 *   location?: string           — serper: human-readable location, e.g. 'Austin, Texas'
 *   country?: string            — serper: gl param (ISO alpha-2)
 *   lang?: string               — hl language code
 *   safe?: 'active' | 'off'     — google SafeSearch
 *   type?: 'search'|'images'|'news'|'videos'  — serper search vertical
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const SERPER_BASE = 'https://google.serper.dev';
const CSE_BASE = 'https://www.googleapis.com/customsearch/v1';

type Provider = 'serper' | 'google';

export class GoogleSearchProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;
    const cred = (config.credentialId && credentials?.[config.credentialId as string]) as Record<string, unknown> | undefined;
    const provider: Provider = config.provider === 'google' ? 'google' : 'serper';

    const apiKey = ((cred?.apiKey as string | undefined) || (cred?.key as string | undefined) || (config.apiKey as string | undefined) || '').trim();
    if (!apiKey) throw new Error('Google Search: API key is required');

    const query = String(config.query || '').trim();
    if (!query) throw new Error('Google Search: "query" is required');

    const num = Math.max(1, Math.min(Number(config.num) || 10, provider === 'google' ? 10 : 50));

    if (provider === 'serper') {
      const configType = String(config.type || '');
      const type = ['search', 'images', 'news', 'videos'].includes(configType)
        ? configType
        : 'search';
      const body: Record<string, unknown> = { q: query, num };
      if (config.page) body.page = Number(config.page);
      if (config.location) body.location = String(config.location);
      if (config.country) body.gl = String(config.country).toLowerCase();
      if (config.lang) body.hl = String(config.lang);

      const url = `${SERPER_BASE}/${type}`;
      const res = await safeOutboundFetch(url, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        const msg = (data?.message as string | undefined) || res.statusText;
        throw new Error(`Serper: ${res.status} — ${msg}`);
      }

      const organic = Array.isArray(data.organic) ? data.organic as Record<string, unknown>[] : [];
      return {
        success: true,
        provider,
        type,
        query,
        count: organic.length,
        results: organic.map((r) => ({
          position: r.position,
          title: r.title,
          link: r.link,
          snippet: r.snippet,
          displayLink: r.displayLink,
          sitelinks: r.sitelinks,
          date: r.date,
        })),
        answerBox: data.answerBox,
        knowledgeGraph: data.knowledgeGraph,
        peopleAlsoAsk: data.peopleAlsoAsk,
        relatedSearches: data.relatedSearches,
      };
    }

    // Google Custom Search
    const cx = ((cred?.cx as string | undefined) || (cred?.engineId as string | undefined) || (config.cx as string | undefined) || '').trim();
    if (!cx) throw new Error('Google Search: "cx" (engine id) is required for google provider');

    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: query,
      num: String(num),
    });
    if (config.start) params.set('start', String(config.start));
    if (config.lang) params.set('lr', `lang_${config.lang}`);
    if (config.country) params.set('gl', String(config.country).toLowerCase());
    if (config.safe) params.set('safe', config.safe === 'off' ? 'off' : 'active');

    const url = `${CSE_BASE}?${params.toString()}`;
    const res = await safeOutboundFetch(url, { signal: AbortSignal.timeout(20_000) });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const errData = data?.error as Record<string, unknown> | undefined;
      const msg = errData?.message || res.statusText;
      throw new Error(`Google CSE: ${res.status} — ${msg}`);
    }

    const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
    const searchInfo = data.searchInformation as Record<string, unknown> | undefined;
    return {
      success: true,
      provider,
      query,
      totalResults: Number(searchInfo?.totalResults || 0),
      count: items.length,
      results: items.map((r) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        displayLink: r.displayLink,
        mime: r.mime,
        fileFormat: r.fileFormat,
      })),
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.query) errors.push('query is required');
    if (!config.credentialId && !config.apiKey) {
      errors.push('credentialId or apiKey is required');
    }
    if (config.provider === 'google' && !config.cx && !config.credentialId) {
      errors.push('cx (engine id) is required for the google provider');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

/**
 * X (Twitter) scraper — X API v2.
 *
 * Uses App-only Bearer token auth. Modes:
 *   user_tweets:  GET /users/{id}/tweets  (requires user id or handle → lookup)
 *   search:       GET /tweets/search/recent
 *   tweet:        GET /tweets/{id}
 *
 * Config:
 *   credentialId?: string           — credential key { bearerToken }
 *   bearerToken?: string            — direct token
 *   mode?: 'user_tweets'|'search'|'tweet'   (default 'search')
 *   query?: string                  — search query (search mode)
 *   username?: string               — handle for user_tweets (without @)
 *   userId?: string                 — numeric id (alternative)
 *   tweetId?: string                — id for 'tweet' mode
 *   maxResults?: number             — default 10, cap 100
 *   tweetFields?: string            — extra fields
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const API = 'https://api.twitter.com/2';
const DEFAULT_TWEET_FIELDS =
  'created_at,author_id,public_metrics,lang,entities,in_reply_to_user_id,referenced_tweets';

export class XScrapeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;
    const cred = (config.credentialId && credentials?.[config.credentialId as string]) as Record<string, unknown> | undefined;
    const token = ((cred?.bearerToken as string | undefined) || (cred?.accessToken as string | undefined) || (cred?.token as string | undefined) || (config.bearerToken as string | undefined) || '').trim();
    if (!token) throw new Error('X (Twitter): bearer token is required');

    const mode = config.mode || 'search';
    const maxResults = Math.max(1, Math.min(Number(config.maxResults) || 10, 100));
    const tweetFields = String(config.tweetFields || DEFAULT_TWEET_FIELDS);

    if (mode === 'tweet') {
      const id = String(config.tweetId || '').trim();
      if (!id) throw new Error('X: "tweetId" is required in tweet mode');
      const url = `${API}/tweets/${encodeURIComponent(id)}?tweet.fields=${encodeURIComponent(tweetFields)}`;
      const data = await fetchX(url, token);
      return { success: true, mode, tweet: data.data, includes: data.includes };
    }

    if (mode === 'user_tweets') {
      let userId = String(config.userId || '').trim();
      if (!userId) {
        const username = String(config.username || '').trim().replace(/^@/, '');
        if (!username) throw new Error('X: "username" or "userId" is required');
        const lookup = await fetchX(
          `${API}/users/by/username/${encodeURIComponent(username)}`,
          token
        );
        userId = String((lookup?.data as Record<string, unknown> | undefined)?.id || '');
        if (!userId) throw new Error(`X: user "${username}" not found`);
      }
      const url = `${API}/users/${encodeURIComponent(userId)}/tweets?max_results=${maxResults}&tweet.fields=${encodeURIComponent(tweetFields)}`;
      const data = await fetchX(url, token);
      const dataMeta = data.meta as Record<string, unknown> | undefined;
      return {
        success: true,
        mode,
        userId,
        count: dataMeta?.result_count || 0,
        tweets: (data.data as unknown[]) || [],
      };
    }

    // search mode
    const q = String(config.query || '').trim();
    if (!q) throw new Error('X: "query" is required in search mode');
    const url = `${API}/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=${maxResults}&tweet.fields=${encodeURIComponent(tweetFields)}`;
    const data = await fetchX(url, token);
    const dataMeta = data.meta as Record<string, unknown> | undefined;
    return {
      success: true,
      mode,
      query: q,
      count: dataMeta?.result_count || 0,
      tweets: (data.data as unknown[]) || [],
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.credentialId && !config.bearerToken) {
      errors.push('credentialId or bearerToken is required');
    }
    const mode = config.mode || 'search';
    if (mode === 'search' && !config.query) errors.push('query is required in search mode');
    if (mode === 'tweet' && !config.tweetId) errors.push('tweetId is required in tweet mode');
    if (mode === 'user_tweets' && !config.username && !config.userId) {
      errors.push('username or userId is required');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

async function fetchX(url: string, token: string): Promise<Record<string, unknown>> {
  const res = await safeOutboundFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const errors = data?.errors as Array<Record<string, unknown>> | undefined;
    const msg = (data?.title as string | undefined) || (data?.detail as string | undefined) || (errors?.[0]?.message as string | undefined) || res.statusText;
    throw new Error(`X API: ${res.status} — ${msg}`);
  }
  return data;
}

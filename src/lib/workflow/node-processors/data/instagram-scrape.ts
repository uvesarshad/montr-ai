/**
 * Instagram scraper — Meta Graph API (Instagram Business / Creator accounts).
 *
 * This is *not* public-profile scraping — Meta doesn't allow that without a
 * third-party provider. What this node does:
 *   - user mode:    fetch media for the authenticated IG business account
 *                   (igUserId + accessToken)
 *   - media mode:   fetch a specific media item by id
 *   - hashtag mode: recent/top media for a hashtag (requires hashtag ID,
 *                   obtained via /ig_hashtag_search)
 *
 * Config:
 *   credentialId?: string              — credential key with { accessToken, igUserId }
 *   accessToken?: string               — direct token (post-resolution)
 *   igUserId?: string                  — business account id
 *   mode?: 'user'|'media'|'hashtag'    — default 'user'
 *   mediaId?: string                   — for 'media' mode
 *   hashtag?: string                   — #keyword (will be resolved to id)
 *   hashtagMode?: 'recent'|'top'       — default 'top'
 *   limit?: number                     — default 25, cap 100
 *   fields?: string                    — comma-separated field list override
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const GRAPH = 'https://graph.facebook.com/v19.0';
const DEFAULT_FIELDS =
  'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count';

export class InstagramScrapeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;
    const cred = (config.credentialId && credentials?.[config.credentialId as string]) as Record<string, unknown> | undefined;
    const accessToken: string =
      ((cred?.accessToken as string | undefined) || (cred?.token as string | undefined) || (config.accessToken as string | undefined) || '').trim();
    const igUserId: string =
      ((cred?.igUserId as string | undefined) || (cred?.userId as string | undefined) || (config.igUserId as string | undefined) || '').trim();

    if (!accessToken) {
      throw new Error('Instagram Scrape: access token is required');
    }

    const mode = config.mode || 'user';
    const limit = Math.max(1, Math.min(Number(config.limit) || 25, 100));
    const fields = String(config.fields || DEFAULT_FIELDS);

    if (mode === 'media') {
      const mediaId = String(config.mediaId || '').trim();
      if (!mediaId) throw new Error('Instagram Scrape: "mediaId" is required in media mode');
      const url = `${GRAPH}/${encodeURIComponent(mediaId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;
      const data = await fetchJson(url);
      return { success: true, mode, media: data };
    }

    if (mode === 'hashtag') {
      if (!igUserId) throw new Error('Instagram Scrape: "igUserId" is required for hashtag mode');
      const hashtag = String(config.hashtag || '').trim().replace(/^#/, '');
      if (!hashtag) throw new Error('Instagram Scrape: "hashtag" is required in hashtag mode');

      const searchUrl = `${GRAPH}/ig_hashtag_search?user_id=${encodeURIComponent(igUserId)}&q=${encodeURIComponent(hashtag)}&access_token=${encodeURIComponent(accessToken)}`;
      const searchResp = await fetchJson(searchUrl);
      const searchData = (searchResp?.data as Array<Record<string, unknown>> | undefined);
      const hashtagId = searchData?.[0]?.id;
      if (!hashtagId) throw new Error(`Instagram Scrape: hashtag "${hashtag}" not found`);

      const endpoint = config.hashtagMode === 'recent' ? 'recent_media' : 'top_media';
      const mediaUrl = `${GRAPH}/${encodeURIComponent(String(hashtagId))}/${endpoint}?user_id=${encodeURIComponent(igUserId)}&fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;
      const data = await fetchJson(mediaUrl);
      const dataItems = data?.data as unknown[] | undefined;
      return {
        success: true,
        mode,
        hashtag,
        hashtagId,
        count: dataItems?.length || 0,
        media: dataItems || [],
      };
    }

    // user mode
    if (!igUserId) throw new Error('Instagram Scrape: "igUserId" is required in user mode');
    const mediaUrl = `${GRAPH}/${encodeURIComponent(igUserId)}/media?fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;
    const data = await fetchJson(mediaUrl);
    const dataItems = data?.data as unknown[] | undefined;
    return {
      success: true,
      mode,
      igUserId,
      count: dataItems?.length || 0,
      media: dataItems || [],
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.credentialId && !config.accessToken) {
      errors.push('credentialId or accessToken is required');
    }
    const mode = config.mode || 'user';
    if (mode === 'media' && !config.mediaId) errors.push('mediaId is required in media mode');
    if (mode === 'hashtag' && !config.hashtag) errors.push('hashtag is required in hashtag mode');
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await safeOutboundFetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const errData = data?.error as Record<string, unknown> | undefined;
    const msg = errData?.message || res.statusText;
    throw new Error(`Instagram Graph API: ${res.status} — ${msg}`);
  }
  return data;
}

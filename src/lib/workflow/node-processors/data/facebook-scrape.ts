/**
 * Facebook data loader — Meta Graph API (v19.0).
 *
 * Requires a Page access token (long-lived preferred). Public-page scraping
 * without auth is not supported by Meta.
 *
 * Modes:
 *   page:          GET /{pageId} → page profile fields
 *   page_posts:    GET /{pageId}/posts
 *   page_feed:     GET /{pageId}/feed (unpublished drafts + posts)
 *   post:          GET /{postId} with fields
 *   post_comments: GET /{postId}/comments
 *
 * Config:
 *   credentialId?: string       — credential key { accessToken, pageId? }
 *   accessToken?: string
 *   pageId?: string             — required for page/page_posts/page_feed
 *   postId?: string             — required for post/post_comments
 *   mode?: 'page'|'page_posts'|'page_feed'|'post'|'post_comments' (default 'page_posts')
 *   limit?: number              — default 25, cap 100
 *   fields?: string             — comma-separated fields override
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const GRAPH = 'https://graph.facebook.com/v19.0';
type Mode = 'page' | 'page_posts' | 'page_feed' | 'post' | 'post_comments';
const VALID_MODES: readonly Mode[] = [
  'page',
  'page_posts',
  'page_feed',
  'post',
  'post_comments',
];

const DEFAULT_FIELDS: Record<Mode, string> = {
  page: 'id,name,about,category,description,fan_count,link,username,website,picture',
  page_posts:
    'id,message,created_time,permalink_url,full_picture,attachments,reactions.summary(true),comments.summary(true),shares',
  page_feed:
    'id,message,created_time,permalink_url,full_picture,attachments,is_published',
  post: 'id,message,created_time,permalink_url,full_picture,attachments,reactions.summary(true),comments.summary(true),shares,from',
  post_comments: 'id,message,from,created_time,like_count,comment_count',
};

export class FacebookScrapeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;
    const cred = (config.credentialId && credentials?.[config.credentialId as string]) as Record<string, unknown> | undefined;
    const token = ((cred?.accessToken as string | undefined) || (cred?.token as string | undefined) || (config.accessToken as string | undefined) || '').trim();
    if (!token) throw new Error('Facebook: access token is required');

    const rawMode = config.mode as string | undefined;
    const mode: Mode = (rawMode && VALID_MODES.includes(rawMode as Mode)) ? (rawMode as Mode) : 'page_posts';
    const limit = Math.max(1, Math.min(Number(config.limit) || 25, 100));
    const fields = String((config.fields as string | undefined) || DEFAULT_FIELDS[mode]);

    const pageId = String((cred?.pageId as string | undefined) || (config.pageId as string | undefined) || '').trim();
    const postId = String((config.postId as string | undefined) || '').trim();

    if (mode === 'page') {
      if (!pageId) throw new Error('Facebook: "pageId" is required in page mode');
      const data = await fetchFb(
        `${GRAPH}/${encodeURIComponent(pageId)}?fields=${encodeURIComponent(fields)}`,
        token
      );
      return { success: true, mode, page: data };
    }

    if (mode === 'page_posts' || mode === 'page_feed') {
      if (!pageId) throw new Error(`Facebook: "pageId" is required in ${mode} mode`);
      const endpoint = mode === 'page_feed' ? 'feed' : 'posts';
      const data = await fetchFb(
        `${GRAPH}/${encodeURIComponent(pageId)}/${endpoint}?fields=${encodeURIComponent(fields)}&limit=${limit}`,
        token
      );
      const dataArr = data.data as unknown[] | undefined;
      return {
        success: true,
        mode,
        pageId,
        count: dataArr?.length || 0,
        paging: data.paging,
        posts: dataArr || [],
      };
    }

    if (mode === 'post') {
      if (!postId) throw new Error('Facebook: "postId" is required in post mode');
      const data = await fetchFb(
        `${GRAPH}/${encodeURIComponent(postId)}?fields=${encodeURIComponent(fields)}`,
        token
      );
      return { success: true, mode, post: data };
    }

    // post_comments
    if (!postId) throw new Error('Facebook: "postId" is required in post_comments mode');
    const data = await fetchFb(
      `${GRAPH}/${encodeURIComponent(postId)}/comments?fields=${encodeURIComponent(fields)}&limit=${limit}`,
      token
    );
    const commentsArr = data.data as unknown[] | undefined;
    return {
      success: true,
      mode,
      postId,
      count: commentsArr?.length || 0,
      paging: data.paging,
      comments: commentsArr || [],
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.credentialId && !config.accessToken) {
      errors.push('credentialId or accessToken is required');
    }
    const mode = (config.mode as string | undefined) || 'page_posts';
    if (['page', 'page_posts', 'page_feed'].includes(mode) && !config.pageId) {
      errors.push('pageId is required for page modes');
    }
    if (['post', 'post_comments'].includes(mode) && !config.postId) {
      errors.push('postId is required');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

async function fetchFb(url: string, token: string): Promise<Record<string, unknown>> {
  const u = url.includes('?')
    ? `${url}&access_token=${encodeURIComponent(token)}`
    : `${url}?access_token=${encodeURIComponent(token)}`;
  const res = await safeOutboundFetch(u, { signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const errData = data?.error as Record<string, unknown> | undefined;
    const msg = errData?.message || res.statusText;
    throw new Error(`Facebook Graph: ${res.status} — ${msg}`);
  }
  return data;
}

/**
 * Reddit scraper — public JSON API, no auth required.
 *
 * Two modes:
 *   subreddit: fetches /r/{name}/{sort}.json for top/new/hot/rising posts
 *   post:      fetches /comments/{id}.json for a single post + comments
 *
 * Config:
 *   mode?: 'subreddit' | 'post'            (default 'subreddit')
 *   subreddit?: string                     — name without /r/ (subreddit mode)
 *   postId?: string                        — Reddit post id (post mode)
 *   permalink?: string                     — alternative to postId
 *   sort?: 'hot' | 'new' | 'top' | 'rising' (subreddit mode, default 'hot')
 *   timeRange?: 'hour'|'day'|'week'|'month'|'year'|'all'  (top only)
 *   limit?: number                         — max items (default 25, cap 100)
 *   includeComments?: boolean              — for post mode, strip comments
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const REDDIT_BASE = 'https://www.reddit.com';
const UA = 'MontrAI-Scraper/1.0 (+https://montr.ai)';

export class RedditScrapeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const mode = config.mode === 'post' ? 'post' : 'subreddit';
    const limit = Math.max(1, Math.min(Number(config.limit) || 25, 100));

    if (mode === 'post') {
      const id = cleanId(config.postId) || permalinkToId(config.permalink);
      if (!id) throw new Error('Reddit: "postId" or "permalink" is required in post mode');
      const url = `${REDDIT_BASE}/comments/${encodeURIComponent(id)}.json?limit=${limit}&raw_json=1`;
      const data = await fetchJson(url);

      const [postRes, commentsRes] = Array.isArray(data) ? data as [unknown, unknown] : [data, null];
      const postResObj = postRes as Record<string, unknown> | undefined;
      const postResData = postResObj?.data as Record<string, unknown> | undefined;
      const postResChildren = postResData?.children as Array<Record<string, unknown>> | undefined;
      const post = (postResChildren?.[0]?.data) as Record<string, unknown> | undefined;
      if (!post) throw new Error('Reddit: post not found or removed');

      const result: Record<string, unknown> = {
        id: post.id,
        title: post.title,
        author: post.author,
        subreddit: post.subreddit,
        url: post.url,
        permalink: `${REDDIT_BASE}${post.permalink}`,
        score: post.score,
        upvoteRatio: post.upvote_ratio,
        numComments: post.num_comments,
        selftext: post.selftext,
        createdUtc: post.created_utc,
        flair: post.link_flair_text,
      };

      const commentsResData = commentsRes as Record<string, unknown> | null;
      const commentsData = commentsResData?.data as Record<string, unknown> | undefined;
      if (config.includeComments !== false && commentsData?.children) {
        result.comments = (commentsData.children as Array<Record<string, unknown>>)
          .filter((c) => c.kind === 't1')
          .map((c) => {
            const cd = c.data as Record<string, unknown>;
            return {
              id: cd.id,
              author: cd.author,
              body: cd.body,
              score: cd.score,
              createdUtc: cd.created_utc,
            };
          });
      }
      return { success: true, mode, ...result };
    }

    const sub = cleanId(config.subreddit);
    if (!sub) throw new Error('Reddit: "subreddit" is required in subreddit mode');
    const configSort = String(config.sort || '');
    const sort = ['hot', 'new', 'top', 'rising'].includes(configSort) ? configSort : 'hot';
    let path = `${REDDIT_BASE}/r/${encodeURIComponent(sub)}/${sort}.json?limit=${limit}&raw_json=1`;
    if (sort === 'top' && config.timeRange) {
      path += `&t=${encodeURIComponent(String(config.timeRange))}`;
    }

    const rawData = await fetchJson(path);
    const data = rawData as Record<string, unknown> | undefined;
    const dataObj = data?.data as Record<string, unknown> | undefined;
    const children = (dataObj?.children as Array<Record<string, unknown>>) || [];
    const posts = children.map((c) => {
      const p = c.data as Record<string, unknown>;
      return {
        id: p.id,
        title: p.title,
        author: p.author,
        subreddit: p.subreddit,
        url: p.url,
        permalink: `${REDDIT_BASE}${p.permalink}`,
        score: p.score,
        upvoteRatio: p.upvote_ratio,
        numComments: p.num_comments,
        selftext: p.selftext,
        thumbnail: p.thumbnail,
        createdUtc: p.created_utc,
        flair: p.link_flair_text,
        isVideo: !!p.is_video,
      };
    });

    return {
      success: true,
      mode,
      subreddit: sub,
      sort,
      count: posts.length,
      posts,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const mode = config.mode === 'post' ? 'post' : 'subreddit';
    if (mode === 'subreddit' && !config.subreddit) errors.push('subreddit is required');
    if (mode === 'post' && !config.postId && !config.permalink) {
      errors.push('postId or permalink is required');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

function cleanId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/^\/?r\//i, '').replace(/^t3_/, '');
  return t || null;
}

function permalinkToId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/\/comments\/([a-z0-9]+)/i);
  return m ? m[1] : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await safeOutboundFetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Reddit: request failed (${res.status} ${res.statusText})`);
  }
  return res.json();
}

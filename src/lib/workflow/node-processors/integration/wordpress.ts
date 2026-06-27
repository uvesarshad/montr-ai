/**
 * WordPress integration — self-hosted REST API (wp-json/wp/v2).
 *
 * Auth: Application Passwords (HTTP Basic). The site base URL is user-supplied,
 * so every request the service makes goes through the SSRF guard.
 *
 * Actions:
 *   list_posts      — list posts (default)
 *   get_post        — retrieve a single post
 *   create_post     — create a post (draft by default)
 *   update_post     — update a post with partial fields
 *   list_categories — list categories
 *   list_tags       — list tags
 *   upload_media    — upload media to the library from a source URL
 *
 * Config:
 *   credentialId? / connectionId? / brandId?  — credential resolution
 *   action: string         — one of the actions above (default 'list_posts')
 *   postId?: string|number — get_post / update_post
 *   title?: string         — create_post / update_post
 *   content?: string       — create_post / update_post (HTML)
 *   status?: string        — create_post ('draft'|'publish'|'future') / list filter
 *   date?: string          — create_post (schedule)
 *   categories?: number[]  — create_post / update_post
 *   tags?: number[]        — create_post / update_post
 *   excerpt?: string       — create_post / update_post
 *   per_page?: number      — list_posts (default/cap 100)
 *   page?: number          — list_posts pagination
 *   search?: string        — list_posts filter
 *   fields?: object        — update_post (overrides individual fields)
 *   mediaUrl?: string      — upload_media (source URL to fetch + re-upload)
 *   filename?: string      — upload_media (optional override; sanitized)
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { WordPressService } from '@/lib/services/wordpress.service';

type Action =
  | 'list_posts'
  | 'get_post'
  | 'create_post'
  | 'update_post'
  | 'list_categories'
  | 'list_tags'
  | 'upload_media';

const VALID_ACTIONS: readonly Action[] = [
  'list_posts',
  'get_post',
  'create_post',
  'update_post',
  'list_categories',
  'list_tags',
  'upload_media',
];

function toNumberArray(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map((n) => Number(n)).filter((n) => !Number.isNaN(n));
}

export class WordpressProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, connectionId } = await resolveProcessorCredentials({
      provider: 'wordpress',
      config,
      workflowCredentials: context.credentials,
    });

    const baseUrl = String(credentials.baseUrl || '').trim();
    const username = String(credentials.username || '').trim();
    const appPassword = String(credentials.appPassword || '').trim();
    if (!baseUrl || !username || !appPassword) {
      throw new Error('WordPress: site URL, username and application password are required');
    }

    const service = new WordPressService({ baseUrl, username, appPassword });

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'list_posts';

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'wordpress',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'list_posts': {
        const posts = await service.listPosts({
          per_page: Number(config.per_page) || undefined,
          page: Number(config.page) || undefined,
          status: config.status ? String(config.status) : undefined,
          search: config.search ? String(config.search) : undefined,
        });
        return { success: true, action, count: posts.length, posts };
      }
      case 'get_post': {
        const postId = config.postId;
        if (!postId) throw new Error('WordPress: "postId" is required for get_post');
        const post = await service.getPost(postId as string | number);
        return { success: true, action, post };
      }
      case 'create_post': {
        const title = String(config.title || '').trim();
        const content = config.content ? String(config.content) : '';
        if (!title && !content) {
          throw new Error('WordPress: "title" or "content" is required for create_post');
        }
        const rawStatus = config.status ? String(config.status) : 'draft';
        const status =
          rawStatus === 'publish' || rawStatus === 'future' ? rawStatus : 'draft';
        const post = await service.createPost({
          title,
          content,
          status,
          date: config.date ? String(config.date) : undefined,
          categories: toNumberArray(config.categories),
          tags: toNumberArray(config.tags),
          excerpt: config.excerpt ? String(config.excerpt) : undefined,
        });
        return { success: true, action, post };
      }
      case 'update_post': {
        const postId = config.postId;
        if (!postId) throw new Error('WordPress: "postId" is required for update_post');
        let fields: Record<string, unknown>;
        if (config.fields && typeof config.fields === 'object') {
          fields = config.fields as Record<string, unknown>;
        } else {
          fields = {};
          if (config.title !== undefined) fields.title = String(config.title);
          if (config.content !== undefined) fields.content = String(config.content);
          if (config.status !== undefined) fields.status = String(config.status);
          if (config.excerpt !== undefined) fields.excerpt = String(config.excerpt);
          const categories = toNumberArray(config.categories);
          if (categories) fields.categories = categories;
          const tags = toNumberArray(config.tags);
          if (tags) fields.tags = tags;
        }
        if (Object.keys(fields).length === 0) {
          throw new Error('WordPress: no fields provided for update_post');
        }
        const post = await service.updatePost(postId as string | number, fields);
        return { success: true, action, post };
      }
      case 'list_categories': {
        const categories = await service.listCategories();
        return { success: true, action, count: categories.length, categories };
      }
      case 'list_tags': {
        const tags = await service.listTags();
        return { success: true, action, count: tags.length, tags };
      }
      case 'upload_media': {
        const mediaUrl = String(config.mediaUrl || '').trim();
        if (!mediaUrl) {
          throw new Error('WordPress: "mediaUrl" is required for upload_media');
        }
        const filename = config.filename ? String(config.filename) : undefined;
        const media = await service.uploadMediaFromUrl(mediaUrl, filename);
        return { success: true, action, media };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'list_posts';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    if (action === 'upload_media' && !String(config.mediaUrl || '').trim()) {
      errors.push('mediaUrl is required for upload_media');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

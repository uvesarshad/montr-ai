/**
 * Blogger integration — Google Blogger API v3.
 *
 * Auth: Google OAuth access token, resolved through the integration vault.
 *
 * Actions:
 *   list_blogs   — list the user's blogs (default)
 *   list_posts   — list posts in a blog (paginated)
 *   get_post     — retrieve a single post
 *   create_post  — create a post (optionally as draft)
 *   update_post  — update a post (full replace)
 *   publish_post — publish a draft post
 *
 * Config:
 *   credentialId? / connectionId? / brandId?  — credential resolution
 *   action: string         — one of the actions above (default 'list_blogs')
 *   blogId?: string        — blog-scoped actions
 *   postId?: string        — post-scoped actions
 *   title?: string         — create_post / update_post
 *   content?: string       — create_post / update_post (HTML)
 *   labels?: string[]      — create_post / update_post
 *   isDraft?: boolean      — create_post
 *   status?: string        — list_posts filter
 *   maxResults?: number    — list_posts (default/cap 100)
 *   pageToken?: string     — list_posts pagination
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { BloggerService } from '@/lib/services/blogger.service';

type Action =
  | 'list_blogs'
  | 'list_posts'
  | 'get_post'
  | 'create_post'
  | 'update_post'
  | 'publish_post';

const VALID_ACTIONS: readonly Action[] = [
  'list_blogs',
  'list_posts',
  'get_post',
  'create_post',
  'update_post',
  'publish_post',
];

export class BloggerProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, connectionId } = await resolveProcessorCredentials({
      provider: 'blogger',
      config,
      workflowCredentials: context.credentials,
    });

    const accessToken = String(credentials.accessToken || '').trim();
    if (!accessToken) throw new Error('Blogger: access token is missing from the connection');

    const service = new BloggerService(accessToken);

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'list_blogs';

    const labels = Array.isArray(config.labels)
      ? (config.labels as unknown[]).map((l) => String(l))
      : undefined;

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'blogger',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'list_blogs': {
        const blogs = await service.listBlogs();
        return { success: true, action, count: blogs.length, blogs };
      }
      case 'list_posts': {
        const blogId = String(config.blogId || '').trim();
        if (!blogId) throw new Error('Blogger: "blogId" is required for list_posts');
        const result = await service.listPosts(blogId, {
          maxResults: Number(config.maxResults) || undefined,
          pageToken: config.pageToken ? String(config.pageToken) : undefined,
          status: config.status ? String(config.status) : undefined,
        });
        return {
          success: true,
          action,
          count: result.items.length,
          nextPageToken: result.nextPageToken,
          posts: result.items,
        };
      }
      case 'get_post': {
        const blogId = String(config.blogId || '').trim();
        const postId = String(config.postId || '').trim();
        if (!blogId) throw new Error('Blogger: "blogId" is required for get_post');
        if (!postId) throw new Error('Blogger: "postId" is required for get_post');
        const post = await service.getPost(blogId, postId);
        return { success: true, action, post };
      }
      case 'create_post': {
        const blogId = String(config.blogId || '').trim();
        if (!blogId) throw new Error('Blogger: "blogId" is required for create_post');
        const title = String(config.title || '').trim();
        if (!title) throw new Error('Blogger: "title" is required for create_post');
        const post = await service.createPost(blogId, {
          title,
          content: config.content ? String(config.content) : '',
          labels,
          isDraft: !!config.isDraft,
        });
        return { success: true, action, post };
      }
      case 'update_post': {
        const blogId = String(config.blogId || '').trim();
        const postId = String(config.postId || '').trim();
        if (!blogId) throw new Error('Blogger: "blogId" is required for update_post');
        if (!postId) throw new Error('Blogger: "postId" is required for update_post');
        const post = await service.updatePost(blogId, postId, {
          title: config.title !== undefined ? String(config.title) : undefined,
          content: config.content !== undefined ? String(config.content) : undefined,
          labels,
        });
        return { success: true, action, post };
      }
      case 'publish_post': {
        const blogId = String(config.blogId || '').trim();
        const postId = String(config.postId || '').trim();
        if (!blogId) throw new Error('Blogger: "blogId" is required for publish_post');
        if (!postId) throw new Error('Blogger: "postId" is required for publish_post');
        const post = await service.publishPost(blogId, postId);
        return { success: true, action, post };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'list_blogs';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

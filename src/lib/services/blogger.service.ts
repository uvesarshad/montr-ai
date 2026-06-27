/**
 * Blogger Service
 * Wrapper over the Google Blogger API v3.
 * Auth: Google OAuth access token (Bearer).
 */

import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface BloggerBlog {
    id: string;
    name?: string;
    description?: string;
    url?: string;
    [key: string]: unknown;
}

export interface BloggerPost {
    id: string;
    blog?: { id: string };
    title?: string;
    content?: string;
    url?: string;
    status?: string;
    labels?: string[];
    published?: string;
    updated?: string;
    [key: string]: unknown;
}

export interface BloggerListResult<T> {
    items: T[];
    nextPageToken?: string;
}

export class BloggerService {
    private accessToken: string;
    private baseUrl = 'https://www.googleapis.com/blogger/v3';

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    private async request(endpoint: string, options: RequestInit = {}) {
        const response = await fetchWithRetry(
            `${this.baseUrl}${endpoint}`,
            {
                ...options,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...options.headers,
                },
                signal: AbortSignal.timeout(30_000),
            },
            { label: 'blogger' }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const message =
                (error?.error?.message as string | undefined) ||
                (error?.message as string | undefined) ||
                response.statusText;
            const text = `Blogger API Error: ${response.status} — ${message}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'blogger');
            }
            throw new Error(text);
        }

        if (response.status === 204) return {};
        return response.json();
    }

    /**
     * List blogs owned by the authenticated user.
     */
    async listBlogs(): Promise<BloggerBlog[]> {
        const data = await this.request('/users/self/blogs');
        return (data.items as BloggerBlog[] | undefined) ?? [];
    }

    /**
     * List posts in a blog (maxResults capped at 100).
     */
    async listPosts(
        blogId: string,
        opts: { maxResults?: number; pageToken?: string; status?: string } = {}
    ): Promise<BloggerListResult<BloggerPost>> {
        if (!blogId) throw new Error('Blogger: blogId is required');
        const maxResults = Math.max(1, Math.min(Number(opts.maxResults) || 100, 100));
        const params = new URLSearchParams({ maxResults: String(maxResults) });
        if (opts.pageToken) params.set('pageToken', opts.pageToken);
        if (opts.status) params.set('status', opts.status);
        const data = await this.request(
            `/blogs/${encodeURIComponent(blogId)}/posts?${params.toString()}`
        );
        return {
            items: (data.items as BloggerPost[] | undefined) ?? [],
            nextPageToken: data.nextPageToken as string | undefined,
        };
    }

    /**
     * Get a single post.
     */
    async getPost(blogId: string, postId: string): Promise<BloggerPost> {
        if (!blogId) throw new Error('Blogger: blogId is required');
        if (!postId) throw new Error('Blogger: postId is required');
        return this.request(
            `/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}`
        );
    }

    /**
     * Create a post. Pass isDraft to stage it without publishing.
     * `content` is HTML.
     */
    async createPost(
        blogId: string,
        post: { title: string; content: string; labels?: string[]; isDraft?: boolean }
    ): Promise<BloggerPost> {
        if (!blogId) throw new Error('Blogger: blogId is required');
        if (!post?.title) throw new Error('Blogger: title is required to create a post');
        const query = post.isDraft ? '?isDraft=true' : '';
        const body: Record<string, unknown> = {
            title: post.title,
            content: post.content ?? '',
        };
        if (post.labels) body.labels = post.labels;
        return this.request(
            `/blogs/${encodeURIComponent(blogId)}/posts${query}`,
            {
                method: 'POST',
                body: JSON.stringify(body),
            }
        );
    }

    /**
     * Update a post (full replace via PUT). `content` is HTML.
     */
    async updatePost(
        blogId: string,
        postId: string,
        post: { title?: string; content?: string; labels?: string[] }
    ): Promise<BloggerPost> {
        if (!blogId) throw new Error('Blogger: blogId is required');
        if (!postId) throw new Error('Blogger: postId is required');
        const body: Record<string, unknown> = {};
        if (post.title !== undefined) body.title = post.title;
        if (post.content !== undefined) body.content = post.content;
        if (post.labels !== undefined) body.labels = post.labels;
        return this.request(
            `/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}`,
            {
                method: 'PUT',
                body: JSON.stringify(body),
            }
        );
    }

    /**
     * Publish a draft post.
     */
    async publishPost(blogId: string, postId: string): Promise<BloggerPost> {
        if (!blogId) throw new Error('Blogger: blogId is required');
        if (!postId) throw new Error('Blogger: postId is required');
        return this.request(
            `/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}/publish`,
            { method: 'POST' }
        );
    }
}

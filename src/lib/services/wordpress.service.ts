/**
 * WordPress Service
 * Wrapper over the self-hosted WordPress REST API (wp-json/wp/v2).
 * Auth: Application Passwords via HTTP Basic.
 *
 * SECURITY: the base URL is user-supplied, so every outbound request goes
 * through `safeOutboundFetch` (SSRF guard with DNS pinning).
 */

import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface WordPressPost {
    id: number;
    date?: string;
    slug?: string;
    status?: string;
    link?: string;
    title?: { rendered?: string; raw?: string };
    content?: { rendered?: string; raw?: string };
    excerpt?: { rendered?: string; raw?: string };
    categories?: number[];
    tags?: number[];
    [key: string]: unknown;
}

export interface WordPressTerm {
    id: number;
    name?: string;
    slug?: string;
    count?: number;
    [key: string]: unknown;
}

export interface WordPressUser {
    id: number;
    name?: string;
    slug?: string;
    [key: string]: unknown;
}

export interface WordPressMedia {
    id: number;
    source_url?: string;
    link?: string;
    mime_type?: string;
    title?: { rendered?: string; raw?: string };
    [key: string]: unknown;
}

/** Derive a safe filename from a URL path, sanitized to [\w.-]. */
function filenameFromUrl(sourceUrl: string): string {
    let candidate = 'upload';
    try {
        const path = new URL(sourceUrl).pathname;
        const last = path.split('/').filter(Boolean).pop();
        if (last) candidate = decodeURIComponent(last);
    } catch {
        /* fall back to default */
    }
    const sanitized = candidate.replace(/[^\w.-]/g, '_').replace(/^_+|_+$/g, '');
    return sanitized || 'upload';
}

export class WordPressService {
    private baseUrl: string;
    private authHeader: string;

    constructor(credentials: { baseUrl: string; username: string; appPassword: string }) {
        if (!credentials?.baseUrl) throw new Error('WordPress: site URL (baseUrl) is required');
        if (!credentials?.username) throw new Error('WordPress: username is required');
        if (!credentials?.appPassword) throw new Error('WordPress: application password is required');
        // Strip trailing slashes; all endpoints hang off {base}/wp-json/wp/v2.
        this.baseUrl = credentials.baseUrl.replace(/\/+$/, '');
        const token = Buffer.from(
            `${credentials.username}:${credentials.appPassword}`
        ).toString('base64');
        this.authHeader = `Basic ${token}`;
    }

    private async request<T = Record<string, unknown>>(
        endpoint: string,
        options: { method?: string; body?: string } = {}
    ): Promise<T> {
        // User-controlled base URL → SSRF guard is mandatory; keep it as the
        // underlying fetch impl so retries still go through DNS pinning.
        const response = await fetchWithRetry(
            `${this.baseUrl}/wp-json/wp/v2${endpoint}`,
            {
                method: options.method,
                body: options.body,
                headers: {
                    'Authorization': this.authHeader,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(30_000),
            },
            { label: 'wordpress', fetchImpl: safeOutboundFetch }
        );

        if (!response.ok) {
            const error = (await response.json().catch(() => ({}))) as {
                message?: string;
                code?: string;
            };
            const message = error?.message || error?.code || response.statusText;
            const text = `WordPress API Error: ${response.status} — ${message}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'wordpress');
            }
            throw new Error(text);
        }

        if (response.status === 204) return {} as T;
        return response.json() as Promise<T>;
    }

    /**
     * List posts (per_page capped at 100).
     */
    async listPosts(
        opts: { per_page?: number; page?: number; status?: string; search?: string } = {}
    ): Promise<WordPressPost[]> {
        const perPage = Math.max(1, Math.min(Number(opts.per_page) || 100, 100));
        const params = new URLSearchParams({ per_page: String(perPage) });
        if (opts.page) params.set('page', String(Math.max(1, Number(opts.page))));
        if (opts.status) params.set('status', opts.status);
        if (opts.search) params.set('search', opts.search);
        const data = await this.request<WordPressPost[]>(`/posts?${params.toString()}`);
        return data ?? [];
    }

    /**
     * Get a single post (context=edit to surface raw fields).
     */
    async getPost(id: number | string): Promise<WordPressPost> {
        if (!id) throw new Error('WordPress: post id is required');
        return this.request<WordPressPost>(`/posts/${encodeURIComponent(String(id))}?context=edit`);
    }

    /**
     * Create a post. `content` is HTML.
     */
    async createPost(post: {
        title: string;
        content: string;
        status?: 'draft' | 'publish' | 'future';
        date?: string;
        categories?: number[];
        tags?: number[];
        excerpt?: string;
    }): Promise<WordPressPost> {
        if (!post?.title && !post?.content) {
            throw new Error('WordPress: a title or content is required to create a post');
        }
        const body: Record<string, unknown> = {
            title: post.title,
            content: post.content,
            status: post.status ?? 'draft',
        };
        if (post.date !== undefined) body.date = post.date;
        if (post.categories !== undefined) body.categories = post.categories;
        if (post.tags !== undefined) body.tags = post.tags;
        if (post.excerpt !== undefined) body.excerpt = post.excerpt;
        return this.request<WordPressPost>('/posts', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Update a post with a partial set of fields.
     */
    async updatePost(
        id: number | string,
        fields: Record<string, unknown>
    ): Promise<WordPressPost> {
        if (!id) throw new Error('WordPress: post id is required');
        return this.request<WordPressPost>(`/posts/${encodeURIComponent(String(id))}`, {
            method: 'POST',
            body: JSON.stringify(fields),
        });
    }

    /**
     * List categories (per_page capped at 100).
     */
    async listCategories(): Promise<WordPressTerm[]> {
        const data = await this.request<WordPressTerm[]>('/categories?per_page=100');
        return data ?? [];
    }

    /**
     * List tags (per_page capped at 100).
     */
    async listTags(): Promise<WordPressTerm[]> {
        const data = await this.request<WordPressTerm[]>('/tags?per_page=100');
        return data ?? [];
    }

    /**
     * Get the authenticated user (validates credentials).
     */
    async getMe(): Promise<WordPressUser> {
        return this.request<WordPressUser>('/users/me?context=edit');
    }

    /**
     * Upload media to the WordPress media library by fetching it from a
     * (user/AI-supplied) source URL and re-POSTing the raw bytes.
     *
     * Both the source fetch and the WP upload go through `safeOutboundFetch`
     * (SSRF guard with DNS pinning) since both targets are user-controlled.
     * This intentionally bypasses the JSON-only private `request()` helper:
     * the body is the raw binary, not JSON.
     */
    async uploadMediaFromUrl(sourceUrl: string, filename?: string): Promise<WordPressMedia> {
        if (!sourceUrl) throw new Error('WordPress: a source media URL is required');

        // 1) Fetch the source media (user/AI-supplied URL → SSRF guard mandatory).
        const sourceResponse = await safeOutboundFetch(sourceUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(30_000),
        });
        if (!sourceResponse.ok) {
            throw new Error(
                `WordPress: failed to fetch source media (${sourceResponse.status} ${sourceResponse.statusText})`
            );
        }

        const arrayBuffer = await sourceResponse.arrayBuffer();
        const contentType =
            sourceResponse.headers.get('content-type')?.split(';')[0]?.trim() ||
            'application/octet-stream';
        const name = filename
            ? filename.replace(/[^\w.-]/g, '_').replace(/^_+|_+$/g, '') || 'upload'
            : filenameFromUrl(sourceUrl);

        // 2) POST the raw bytes to the WP media endpoint (base URL is user-supplied → SSRF guard).
        const uploadResponse = await safeOutboundFetch(
            `${this.baseUrl}/wp-json/wp/v2/media`,
            {
                method: 'POST',
                body: new Uint8Array(arrayBuffer),
                headers: {
                    'Authorization': this.authHeader,
                    'Content-Type': contentType,
                    'Content-Disposition': `attachment; filename="${name}"`,
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(60_000),
            }
        );

        if (!uploadResponse.ok) {
            const error = (await uploadResponse.json().catch(() => ({}))) as {
                message?: string;
                code?: string;
            };
            const message = error?.message || error?.code || uploadResponse.statusText;
            throw new Error(`WordPress API Error: ${uploadResponse.status} — ${message}`);
        }

        return uploadResponse.json() as Promise<WordPressMedia>;
    }
}

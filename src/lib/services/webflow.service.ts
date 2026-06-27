/**
 * Webflow Service
 * Thin wrapper over the Webflow Data API v2.
 * Auth: OAuth access token (Bearer).
 */

import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface WebflowSite {
    id: string;
    displayName: string;
    shortName?: string;
    previewUrl?: string;
}

export interface WebflowCollection {
    id: string;
    displayName: string;
    slug?: string;
    singularName?: string;
}

export interface WebflowItem {
    id: string;
    cmsLocaleId?: string;
    isArchived?: boolean;
    isDraft?: boolean;
    fieldData: Record<string, unknown>;
    [key: string]: unknown;
}

export interface WebflowListResult<T> {
    items: T[];
    pagination?: { limit: number; offset: number; total: number };
}

export class WebflowService {
    private accessToken: string;
    private baseUrl = 'https://api.webflow.com/v2';

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
            { label: 'webflow' }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const message =
                (error?.message as string | undefined) ||
                (error?.msg as string | undefined) ||
                response.statusText;
            const text = `Webflow API Error: ${response.status} — ${message}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'webflow');
            }
            throw new Error(text);
        }

        if (response.status === 204) return {};
        return response.json();
    }

    /**
     * List all sites accessible to the authorized account.
     */
    async listSites(): Promise<WebflowSite[]> {
        const data = await this.request('/sites');
        return (data.sites as WebflowSite[] | undefined) ?? [];
    }

    /**
     * List collections within a site.
     */
    async listCollections(siteId: string): Promise<WebflowCollection[]> {
        if (!siteId) throw new Error('Webflow: siteId is required');
        const data = await this.request(`/sites/${encodeURIComponent(siteId)}/collections`);
        return (data.collections as WebflowCollection[] | undefined) ?? [];
    }

    /**
     * List items in a collection (paginated; limit capped at 100).
     */
    async listItems(
        collectionId: string,
        opts: { limit?: number; offset?: number } = {}
    ): Promise<WebflowListResult<WebflowItem>> {
        if (!collectionId) throw new Error('Webflow: collectionId is required');
        const limit = Math.max(1, Math.min(Number(opts.limit) || 100, 100));
        const offset = Math.max(0, Number(opts.offset) || 0);
        const data = await this.request(
            `/collections/${encodeURIComponent(collectionId)}/items?limit=${limit}&offset=${offset}`
        );
        return {
            items: (data.items as WebflowItem[] | undefined) ?? [],
            pagination: data.pagination,
        };
    }

    /**
     * Get a single collection item.
     */
    async getItem(collectionId: string, itemId: string): Promise<WebflowItem> {
        if (!collectionId) throw new Error('Webflow: collectionId is required');
        if (!itemId) throw new Error('Webflow: itemId is required');
        return this.request(
            `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`
        );
    }

    /**
     * Create a collection item. Set isDraft to stage without publishing.
     */
    async createItem(
        collectionId: string,
        fieldData: Record<string, unknown>,
        isDraft = false
    ): Promise<WebflowItem> {
        if (!collectionId) throw new Error('Webflow: collectionId is required');
        return this.request(`/collections/${encodeURIComponent(collectionId)}/items`, {
            method: 'POST',
            body: JSON.stringify({ isDraft, fieldData }),
        });
    }

    /**
     * Update a collection item's field data.
     */
    async updateItem(
        collectionId: string,
        itemId: string,
        fieldData: Record<string, unknown>
    ): Promise<WebflowItem> {
        if (!collectionId) throw new Error('Webflow: collectionId is required');
        if (!itemId) throw new Error('Webflow: itemId is required');
        return this.request(
            `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ fieldData }),
            }
        );
    }

    /**
     * Publish one or more items live on the site.
     */
    async publishItems(collectionId: string, itemIds: string[]): Promise<Record<string, unknown>> {
        if (!collectionId) throw new Error('Webflow: collectionId is required');
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            throw new Error('Webflow: at least one itemId is required to publish');
        }
        return this.request(
            `/collections/${encodeURIComponent(collectionId)}/items/publish`,
            {
                method: 'POST',
                body: JSON.stringify({ itemIds }),
            }
        );
    }
}

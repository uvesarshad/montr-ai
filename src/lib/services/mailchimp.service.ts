/**
 * Mailchimp Service
 *
 * Thin wrapper around the Mailchimp Marketing API 3.0. IMPORT-ONLY by product
 * decision: every method here is a GET (read/list/search). There are no
 * create/update/delete/subscribe calls and none should ever be added.
 * Rationale + the full stance (incl. HubSpot/Zoho/Shopify): see
 * docs/modules/integrations.md → "Write-back Policy".
 *
 * Auth: OAuth bearer token (`accessToken`) or a classic API key (`apiKey`),
 * whose datacenter suffix (after the dash, e.g. `xxxx-us21`) names the API host.
 */
import { createHash } from 'node:crypto';
import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface MailchimpServiceOptions {
    /** OAuth access token (preferred). */
    accessToken?: string;
    /** Classic API key fallback (datacenter is the part after the dash). */
    apiKey?: string;
    /** Full API endpoint, e.g. https://us21.api.mailchimp.com */
    apiEndpoint?: string;
    /** Datacenter shorthand, e.g. "us21" — used to derive the endpoint. */
    dc?: string;
}

export interface MailchimpListPage {
    count?: number;
    offset?: number;
}

export interface MailchimpMembersQuery extends MailchimpListPage {
    /** subscribed | unsubscribed | cleaned | pending | transactional */
    status?: string;
}

export class MailchimpService {
    private accessToken?: string;
    private apiKey?: string;
    private baseUrl: string;

    constructor(options: MailchimpServiceOptions) {
        this.accessToken = options.accessToken?.trim() || undefined;
        this.apiKey = options.apiKey?.trim() || undefined;
        this.baseUrl = MailchimpService.resolveBaseUrl(options);
    }

    /** Derive the `https://{dc}.api.mailchimp.com` host from options/credentials. */
    private static resolveBaseUrl(options: MailchimpServiceOptions): string {
        const explicit = options.apiEndpoint?.trim();
        if (explicit) {
            return explicit.replace(/\/+$/, '');
        }
        let dc = options.dc?.trim();
        if (!dc && options.apiKey && options.apiKey.includes('-')) {
            dc = options.apiKey.split('-').pop()?.trim();
        }
        if (!dc) {
            throw new Error(
                'Mailchimp: cannot determine datacenter — provide apiEndpoint, dc, or an API key with a "-dc" suffix.'
            );
        }
        return `https://${dc}.api.mailchimp.com`;
    }

    /** md5 of the lowercased email address — Mailchimp's subscriber hash. */
    static subscriberHash(email: string): string {
        return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
    }

    private authHeader(): string {
        if (this.accessToken) {
            return `Bearer ${this.accessToken}`;
        }
        if (this.apiKey) {
            // Classic API-key auth uses HTTP basic with any username.
            const basic = Buffer.from(`anystring:${this.apiKey}`).toString('base64');
            return `Basic ${basic}`;
        }
        throw new Error('Mailchimp: an accessToken or apiKey is required.');
    }

    private async request(
        path: string,
        query?: Record<string, string | number | undefined>
    ): Promise<Record<string, unknown>> {
        const url = new URL(`${this.baseUrl}/3.0${path}`);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined && value !== null && value !== '') {
                    url.searchParams.set(key, String(value));
                }
            }
        }

        const response = await fetchWithRetry(
            url.toString(),
            {
                method: 'GET',
                headers: {
                    Authorization: this.authHeader(),
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(30_000),
            },
            { label: 'mailchimp' }
        );

        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
            const detail =
                (data?.detail as string | undefined) ||
                (data?.title as string | undefined) ||
                response.statusText;
            const text = `Mailchimp API: ${response.status} — ${detail}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'mailchimp');
            }
            throw new Error(text);
        }
        return data;
    }

    private static clampCount(count?: number): number {
        return Math.max(1, Math.min(Number(count) || 10, 100));
    }

    private static clampOffset(offset?: number): number {
        return Math.max(0, Number(offset) || 0);
    }

    /** GET /lists — all audiences (lists) on the account. */
    async listAudiences(page: MailchimpListPage = {}): Promise<Record<string, unknown>> {
        return this.request('/lists', {
            count: MailchimpService.clampCount(page.count),
            offset: MailchimpService.clampOffset(page.offset),
        });
    }

    /** GET /lists/{listId} — a single audience. */
    async getAudience(listId: string): Promise<Record<string, unknown>> {
        if (!listId) throw new Error('Mailchimp: listId is required.');
        return this.request(`/lists/${encodeURIComponent(listId)}`);
    }

    /** GET /lists/{listId}/members — members of an audience. */
    async listMembers(
        listId: string,
        query: MailchimpMembersQuery = {}
    ): Promise<Record<string, unknown>> {
        if (!listId) throw new Error('Mailchimp: listId is required.');
        return this.request(`/lists/${encodeURIComponent(listId)}/members`, {
            count: MailchimpService.clampCount(query.count),
            offset: MailchimpService.clampOffset(query.offset),
            status: query.status,
        });
    }

    /** GET /lists/{listId}/members/{subscriberHash} — one member by hash. */
    async getMember(listId: string, subscriberHash: string): Promise<Record<string, unknown>> {
        if (!listId) throw new Error('Mailchimp: listId is required.');
        if (!subscriberHash) throw new Error('Mailchimp: subscriberHash is required.');
        return this.request(
            `/lists/${encodeURIComponent(listId)}/members/${encodeURIComponent(subscriberHash)}`
        );
    }

    /** GET /search-members — search members across all audiences by query. */
    async searchMembers(query: string): Promise<Record<string, unknown>> {
        if (!query) throw new Error('Mailchimp: a search query is required.');
        return this.request('/search-members', { query });
    }

    /** GET /campaigns — campaigns on the account. */
    async listCampaigns(page: MailchimpListPage = {}): Promise<Record<string, unknown>> {
        return this.request('/campaigns', {
            count: MailchimpService.clampCount(page.count),
            offset: MailchimpService.clampOffset(page.offset),
        });
    }

    /** GET /reports/{campaignId} — performance report for a campaign. */
    async getCampaignReport(campaignId: string): Promise<Record<string, unknown>> {
        if (!campaignId) throw new Error('Mailchimp: campaignId is required.');
        return this.request(`/reports/${encodeURIComponent(campaignId)}`);
    }
}

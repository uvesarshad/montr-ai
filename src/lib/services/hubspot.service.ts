/**
 * HubSpot Service
 *
 * Thin wrapper around the HubSpot CRM v3 API. IMPORT-ONLY by product decision:
 * every method reads data. The only POST calls are to the `/search` endpoints,
 * which are reads despite the verb. There are NO object create/update/delete
 * calls and none should ever be added.
 *
 * Auth: OAuth bearer token (`accessToken`) via `Authorization: Bearer …`.
 */

import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface HubspotPage {
    /** Page size, capped at 100. */
    limit?: number;
    /** Opaque pagination cursor returned by HubSpot. */
    after?: string;
}

export interface HubspotFilter {
    propertyName: string;
    operator: string;
    value?: unknown;
    values?: unknown[];
}

export interface HubspotFilterGroup {
    filters: HubspotFilter[];
}

export interface HubspotSearchParams {
    /** Free-text query (mutually compatible with filterGroups). */
    query?: string;
    filterGroups?: HubspotFilterGroup[];
    properties?: string[];
    sorts?: unknown[];
    limit?: number;
    after?: string;
}

export class HubspotService {
    private accessToken: string;
    private baseUrl = 'https://api.hubapi.com';

    constructor(accessToken: string) {
        const token = accessToken?.trim();
        if (!token) throw new Error('HubSpot: an accessToken is required.');
        this.accessToken = token;
    }

    private async request(
        path: string,
        options: { method?: 'GET' | 'POST'; query?: Record<string, string | number | undefined>; body?: Record<string, unknown> } = {}
    ): Promise<Record<string, unknown>> {
        const { method = 'GET', query, body } = options;
        const url = new URL(`${this.baseUrl}${path}`);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined && value !== null && value !== '') {
                    url.searchParams.set(key, String(value));
                }
            }
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
        };
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        const response = await fetchWithRetry(
            url.toString(),
            {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(30_000),
            },
            { label: 'hubspot' }
        );

        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
            const message =
                (data?.message as string | undefined) ||
                (data?.category as string | undefined) ||
                response.statusText;
            const text = `HubSpot API: ${response.status} — ${message}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'hubspot');
            }
            throw new Error(text);
        }
        return data;
    }

    private static clampLimit(limit?: number): number {
        return Math.max(1, Math.min(Number(limit) || 10, 100));
    }

    private buildSearchBody(params: HubspotSearchParams): Record<string, unknown> {
        const body: Record<string, unknown> = {
            limit: HubspotService.clampLimit(params.limit),
        };
        if (params.query) body.query = params.query;
        if (params.filterGroups && params.filterGroups.length > 0) {
            body.filterGroups = params.filterGroups;
        }
        if (params.properties && params.properties.length > 0) {
            body.properties = params.properties;
        }
        if (params.sorts && params.sorts.length > 0) body.sorts = params.sorts;
        if (params.after) body.after = params.after;
        return body;
    }

    // --- Contacts -----------------------------------------------------------

    /** GET /crm/v3/objects/contacts/{id} */
    async getContact(id: string, properties?: string[]): Promise<Record<string, unknown>> {
        if (!id) throw new Error('HubSpot: contact id is required.');
        return this.request(`/crm/v3/objects/contacts/${encodeURIComponent(id)}`, {
            query: { properties: properties?.length ? properties.join(',') : undefined },
        });
    }

    /** POST /crm/v3/objects/contacts/search (a read operation). */
    async searchContacts(params: HubspotSearchParams): Promise<Record<string, unknown>> {
        return this.request('/crm/v3/objects/contacts/search', {
            method: 'POST',
            body: this.buildSearchBody(params),
        });
    }

    /** GET /crm/v3/objects/contacts */
    async listContacts(page: HubspotPage = {}): Promise<Record<string, unknown>> {
        return this.request('/crm/v3/objects/contacts', {
            query: { limit: HubspotService.clampLimit(page.limit), after: page.after },
        });
    }

    // --- Companies ----------------------------------------------------------

    /** GET /crm/v3/objects/companies/{id} */
    async getCompany(id: string, properties?: string[]): Promise<Record<string, unknown>> {
        if (!id) throw new Error('HubSpot: company id is required.');
        return this.request(`/crm/v3/objects/companies/${encodeURIComponent(id)}`, {
            query: { properties: properties?.length ? properties.join(',') : undefined },
        });
    }

    /** POST /crm/v3/objects/companies/search (a read operation). */
    async searchCompanies(params: HubspotSearchParams): Promise<Record<string, unknown>> {
        return this.request('/crm/v3/objects/companies/search', {
            method: 'POST',
            body: this.buildSearchBody(params),
        });
    }

    /** GET /crm/v3/objects/companies */
    async listCompanies(page: HubspotPage = {}): Promise<Record<string, unknown>> {
        return this.request('/crm/v3/objects/companies', {
            query: { limit: HubspotService.clampLimit(page.limit), after: page.after },
        });
    }

    // --- Deals --------------------------------------------------------------

    /** GET /crm/v3/objects/deals/{id} */
    async getDeal(id: string, properties?: string[]): Promise<Record<string, unknown>> {
        if (!id) throw new Error('HubSpot: deal id is required.');
        return this.request(`/crm/v3/objects/deals/${encodeURIComponent(id)}`, {
            query: { properties: properties?.length ? properties.join(',') : undefined },
        });
    }

    /** POST /crm/v3/objects/deals/search (a read operation). */
    async searchDeals(params: HubspotSearchParams): Promise<Record<string, unknown>> {
        return this.request('/crm/v3/objects/deals/search', {
            method: 'POST',
            body: this.buildSearchBody(params),
        });
    }

    /** GET /crm/v3/objects/deals */
    async listDeals(page: HubspotPage = {}): Promise<Record<string, unknown>> {
        return this.request('/crm/v3/objects/deals', {
            query: { limit: HubspotService.clampLimit(page.limit), after: page.after },
        });
    }

    // --- Lists --------------------------------------------------------------

    /** POST /crm/v3/lists/search (a read/search operation). */
    async listLists(limit?: number): Promise<Record<string, unknown>> {
        return this.request('/crm/v3/lists/search', {
            method: 'POST',
            body: { count: HubspotService.clampLimit(limit) },
        });
    }

    /** GET /crm/v3/lists/{listId}/memberships — members of a list. */
    async getListMemberships(
        listId: string,
        page: HubspotPage = {}
    ): Promise<Record<string, unknown>> {
        if (!listId) throw new Error('HubSpot: listId is required.');
        return this.request(`/crm/v3/lists/${encodeURIComponent(listId)}/memberships`, {
            query: { limit: HubspotService.clampLimit(page.limit), after: page.after },
        });
    }
}

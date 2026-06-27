/**
 * Apollo.io Service
 * Thin client over the Apollo.io REST API (v1) for people/organization
 * enrichment and search. Import-only: no sequence/write operations.
 *
 * Auth: API key passed as the `X-Api-Key` header.
 * Docs: https://docs.apollo.io/reference
 */

import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface ApolloEnrichPersonInput {
    email?: string;
    name?: string;
    domain?: string;
    linkedin_url?: string;
}

export interface ApolloSearchPeopleInput {
    q_keywords?: string;
    person_titles?: string[];
    organization_domains?: string[];
    page?: number;
    per_page?: number;
}

export class ApolloService {
    private apiKey: string;
    private baseUrl = 'https://api.apollo.io/api/v1';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private async request(
        endpoint: string,
        options: RequestInit = {},
    ): Promise<Record<string, unknown>> {
        const response = await fetchWithRetry(
            `${this.baseUrl}${endpoint}`,
            {
                ...options,
                headers: {
                    'X-Api-Key': this.apiKey,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...options.headers,
                },
                signal: AbortSignal.timeout(30_000),
            },
            { label: 'apollo' }
        );

        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
            const message =
                (data?.error as string | undefined) ||
                (data?.message as string | undefined) ||
                response.statusText;
            const text = `Apollo API Error: ${response.status} — ${message}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'apollo');
            }
            throw new Error(text);
        }
        return data;
    }

    /**
     * Enrich a single person from any combination of email / name / domain /
     * linkedin_url. POST /people/match.
     */
    async enrichPerson(input: ApolloEnrichPersonInput): Promise<Record<string, unknown>> {
        const body: Record<string, unknown> = {};
        if (input.email) body.email = input.email;
        if (input.name) body.name = input.name;
        if (input.domain) body.domain = input.domain;
        if (input.linkedin_url) body.linkedin_url = input.linkedin_url;
        if (Object.keys(body).length === 0) {
            throw new Error('Apollo: enrichPerson requires one of email, name, domain or linkedin_url');
        }
        return this.request('/people/match', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Search people. POST /mixed_people/search. per_page is capped at 100.
     */
    async searchPeople(input: ApolloSearchPeopleInput): Promise<Record<string, unknown>> {
        const page = Math.max(1, Number(input.page) || 1);
        const perPage = Math.max(1, Math.min(Number(input.per_page) || 25, 100));
        const body: Record<string, unknown> = { page, per_page: perPage };
        if (input.q_keywords) body.q_keywords = input.q_keywords;
        if (input.person_titles?.length) body.person_titles = input.person_titles;
        if (input.organization_domains?.length) {
            body.organization_domains = input.organization_domains;
        }
        return this.request('/mixed_people/search', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Enrich an organization by domain. GET /organizations/enrich?domain=
     */
    async enrichOrganization(domain: string): Promise<Record<string, unknown>> {
        if (!domain) throw new Error('Apollo: enrichOrganization requires a domain');
        return this.request(`/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
            method: 'GET',
        });
    }
}

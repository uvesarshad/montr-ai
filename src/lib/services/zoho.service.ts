/**
 * Zoho Service (read-only — import direction).
 *
 * Covers two Zoho products:
 *  - Zoho CRM v2  — record reads (Leads / Contacts / Deals / Accounts).
 *  - Zoho Campaigns — mailing lists and recent campaigns.
 *
 * Auth: an OAuth access token, sent as `Authorization: Zoho-oauthtoken {token}`.
 *
 * Data centers: Zoho is multi-region. The CRM API domain is stored on the
 * connection metadata (`apiDomain`, e.g. https://www.zohoapis.com or a
 * regional variant). Campaigns uses a region TLD (com / eu / in / au / …)
 * which we derive from `metadata.region` (default 'com').
 */
import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface ZohoCredentials {
    accessToken?: string;
}

export interface ZohoServiceOptions {
    /** CRM API domain from connection metadata, e.g. https://www.zohoapis.com */
    apiDomain?: string;
    /** Campaigns region TLD: com | eu | in | au | jp | ca. Defaults to 'com'. */
    region?: string;
}

export interface ZohoGetRecordsOptions {
    page?: number;
    per_page?: number;
    fields?: string | string[];
}

export interface ZohoSearchOptions {
    /** Raw COQL-style criteria, e.g. ((Last_Name:equals:Doe)) */
    criteria?: string;
    word?: string;
    email?: string;
    phone?: string;
    page?: number;
    per_page?: number;
}

export interface ZohoRecordsResult {
    records: Record<string, unknown>[];
    info?: Record<string, unknown>;
}

/** Zoho CRM modules this service is allowed to read. */
export const ZOHO_CRM_MODULES = ['Leads', 'Contacts', 'Deals', 'Accounts'] as const;
export type ZohoCrmModule = (typeof ZOHO_CRM_MODULES)[number];

/** Zoho caps per_page at 200. */
const MAX_PER_PAGE = 200;

export class ZohoService {
    private token: string;
    private apiDomain: string;
    private region: string;

    constructor(credentials: ZohoCredentials, options: ZohoServiceOptions = {}) {
        this.token = (credentials.accessToken || '').trim();
        if (!this.token) {
            throw new Error('Zoho: an OAuth access token is required');
        }
        this.apiDomain = (options.apiDomain || 'https://www.zohoapis.com').replace(/\/+$/, '');
        this.region = (options.region || 'com').replace(/^\.+|\.+$/g, '');
    }

    private get campaignsBase(): string {
        return `https://campaigns.zoho.${this.region}`;
    }

    private authHeaders(): Record<string, string> {
        return {
            Authorization: `Zoho-oauthtoken ${this.token}`,
            'Content-Type': 'application/json',
        };
    }

    private async request<T = Record<string, unknown>>(url: string): Promise<T> {
        const response = await fetchWithRetry(
            url,
            {
                method: 'GET',
                headers: this.authHeaders(),
                signal: AbortSignal.timeout(30_000),
            },
            { label: 'zoho' }
        );

        // 204 = no content (e.g. empty record set) — return an empty shape.
        if (response.status === 204) {
            return {} as T;
        }

        const data = (await response.json().catch(() => ({}))) as {
            message?: string;
            code?: string;
            status?: string;
        };

        if (!response.ok) {
            const message = data.message || data.code || response.statusText;
            const text = `Zoho API Error: ${response.status} — ${message}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'zoho');
            }
            throw new Error(text);
        }

        return data as T;
    }

    private assertModule(module: string): ZohoCrmModule {
        if (!(ZOHO_CRM_MODULES as readonly string[]).includes(module)) {
            throw new Error(
                `Zoho: unsupported CRM module "${module}". Supported: ${ZOHO_CRM_MODULES.join(', ')}`
            );
        }
        return module as ZohoCrmModule;
    }

    private clampPerPage(perPage?: number): number {
        const n = Number(perPage) || 200;
        return Math.max(1, Math.min(n, MAX_PER_PAGE));
    }

    // ── Zoho CRM (read) ─────────────────────────────────────────────

    /**
     * Get records from a CRM module (GET /crm/v2/{module}).
     */
    async getRecords(module: string, options: ZohoGetRecordsOptions = {}): Promise<ZohoRecordsResult> {
        const mod = this.assertModule(module);
        const params = new URLSearchParams();
        if (options.page) params.set('page', String(options.page));
        params.set('per_page', String(this.clampPerPage(options.per_page)));
        if (options.fields) {
            params.set(
                'fields',
                Array.isArray(options.fields) ? options.fields.join(',') : options.fields
            );
        }
        const data = await this.request<{ data?: Record<string, unknown>[]; info?: Record<string, unknown> }>(
            `${this.apiDomain}/crm/v2/${encodeURIComponent(mod)}?${params.toString()}`
        );
        return { records: data.data || [], info: data.info };
    }

    /**
     * Get a single CRM record (GET /crm/v2/{module}/{id}).
     */
    async getRecord(module: string, id: string): Promise<Record<string, unknown> | null> {
        const mod = this.assertModule(module);
        if (!id) throw new Error('Zoho: a record id is required');
        const data = await this.request<{ data?: Record<string, unknown>[] }>(
            `${this.apiDomain}/crm/v2/${encodeURIComponent(mod)}/${encodeURIComponent(id)}`
        );
        return data.data?.[0] || null;
    }

    /**
     * Search CRM records (GET /crm/v2/{module}/search).
     * Accepts criteria, or word/email/phone search params.
     */
    async searchRecords(module: string, options: ZohoSearchOptions = {}): Promise<ZohoRecordsResult> {
        const mod = this.assertModule(module);
        if (!options.criteria && !options.word && !options.email && !options.phone) {
            throw new Error('Zoho: search requires one of criteria, word, email or phone');
        }
        const params = new URLSearchParams();
        if (options.criteria) params.set('criteria', options.criteria);
        if (options.word) params.set('word', options.word);
        if (options.email) params.set('email', options.email);
        if (options.phone) params.set('phone', options.phone);
        if (options.page) params.set('page', String(options.page));
        params.set('per_page', String(this.clampPerPage(options.per_page)));

        const data = await this.request<{ data?: Record<string, unknown>[]; info?: Record<string, unknown> }>(
            `${this.apiDomain}/crm/v2/${encodeURIComponent(mod)}/search?${params.toString()}`
        );
        return { records: data.data || [], info: data.info };
    }

    // ── Zoho Campaigns (read) ───────────────────────────────────────

    /**
     * List mailing lists (GET /api/v1.1/getmailinglists).
     */
    async getMailingLists(): Promise<Record<string, unknown>> {
        return this.request<Record<string, unknown>>(
            `${this.campaignsBase}/api/v1.1/getmailinglists?resfmt=JSON`
        );
    }

    /**
     * List recent campaigns (GET /api/v1.1/recentcampaigns).
     */
    async getCampaigns(): Promise<Record<string, unknown>> {
        return this.request<Record<string, unknown>>(
            `${this.campaignsBase}/api/v1.1/recentcampaigns?resfmt=JSON`
        );
    }
}

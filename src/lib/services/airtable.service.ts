/**
 * Airtable Service
 * Wraps the Airtable Web API (REST v0) — bases, tables and records.
 *
 * Auth: a Personal Access Token (PAT) or OAuth access token, sent as a
 * Bearer credential. Either `accessToken` or `apiKey` is accepted.
 *
 * Rate limit: Airtable allows 5 requests/sec per base. Single calls do not
 * need client-side throttling, but a 429 means "back off" — handled by the
 * shared fetchWithRetry wrapper (honors Retry-After, exponential backoff).
 */
import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface AirtableCredentials {
    accessToken?: string;
    apiKey?: string;
}

export interface AirtableBase {
    id: string;
    name: string;
    permissionLevel?: string;
}

export interface AirtableTable {
    id: string;
    name: string;
    primaryFieldId?: string;
    fields?: unknown[];
    views?: unknown[];
}

export interface AirtableRecord {
    id: string;
    fields: Record<string, unknown>;
    createdTime?: string;
}

export interface AirtableRecordInput {
    /** Provided when updating; omit when creating. */
    id?: string;
    fields: Record<string, unknown>;
}

export interface ListRecordsOptions {
    filterByFormula?: string;
    maxRecords?: number;
    pageSize?: number;
    offset?: string;
    view?: string;
    sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
}

export interface ListRecordsResult {
    records: AirtableRecord[];
    offset?: string;
}

/** Airtable accepts at most 10 records per create/update/delete call. */
const RECORD_BATCH = 10;
/** Airtable caps pageSize at 100. */
const MAX_PAGE_SIZE = 100;

export class AirtableService {
    private token: string;
    private baseUrl = 'https://api.airtable.com/v0';

    constructor(credentials: AirtableCredentials) {
        this.token = (credentials.accessToken || credentials.apiKey || '').trim();
        if (!this.token) {
            throw new Error('Airtable: an access token or API key (PAT) is required');
        }
    }

    private async request<T = Record<string, unknown>>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const response = await fetchWithRetry(
            `${this.baseUrl}${endpoint}`,
            {
                ...options,
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                signal: AbortSignal.timeout(30_000),
            },
            { label: 'airtable' }
        );

        if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as {
                error?: { message?: string; type?: string } | string;
            };
            const err = data.error;
            const message =
                typeof err === 'string'
                    ? err
                    : err?.message || err?.type || response.statusText;
            const text = `Airtable API Error: ${response.status} — ${message}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'airtable');
            }
            throw new Error(text);
        }

        return (await response.json().catch(() => ({}))) as T;
    }

    /**
     * List bases accessible to the token (GET /v0/meta/bases).
     */
    async listBases(): Promise<AirtableBase[]> {
        const data = await this.request<{ bases?: AirtableBase[] }>('/meta/bases');
        return data.bases || [];
    }

    /**
     * List tables in a base (GET /v0/meta/bases/{baseId}/tables).
     */
    async listTables(baseId: string): Promise<AirtableTable[]> {
        if (!baseId) throw new Error('Airtable: baseId is required to list tables');
        const data = await this.request<{ tables?: AirtableTable[] }>(
            `/meta/bases/${encodeURIComponent(baseId)}/tables`
        );
        return data.tables || [];
    }

    /**
     * List records in a table. Supports filtering, sorting and pagination.
     */
    async listRecords(
        baseId: string,
        tableIdOrName: string,
        options: ListRecordsOptions = {}
    ): Promise<ListRecordsResult> {
        if (!baseId) throw new Error('Airtable: baseId is required to list records');
        if (!tableIdOrName) throw new Error('Airtable: table id or name is required to list records');

        const params = new URLSearchParams();
        if (options.filterByFormula) params.set('filterByFormula', options.filterByFormula);
        if (options.maxRecords) params.set('maxRecords', String(options.maxRecords));
        if (options.pageSize) {
            params.set('pageSize', String(Math.min(options.pageSize, MAX_PAGE_SIZE)));
        }
        if (options.offset) params.set('offset', options.offset);
        if (options.view) params.set('view', options.view);
        if (options.sort) {
            options.sort.forEach((s, i) => {
                params.set(`sort[${i}][field]`, s.field);
                if (s.direction) params.set(`sort[${i}][direction]`, s.direction);
            });
        }

        const qs = params.toString();
        const data = await this.request<{ records?: AirtableRecord[]; offset?: string }>(
            `/${encodeURIComponent(baseId)}/${encodeURIComponent(tableIdOrName)}${qs ? `?${qs}` : ''}`
        );
        return { records: data.records || [], offset: data.offset };
    }

    /**
     * Retrieve a single record.
     */
    async getRecord(
        baseId: string,
        tableIdOrName: string,
        recordId: string
    ): Promise<AirtableRecord> {
        if (!baseId || !tableIdOrName || !recordId) {
            throw new Error('Airtable: baseId, table and recordId are required to get a record');
        }
        return this.request<AirtableRecord>(
            `/${encodeURIComponent(baseId)}/${encodeURIComponent(tableIdOrName)}/${encodeURIComponent(recordId)}`
        );
    }

    /**
     * Create records (POST). Chunked to Airtable's 10-records-per-call cap.
     */
    async createRecords(
        baseId: string,
        tableIdOrName: string,
        records: AirtableRecordInput[],
        typecast = false
    ): Promise<AirtableRecord[]> {
        if (!baseId || !tableIdOrName) {
            throw new Error('Airtable: baseId and table are required to create records');
        }
        if (!records.length) return [];

        const created: AirtableRecord[] = [];
        for (let i = 0; i < records.length; i += RECORD_BATCH) {
            const batch = records.slice(i, i + RECORD_BATCH).map((r) => ({ fields: r.fields }));
            const data = await this.request<{ records?: AirtableRecord[] }>(
                `/${encodeURIComponent(baseId)}/${encodeURIComponent(tableIdOrName)}`,
                {
                    method: 'POST',
                    body: JSON.stringify({ records: batch, typecast }),
                }
            );
            created.push(...(data.records || []));
        }
        return created;
    }

    /**
     * Update records (PATCH — partial update). Chunked to 10 per call.
     * Each input must carry an `id`.
     */
    async updateRecords(
        baseId: string,
        tableIdOrName: string,
        records: AirtableRecordInput[],
        typecast = false
    ): Promise<AirtableRecord[]> {
        if (!baseId || !tableIdOrName) {
            throw new Error('Airtable: baseId and table are required to update records');
        }
        if (!records.length) return [];
        if (records.some((r) => !r.id)) {
            throw new Error('Airtable: every record to update must include an id');
        }

        const updated: AirtableRecord[] = [];
        for (let i = 0; i < records.length; i += RECORD_BATCH) {
            const batch = records
                .slice(i, i + RECORD_BATCH)
                .map((r) => ({ id: r.id, fields: r.fields }));
            const data = await this.request<{ records?: AirtableRecord[] }>(
                `/${encodeURIComponent(baseId)}/${encodeURIComponent(tableIdOrName)}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ records: batch, typecast }),
                }
            );
            updated.push(...(data.records || []));
        }
        return updated;
    }

    /**
     * Delete records. Chunked to 10 per call.
     */
    async deleteRecords(
        baseId: string,
        tableIdOrName: string,
        recordIds: string[]
    ): Promise<Array<{ id: string; deleted: boolean }>> {
        if (!baseId || !tableIdOrName) {
            throw new Error('Airtable: baseId and table are required to delete records');
        }
        if (!recordIds.length) return [];

        const deleted: Array<{ id: string; deleted: boolean }> = [];
        for (let i = 0; i < recordIds.length; i += RECORD_BATCH) {
            const batch = recordIds.slice(i, i + RECORD_BATCH);
            const params = new URLSearchParams();
            batch.forEach((id) => params.append('records[]', id));
            const data = await this.request<{ records?: Array<{ id: string; deleted: boolean }> }>(
                `/${encodeURIComponent(baseId)}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`,
                { method: 'DELETE' }
            );
            deleted.push(...(data.records || []));
        }
        return deleted;
    }
}

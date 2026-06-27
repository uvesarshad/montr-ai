/**
 * Semrush Service
 * Thin client over the Semrush Analytics API. Import-only.
 *
 * Responses are CSV-like: `;`-separated, the first line is the header row, and
 * an error body arrives as `ERROR XX :: message`. parseSemrushCsv() turns the
 * payload into Array<Record<string,string>> (or throws on an ERROR body).
 *
 * Auth: API key passed as the `key` query parameter.
 * Docs: https://developer.semrush.com/api/
 */

import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export type SemrushRow = Record<string, string>;

export class SemrushService {
    private apiKey: string;
    private baseUrl = 'https://api.semrush.com';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Parse a Semrush CSV-like body into rows. Detects `ERROR XX :: message`
     * bodies and throws a labelled error.
     */
    static parseCsv(body: string): SemrushRow[] {
        const text = (body || '').trim();
        if (!text) return [];
        if (/^ERROR\b/i.test(text)) {
            throw new Error(`Semrush API Error: ${text}`);
        }
        const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
        if (lines.length === 0) return [];
        const headers = lines[0].split(';');
        return lines.slice(1).map((line) => {
            const cols = line.split(';');
            const row: SemrushRow = {};
            headers.forEach((header, i) => {
                row[header] = cols[i] ?? '';
            });
            return row;
        });
    }

    private async request(url: string): Promise<SemrushRow[]> {
        const response = await fetchWithRetry(
            url,
            {
                method: 'GET',
                headers: { Accept: 'text/plain' },
                signal: AbortSignal.timeout(30_000),
            },
            { label: 'semrush' }
        );
        const body = await response.text().catch(() => '');
        if (!response.ok) {
            const text = `Semrush API Error: ${response.status} — ${body || response.statusText}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'semrush');
            }
            throw new Error(text);
        }
        return SemrushService.parseCsv(body);
    }

    /**
     * Domain overview — ranks and traffic for a domain.
     * type=domain_ranks
     */
    async domainOverview(domain: string, database = 'us'): Promise<SemrushRow[]> {
        if (!domain) throw new Error('Semrush: domainOverview requires a domain');
        const params = new URLSearchParams({
            type: 'domain_ranks',
            key: this.apiKey,
            domain,
            database,
            export_columns: 'Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac',
        });
        return this.request(`${this.baseUrl}/?${params.toString()}`);
    }

    /**
     * Keyword overview — volume, CPC, competition for a phrase.
     * type=phrase_this
     */
    async keywordOverview(phrase: string, database = 'us'): Promise<SemrushRow[]> {
        if (!phrase) throw new Error('Semrush: keywordOverview requires a phrase');
        const params = new URLSearchParams({
            type: 'phrase_this',
            key: this.apiKey,
            phrase,
            database,
            export_columns: 'Ph,Nq,Cp,Co,Nr',
        });
        return this.request(`${this.baseUrl}/?${params.toString()}`);
    }

    /**
     * Backlinks summary — authority score and totals for a root domain.
     * Analytics v1 endpoint, type=backlinks_overview
     */
    async backlinksSummary(target: string): Promise<SemrushRow[]> {
        if (!target) throw new Error('Semrush: backlinksSummary requires a target');
        const params = new URLSearchParams({
            type: 'backlinks_overview',
            key: this.apiKey,
            target,
            target_type: 'root_domain',
            export_columns: 'ascore,total,domains_num,urls_num,ips_num',
        });
        return this.request(`${this.baseUrl}/analytics/v1/?${params.toString()}`);
    }
}

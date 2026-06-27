import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SemrushService } from './semrush.service';

function textResponse(body: string, status = 200): Response {
    return new Response(body, {
        status,
        headers: { 'Content-Type': 'text/plain' },
    });
}

describe('SemrushService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('parseCsv', () => {
        it('parses `;`-separated rows into objects keyed by the header row', () => {
            const csv = 'Ph;Nq;Cp\nseo tools;1000;2.50\nbacklinks;500;1.10';
            const rows = SemrushService.parseCsv(csv);
            expect(rows).toEqual([
                { Ph: 'seo tools', Nq: '1000', Cp: '2.50' },
                { Ph: 'backlinks', Nq: '500', Cp: '1.10' },
            ]);
        });

        it('throws on an `ERROR XX :: message` body', () => {
            expect(() => SemrushService.parseCsv('ERROR 50 :: NOTHING FOUND')).toThrow(
                /Semrush API Error: ERROR 50 :: NOTHING FOUND/
            );
        });

        it('returns [] for an empty body', () => {
            expect(SemrushService.parseCsv('')).toEqual([]);
        });
    });

    it('domainOverview builds the query with the key and parses CSV', async () => {
        fetchMock.mockResolvedValue(textResponse('Dn;Rk\nexample.com;42'));
        const svc = new SemrushService('key1');
        const rows = await svc.domainOverview('example.com', 'uk');
        const parsed = new URL(fetchMock.mock.calls[0][0]);
        expect(parsed.origin + parsed.pathname).toBe('https://api.semrush.com/');
        expect(parsed.searchParams.get('type')).toBe('domain_ranks');
        expect(parsed.searchParams.get('key')).toBe('key1');
        expect(parsed.searchParams.get('domain')).toBe('example.com');
        expect(parsed.searchParams.get('database')).toBe('uk');
        expect(rows).toEqual([{ Dn: 'example.com', Rk: '42' }]);
    });

    it('keywordOverview sends type=phrase_this with the phrase', async () => {
        fetchMock.mockResolvedValue(textResponse('Ph;Nq\nseo;1000'));
        const svc = new SemrushService('key1');
        await svc.keywordOverview('seo');
        const parsed = new URL(fetchMock.mock.calls[0][0]);
        expect(parsed.searchParams.get('type')).toBe('phrase_this');
        expect(parsed.searchParams.get('phrase')).toBe('seo');
    });

    it('backlinksSummary uses the analytics/v1 endpoint', async () => {
        fetchMock.mockResolvedValue(textResponse('ascore;total\n50;100'));
        const svc = new SemrushService('key1');
        await svc.backlinksSummary('example.com');
        const parsed = new URL(fetchMock.mock.calls[0][0]);
        expect(parsed.pathname).toBe('/analytics/v1/');
        expect(parsed.searchParams.get('type')).toBe('backlinks_overview');
    });

    it('throws with the provider name + status on non-2xx', async () => {
        fetchMock.mockResolvedValue(textResponse('Forbidden', 403));
        const svc = new SemrushService('key1');
        await expect(svc.domainOverview('example.com')).rejects.toThrow(
            /Semrush API Error: 403 — Forbidden/
        );
    });

    it('throws on an ERROR body returned with a 200 status (CSV parser path)', async () => {
        fetchMock.mockResolvedValue(textResponse('ERROR 50 :: NOTHING FOUND'));
        const svc = new SemrushService('key1');
        await expect(svc.keywordOverview('zzz')).rejects.toThrow(/Semrush API Error: ERROR 50/);
    });
});

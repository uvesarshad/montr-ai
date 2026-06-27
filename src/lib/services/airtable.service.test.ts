import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AirtableService } from './airtable.service';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('AirtableService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requires a token', () => {
        expect(() => new AirtableService({})).toThrow(/access token or API key/);
    });

    it('listBases builds the meta URL with Bearer auth and unwraps bases', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ bases: [{ id: 'b1', name: 'B' }] }));
        const svc = new AirtableService({ accessToken: 'pat' });
        const res = await svc.listBases();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.airtable.com/v0/meta/bases');
        expect(init.headers.Authorization).toBe('Bearer pat');
        expect(res).toEqual([{ id: 'b1', name: 'B' }]);
    });

    it('listRecords caps pageSize at 100 and encodes sort params', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ records: [], offset: 'next' }));
        const svc = new AirtableService({ apiKey: 'pat' });
        const res = await svc.listRecords('base1', 'Table 1', {
            pageSize: 500,
            sort: [{ field: 'Name', direction: 'desc' }],
            filterByFormula: '{x}=1',
        });
        const parsed = new URL(fetchMock.mock.calls[0][0]);
        expect(parsed.pathname).toBe('/v0/base1/Table%201');
        expect(parsed.searchParams.get('pageSize')).toBe('100'); // capped
        expect(parsed.searchParams.get('sort[0][field]')).toBe('Name');
        expect(parsed.searchParams.get('sort[0][direction]')).toBe('desc');
        expect(parsed.searchParams.get('filterByFormula')).toBe('{x}=1');
        expect(res.offset).toBe('next');
    });

    it('createRecords chunks at 10 per call (11 records -> two fetches)', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ records: Array(10).fill({ id: 'r', fields: {} }) }))
            .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'r11', fields: {} }] }));
        const svc = new AirtableService({ accessToken: 'pat' });
        const inputs = Array.from({ length: 11 }, (_, i) => ({ fields: { n: i } }));
        const created = await svc.createRecords('b', 't', inputs);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).records).toHaveLength(10);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).records).toHaveLength(1);
        expect(fetchMock.mock.calls[0][1].method).toBe('POST');
        expect(created).toHaveLength(11);
    });

    it('updateRecords requires an id on every record', async () => {
        const svc = new AirtableService({ accessToken: 'pat' });
        await expect(
            svc.updateRecords('b', 't', [{ id: 'r1', fields: {} }, { fields: {} }])
        ).rejects.toThrow(/must include an id/);
    });

    it('retries on a 429 (shared fetchWithRetry backoff)', async () => {
        vi.useFakeTimers();
        try {
            fetchMock
                .mockResolvedValueOnce(new Response('', { status: 429 }))
                .mockResolvedValueOnce(jsonResponse({ bases: [{ id: 'b1', name: 'B' }] }));
            const svc = new AirtableService({ accessToken: 'pat' });
            const promise = svc.listBases();
            // first call already fired; advance past the (jittered) backoff window
            await vi.advanceTimersByTimeAsync(60_000);
            const res = await promise;
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(res).toEqual([{ id: 'b1', name: 'B' }]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('throws with the provider name on non-2xx', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ error: { message: 'Not found', type: 'NOT_FOUND' } }, 404)
        );
        const svc = new AirtableService({ accessToken: 'pat' });
        await expect(svc.getRecord('b', 't', 'r')).rejects.toThrow(
            /Airtable API Error: 404 — Not found/
        );
    });
});

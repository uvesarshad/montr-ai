import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebflowService } from './webflow.service';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('WebflowService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('listSites builds the v2 URL with Bearer auth and unwraps sites', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ sites: [{ id: 's1', displayName: 'S' }] }));
        const svc = new WebflowService('tok');
        const res = await svc.listSites();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.webflow.com/v2/sites');
        expect(init.headers.Authorization).toBe('Bearer tok');
        expect(res).toEqual([{ id: 's1', displayName: 'S' }]);
    });

    it('listItems caps the limit at 100 and returns items + pagination', async () => {
        const pagination = { limit: 100, offset: 0, total: 3 };
        fetchMock.mockResolvedValue(jsonResponse({ items: [{ id: 'i1', fieldData: {} }], pagination }));
        const svc = new WebflowService('tok');
        const res = await svc.listItems('col1', { limit: 500, offset: 0 });
        const parsed = new URL(fetchMock.mock.calls[0][0]);
        expect(parsed.pathname).toBe('/v2/collections/col1/items');
        expect(parsed.searchParams.get('limit')).toBe('100'); // capped
        expect(res.items).toHaveLength(1);
        expect(res.pagination).toEqual(pagination);
    });

    it('createItem POSTs isDraft + fieldData', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 'i1', fieldData: { name: 'x' } }));
        const svc = new WebflowService('tok');
        await svc.createItem('col1', { name: 'x' }, true);
        const init = fetchMock.mock.calls[0][1];
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({ isDraft: true, fieldData: { name: 'x' } });
    });

    it('publishItems requires at least one item id', async () => {
        const svc = new WebflowService('tok');
        await expect(svc.publishItems('col1', [])).rejects.toThrow(/at least one itemId/);
    });

    it('throws with the provider name on non-2xx', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));
        const svc = new WebflowService('tok');
        await expect(svc.getItem('col1', 'i1')).rejects.toThrow(
            /Webflow API Error: 404 — Not found/
        );
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HubspotService } from './hubspot.service';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('HubspotService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requires an access token', () => {
        expect(() => new HubspotService('')).toThrow(/accessToken is required/);
    });

    it('getContact builds URL, Bearer auth, GET, and joins properties', async () => {
        const payload = { id: '1', properties: {} };
        fetchMock.mockResolvedValue(jsonResponse(payload));
        const svc = new HubspotService('tok');
        const res = await svc.getContact('123', ['email', 'firstname']);
        const [url, init] = fetchMock.mock.calls[0];
        const parsed = new URL(url);
        expect(parsed.origin).toBe('https://api.hubapi.com');
        expect(parsed.pathname).toBe('/crm/v3/objects/contacts/123');
        expect(parsed.searchParams.get('properties')).toBe('email,firstname');
        expect(init.method).toBe('GET');
        expect(init.headers.Authorization).toBe('Bearer tok');
        expect(res).toEqual(payload);
    });

    it('searchContacts POSTs a body with the clamped limit', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
        const svc = new HubspotService('tok');
        await svc.searchContacts({ query: 'acme', limit: 999, properties: ['email'] });
        const [url, init] = fetchMock.mock.calls[0];
        expect(new URL(url).pathname).toBe('/crm/v3/objects/contacts/search');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/json');
        const body = JSON.parse(init.body);
        expect(body.limit).toBe(100); // clamped from 999
        expect(body.query).toBe('acme');
        expect(body.properties).toEqual(['email']);
    });

    it('listContacts clamps limit and forwards the after cursor', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
        const svc = new HubspotService('tok');
        await svc.listContacts({ limit: 250, after: 'cur1' });
        const parsed = new URL(fetchMock.mock.calls[0][0]);
        expect(parsed.searchParams.get('limit')).toBe('100');
        expect(parsed.searchParams.get('after')).toBe('cur1');
    });

    it('listLists POSTs the count to /crm/v3/lists/search', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ lists: [] }));
        const svc = new HubspotService('tok');
        await svc.listLists(10);
        const [url, init] = fetchMock.mock.calls[0];
        expect(new URL(url).pathname).toBe('/crm/v3/lists/search');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({ count: 10 });
    });

    it('throws with the provider name and message on non-2xx', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ message: 'invalid token' }, 401));
        const svc = new HubspotService('tok');
        await expect(svc.listDeals()).rejects.toThrow(/HubSpot API: 401 — invalid token/);
    });
});

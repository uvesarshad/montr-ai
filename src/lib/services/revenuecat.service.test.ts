import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RevenuecatService } from './revenuecat.service';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('RevenuecatService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('listProjects builds the v2 URL with Bearer auth', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ items: [{ id: 'proj1' }] }));
        const svc = new RevenuecatService('key1');
        const res = await svc.listProjects();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.revenuecat.com/v2/projects');
        expect(init.method).toBe('GET');
        expect(init.headers.Authorization).toBe('Bearer key1');
        expect(res).toEqual({ items: [{ id: 'proj1' }] });
    });

    it('getCustomer encodes project and customer ids into the path', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 'cust' }));
        const svc = new RevenuecatService('key1');
        await svc.getCustomer('proj1', 'cust 1');
        const parsed = new URL(fetchMock.mock.calls[0][0]);
        expect(parsed.pathname).toBe('/v2/projects/proj1/customers/cust%201');
    });

    it('listCustomerSubscriptions hits the subscriptions subpath', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
        const svc = new RevenuecatService('key1');
        await svc.listCustomerSubscriptions('proj1', 'cust1');
        expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe(
            '/v2/projects/proj1/customers/cust1/subscriptions'
        );
    });

    it('asserts required ids', async () => {
        const svc = new RevenuecatService('key1');
        await expect(svc.getCustomer('', 'c')).rejects.toThrow(/projectId is required/);
        await expect(svc.getCustomer('p', '')).rejects.toThrow(/customerId is required/);
        await expect(svc.listEntitlements('')).rejects.toThrow(/requires a projectId/);
    });

    it('throws with the provider name on non-2xx (nested error.message)', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'invalid key' } }, 401));
        const svc = new RevenuecatService('key1');
        await expect(svc.listProjects()).rejects.toThrow(/RevenueCat API Error: 401 — invalid key/);
    });
});

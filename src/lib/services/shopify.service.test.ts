import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShopifyService } from './shopify.service';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('ShopifyService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requires shop domain and access token', () => {
        expect(() => new ShopifyService('', 'tok')).toThrow(/shop domain is required/);
        expect(() => new ShopifyService('shop.myshopify.com', '')).toThrow(/access token is required/);
    });

    it('getShop POSTs GraphQL to the normalized endpoint with the access token header', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: { shop: { id: 'gid://shopify/Shop/1', name: 'S' } } }));
        // pass a URL form to prove protocol/trailing-slash normalization
        const svc = new ShopifyService('https://demo.myshopify.com/', 'shpat_x');
        const shop = await svc.getShop();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://demo.myshopify.com/admin/api/2024-10/graphql.json');
        expect(init.method).toBe('POST');
        expect(init.headers['X-Shopify-Access-Token']).toBe('shpat_x');
        expect(JSON.parse(init.body).query).toContain('query Shop');
        expect(shop).toEqual({ id: 'gid://shopify/Shop/1', name: 'S' });
    });

    it('listProducts caps `first` at 50 and unwraps edges/pageInfo', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                data: {
                    products: {
                        edges: [{ node: { id: 'p1', title: 'A' } }],
                        pageInfo: { hasNextPage: true, endCursor: 'cur1' },
                    },
                },
            })
        );
        const svc = new ShopifyService('demo.myshopify.com', 'shpat_x');
        const res = await svc.listProducts({ first: 500, query: 'status:active' });
        const variables = JSON.parse(fetchMock.mock.calls[0][1].body).variables;
        expect(variables.first).toBe(50); // capped
        expect(variables.query).toBe('status:active');
        expect(res.nodes).toEqual([{ id: 'p1', title: 'A' }]);
        expect(res.pageInfo).toEqual({ hasNextPage: true, endCursor: 'cur1' });
    });

    it('getProduct normalizes a numeric id into a gid', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: { product: { id: 'gid://shopify/Product/123' } } }));
        const svc = new ShopifyService('demo.myshopify.com', 'shpat_x');
        await svc.getProduct(123);
        const variables = JSON.parse(fetchMock.mock.calls[0][1].body).variables;
        expect(variables.id).toBe('gid://shopify/Product/123');
    });

    it('getProduct passes an already-formed gid through untouched', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: { product: null } }));
        const svc = new ShopifyService('demo.myshopify.com', 'shpat_x');
        const res = await svc.getProduct('gid://shopify/Product/999');
        const variables = JSON.parse(fetchMock.mock.calls[0][1].body).variables;
        expect(variables.id).toBe('gid://shopify/Product/999');
        expect(res).toBeNull();
    });

    it('throws on a GraphQL errors array (HTTP 200)', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ errors: [{ message: 'Field invalid' }] }));
        const svc = new ShopifyService('demo.myshopify.com', 'shpat_x');
        await expect(svc.getShop()).rejects.toThrow(/Shopify: Field invalid/);
    });

    it('throws on HTTP non-2xx with the provider name', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ errors: [{ message: 'Unauthorized' }] }, 401));
        const svc = new ShopifyService('demo.myshopify.com', 'shpat_x');
        await expect(svc.getShop()).rejects.toThrow(/Shopify: 401 — Unauthorized/);
    });
});

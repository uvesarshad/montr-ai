import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApolloService } from './apollo.service';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('ApolloService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('enrichPerson POSTs to /people/match with X-Api-Key and only the provided fields', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ person: { id: 'p1' } }));
        const svc = new ApolloService('key1');
        const res = await svc.enrichPerson({ email: 'a@b.com', domain: 'b.com' });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.apollo.io/api/v1/people/match');
        expect(init.method).toBe('POST');
        expect(init.headers['X-Api-Key']).toBe('key1');
        expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com', domain: 'b.com' });
        expect(res).toEqual({ person: { id: 'p1' } });
    });

    it('enrichPerson requires at least one identifier', async () => {
        const svc = new ApolloService('key1');
        await expect(svc.enrichPerson({})).rejects.toThrow(/requires one of email, name, domain/);
    });

    it('searchPeople caps per_page at 100 and forwards filters', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ people: [] }));
        const svc = new ApolloService('key1');
        await svc.searchPeople({ per_page: 999, page: 3, person_titles: ['CEO'], q_keywords: 'x' });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.apollo.io/api/v1/mixed_people/search');
        const body = JSON.parse(init.body);
        expect(body.per_page).toBe(100); // capped
        expect(body.page).toBe(3);
        expect(body.person_titles).toEqual(['CEO']);
        expect(body.q_keywords).toBe('x');
    });

    it('enrichOrganization GETs with the encoded domain query', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ organization: {} }));
        const svc = new ApolloService('key1');
        await svc.enrichOrganization('acme.com');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.apollo.io/api/v1/organizations/enrich?domain=acme.com');
        expect(init.method).toBe('GET');
    });

    it('throws with the provider name on non-2xx', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: 'rate limited' }, 429));
        const svc = new ApolloService('key1');
        await expect(svc.enrichOrganization('acme.com')).rejects.toThrow(
            /Apollo API Error: 429 — rate limited/
        );
    });
});

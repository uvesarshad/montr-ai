import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZohoService } from './zoho.service';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('ZohoService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requires an access token', () => {
        expect(() => new ZohoService({})).toThrow(/OAuth access token is required/);
    });

    it('getRecords uses the apiDomain base, Zoho-oauthtoken auth, and caps per_page at 200', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: '1' }], info: { more_records: false } }));
        const svc = new ZohoService(
            { accessToken: 'tok' },
            { apiDomain: 'https://www.zohoapis.eu/' }
        );
        const res = await svc.getRecords('Leads', { per_page: 999, page: 2, fields: ['Email', 'Name'] });
        const [url, init] = fetchMock.mock.calls[0];
        const parsed = new URL(url);
        expect(parsed.origin).toBe('https://www.zohoapis.eu');
        expect(parsed.pathname).toBe('/crm/v2/Leads');
        expect(parsed.searchParams.get('per_page')).toBe('200'); // capped
        expect(parsed.searchParams.get('page')).toBe('2');
        expect(parsed.searchParams.get('fields')).toBe('Email,Name');
        expect(init.method).toBe('GET');
        expect(init.headers.Authorization).toBe('Zoho-oauthtoken tok');
        expect(res.records).toEqual([{ id: '1' }]);
    });

    it('rejects an unsupported CRM module', async () => {
        const svc = new ZohoService({ accessToken: 'tok' });
        await expect(svc.getRecords('Invoices')).rejects.toThrow(/unsupported CRM module/);
    });

    it('getRecord returns the first record or null on 204', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
        const svc = new ZohoService({ accessToken: 'tok' });
        const res = await svc.getRecord('Contacts', 'abc');
        expect(res).toBeNull();
        expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/crm/v2/Contacts/abc');
    });

    it('searchRecords requires at least one search param', async () => {
        const svc = new ZohoService({ accessToken: 'tok' });
        await expect(svc.searchRecords('Leads', {})).rejects.toThrow(
            /criteria, word, email or phone/
        );
    });

    it('getMailingLists hits the campaigns host derived from region', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ list_of_details: [] }));
        const svc = new ZohoService({ accessToken: 'tok' }, { region: 'eu' });
        await svc.getMailingLists();
        const parsed = new URL(fetchMock.mock.calls[0][0]);
        expect(parsed.origin).toBe('https://campaigns.zoho.eu');
        expect(parsed.pathname).toBe('/api/v1.1/getmailinglists');
        expect(parsed.searchParams.get('resfmt')).toBe('JSON');
    });

    it('throws with the provider name on non-2xx', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ message: 'invalid token', code: 'INVALID_TOKEN' }, 401));
        const svc = new ZohoService({ accessToken: 'tok' });
        await expect(svc.getRecords('Leads')).rejects.toThrow(/Zoho API Error: 401 — invalid token/);
    });
});

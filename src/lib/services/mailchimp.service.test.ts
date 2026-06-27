import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { MailchimpService } from './mailchimp.service';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('MailchimpService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('subscriberHash', () => {
        it('is md5 of the lowercased, trimmed email', () => {
            const email = '  Foo@Example.COM ';
            const expected = createHash('md5').update('foo@example.com').digest('hex');
            expect(MailchimpService.subscriberHash(email)).toBe(expected);
        });
    });

    describe('base URL derivation', () => {
        it('derives the host from the api key dc suffix', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ lists: [] }));
            const svc = new MailchimpService({ apiKey: 'abc123-us21' });
            await svc.listAudiences();
            const url = new URL(fetchMock.mock.calls[0][0]);
            expect(url.origin).toBe('https://us21.api.mailchimp.com');
            expect(url.pathname).toBe('/3.0/lists');
        });

        it('prefers an explicit apiEndpoint (trailing slash stripped)', async () => {
            fetchMock.mockResolvedValue(jsonResponse({}));
            const svc = new MailchimpService({
                accessToken: 'tok',
                apiEndpoint: 'https://us5.api.mailchimp.com/',
            });
            await svc.listAudiences();
            const url = new URL(fetchMock.mock.calls[0][0]);
            expect(url.origin).toBe('https://us5.api.mailchimp.com');
        });

        it('throws when datacenter cannot be determined', () => {
            expect(() => new MailchimpService({ accessToken: 'tok' })).toThrow(/datacenter/i);
        });
    });

    describe('auth header', () => {
        it('uses Bearer for an access token', async () => {
            fetchMock.mockResolvedValue(jsonResponse({}));
            const svc = new MailchimpService({ accessToken: 'tok', dc: 'us21' });
            await svc.listAudiences();
            const { headers } = fetchMock.mock.calls[0][1];
            expect(headers.Authorization).toBe('Bearer tok');
        });

        it('uses HTTP Basic for a classic API key', async () => {
            fetchMock.mockResolvedValue(jsonResponse({}));
            const svc = new MailchimpService({ apiKey: 'key-us21' });
            await svc.listAudiences();
            const { headers } = fetchMock.mock.calls[0][1];
            const expected = `Basic ${Buffer.from('anystring:key-us21').toString('base64')}`;
            expect(headers.Authorization).toBe(expected);
        });
    });

    describe('happy paths', () => {
        it('listMembers builds path + clamps count and passes status', async () => {
            const payload = { members: [{ id: 'm1' }] };
            fetchMock.mockResolvedValue(jsonResponse(payload));
            const svc = new MailchimpService({ accessToken: 'tok', dc: 'us21' });
            const res = await svc.listMembers('list1', { count: 500, status: 'subscribed' });
            const url = new URL(fetchMock.mock.calls[0][0]);
            expect(url.pathname).toBe('/3.0/lists/list1/members');
            expect(url.searchParams.get('count')).toBe('100'); // clamped from 500
            expect(url.searchParams.get('status')).toBe('subscribed');
            expect(fetchMock.mock.calls[0][1].method).toBe('GET');
            expect(res).toEqual(payload);
        });

        it('searchMembers sends the query param', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ exact_matches: {} }));
            const svc = new MailchimpService({ accessToken: 'tok', dc: 'us21' });
            await svc.searchMembers('jane');
            const url = new URL(fetchMock.mock.calls[0][0]);
            expect(url.pathname).toBe('/3.0/search-members');
            expect(url.searchParams.get('query')).toBe('jane');
        });
    });

    describe('error path', () => {
        it('throws with the provider name and detail on non-2xx', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ detail: 'Resource Not Found' }, 404));
            const svc = new MailchimpService({ accessToken: 'tok', dc: 'us21' });
            await expect(svc.getAudience('nope')).rejects.toThrow(
                /Mailchimp API: 404 — Resource Not Found/
            );
        });
    });
});

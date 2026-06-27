import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import { WordPressService } from './wordpress.service';

vi.mock('@/lib/workflow/ssrf-guard', () => ({
    safeOutboundFetch: vi.fn(),
    assertSafeOutboundUrl: vi.fn(),
}));

const safeFetch = vi.mocked(safeOutboundFetch);

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

const creds = { baseUrl: 'https://blog.example.com', username: 'admin', appPassword: 'pass word' };
const expectedAuth = `Basic ${Buffer.from('admin:pass word').toString('base64')}`;

describe('WordPressService', () => {
    beforeEach(() => {
        safeFetch.mockReset();
    });

    it('validates required credentials', () => {
        expect(() => new WordPressService({ baseUrl: '', username: 'a', appPassword: 'b' })).toThrow(
            /site URL/
        );
        expect(() => new WordPressService({ baseUrl: 'x', username: '', appPassword: 'b' })).toThrow(
            /username/
        );
        expect(() => new WordPressService({ baseUrl: 'x', username: 'a', appPassword: '' })).toThrow(
            /application password/
        );
    });

    it('routes through safeOutboundFetch with Basic auth and strips trailing slashes', async () => {
        safeFetch.mockResolvedValue(jsonResponse([{ id: 1 }]));
        const svc = new WordPressService({ ...creds, baseUrl: 'https://blog.example.com///' });
        const res = await svc.listPosts({ per_page: 500, status: 'publish', search: 'hi' });
        const [url, init] = safeFetch.mock.calls[0];
        const parsed = new URL(url as string);
        expect(parsed.origin).toBe('https://blog.example.com'); // slashes stripped
        expect(parsed.pathname).toBe('/wp-json/wp/v2/posts');
        expect(parsed.searchParams.get('per_page')).toBe('100'); // capped
        expect(parsed.searchParams.get('status')).toBe('publish');
        expect(parsed.searchParams.get('search')).toBe('hi');
        expect((init as RequestInit).headers).toMatchObject({ Authorization: expectedAuth });
        expect(res).toEqual([{ id: 1 }]);
    });

    it('createPost POSTs with default draft status', async () => {
        safeFetch.mockResolvedValue(jsonResponse({ id: 5 }));
        const svc = new WordPressService(creds);
        await svc.createPost({ title: 'T', content: '<p>x</p>' });
        const [url, init] = safeFetch.mock.calls[0];
        expect(new URL(url as string).pathname).toBe('/wp-json/wp/v2/posts');
        expect((init as RequestInit).method).toBe('POST');
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body).toMatchObject({ title: 'T', content: '<p>x</p>', status: 'draft' });
    });

    it('getMe requests the authenticated user with context=edit', async () => {
        safeFetch.mockResolvedValue(jsonResponse({ id: 1, name: 'admin' }));
        const svc = new WordPressService(creds);
        await svc.getMe();
        const parsed = new URL(safeFetch.mock.calls[0][0] as string);
        expect(parsed.pathname).toBe('/wp-json/wp/v2/users/me');
        expect(parsed.searchParams.get('context')).toBe('edit');
    });

    it('throws with the provider name on non-2xx', async () => {
        safeFetch.mockResolvedValue(jsonResponse({ message: 'Forbidden', code: 'rest_forbidden' }, 403));
        const svc = new WordPressService(creds);
        await expect(svc.getPost(1)).rejects.toThrow(/WordPress API Error: 403 — Forbidden/);
    });
});

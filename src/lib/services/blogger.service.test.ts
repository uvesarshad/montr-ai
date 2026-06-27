import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BloggerService } from './blogger.service';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('BloggerService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('listBlogs builds the v3 URL with Bearer auth and unwraps items', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ items: [{ id: 'b1' }] }));
        const svc = new BloggerService('tok');
        const res = await svc.listBlogs();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://www.googleapis.com/blogger/v3/users/self/blogs');
        expect(init.headers.Authorization).toBe('Bearer tok');
        expect(res).toEqual([{ id: 'b1' }]);
    });

    it('listPosts caps maxResults at 100 and forwards pageToken/status', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ items: [{ id: 'p1' }], nextPageToken: 'n' }));
        const svc = new BloggerService('tok');
        const res = await svc.listPosts('b1', { maxResults: 999, pageToken: 'tk', status: 'LIVE' });
        const parsed = new URL(fetchMock.mock.calls[0][0]);
        expect(parsed.pathname).toBe('/blogger/v3/blogs/b1/posts');
        expect(parsed.searchParams.get('maxResults')).toBe('100'); // capped
        expect(parsed.searchParams.get('pageToken')).toBe('tk');
        expect(parsed.searchParams.get('status')).toBe('LIVE');
        expect(res.nextPageToken).toBe('n');
    });

    it('createPost POSTs title/content and appends isDraft query when staged', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 'p1' }));
        const svc = new BloggerService('tok');
        await svc.createPost('b1', { title: 'T', content: '<p>hi</p>', labels: ['a'], isDraft: true });
        const [url, init] = fetchMock.mock.calls[0];
        expect(new URL(url).searchParams.get('isDraft')).toBe('true');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({ title: 'T', content: '<p>hi</p>', labels: ['a'] });
    });

    it('updatePost uses PUT', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 'p1' }));
        const svc = new BloggerService('tok');
        await svc.updatePost('b1', 'p1', { title: 'New' });
        expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    });

    it('throws with the provider name (nested error.message) on non-2xx', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Invalid grant' } }, 403));
        const svc = new BloggerService('tok');
        await expect(svc.listBlogs()).rejects.toThrow(/Blogger API Error: 403 — Invalid grant/);
    });
});

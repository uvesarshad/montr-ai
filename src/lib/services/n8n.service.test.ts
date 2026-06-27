import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import { N8nService } from './n8n.service';

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

describe('N8nService', () => {
    beforeEach(() => {
        safeFetch.mockReset();
    });

    it('requires baseUrl and apiKey', () => {
        expect(() => new N8nService('', 'k')).toThrow(/baseUrl is required/);
        expect(() => new N8nService('https://n8n.example.com', '')).toThrow(/apiKey is required/);
    });

    it('listWorkflows routes through safeOutboundFetch with X-N8N-API-KEY, caps limit, strips slashes', async () => {
        safeFetch.mockResolvedValue(jsonResponse({ data: [] }));
        const svc = new N8nService('https://n8n.example.com//', 'key1');
        await svc.listWorkflows({ limit: 999, active: true, cursor: 'c1' });
        const [url, init] = safeFetch.mock.calls[0];
        const parsed = new URL(url as string);
        expect(parsed.origin).toBe('https://n8n.example.com');
        expect(parsed.pathname).toBe('/api/v1/workflows');
        expect(parsed.searchParams.get('limit')).toBe('100'); // capped
        expect(parsed.searchParams.get('active')).toBe('true');
        expect(parsed.searchParams.get('cursor')).toBe('c1');
        expect((init as RequestInit).headers).toMatchObject({ 'X-N8N-API-KEY': 'key1' });
    });

    it('activateWorkflow POSTs to /api/v1/workflows/{id}/activate', async () => {
        safeFetch.mockResolvedValue(jsonResponse({ active: true }));
        const svc = new N8nService('https://n8n.example.com', 'key1');
        await svc.activateWorkflow('wf1');
        const [url, init] = safeFetch.mock.calls[0];
        expect(new URL(url as string).pathname).toBe('/api/v1/workflows/wf1/activate');
        expect((init as RequestInit).method).toBe('POST');
    });

    it('triggerWebhook hits {base}/webhook/{path} (NOT /api/v1) and sends a JSON body on POST', async () => {
        safeFetch.mockResolvedValue(jsonResponse({ ok: true }));
        const svc = new N8nService('https://n8n.example.com', 'key1');
        await svc.triggerWebhook('/my-hook', 'POST', { hello: 'world' });
        const [url, init] = safeFetch.mock.calls[0];
        const parsed = new URL(url as string);
        expect(parsed.pathname).toBe('/webhook/my-hook');
        expect(parsed.pathname).not.toContain('/api/v1');
        expect((init as RequestInit).method).toBe('POST');
        expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' });
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({ hello: 'world' });
    });

    it('triggerWebhook on GET omits the body', async () => {
        safeFetch.mockResolvedValue(jsonResponse({ ok: true }));
        const svc = new N8nService('https://n8n.example.com', 'key1');
        await svc.triggerWebhook('hook', 'GET', { ignored: true });
        const init = safeFetch.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('GET');
        expect(init.body).toBeUndefined();
    });

    it('throws with the provider name on non-2xx API errors', async () => {
        safeFetch.mockResolvedValue(jsonResponse({ message: 'unauthorized' }, 401));
        const svc = new N8nService('https://n8n.example.com', 'key1');
        await expect(svc.listWorkflows()).rejects.toThrow(/n8n API Error: 401 — unauthorized/);
    });

    it('throws an n8n Webhook Error on non-2xx webhook responses', async () => {
        safeFetch.mockResolvedValue(jsonResponse({ message: 'not registered' }, 404));
        const svc = new N8nService('https://n8n.example.com', 'key1');
        await expect(svc.triggerWebhook('hook')).rejects.toThrow(
            /n8n Webhook Error: 404 — not registered/
        );
    });
});

/**
 * n8n Service
 * Client over the n8n Public API (v1) for a self-hosted instance, plus
 * production-webhook triggering.
 *
 * SECURITY: the base URL is user-supplied, so EVERY outbound request goes
 * through `safeOutboundFetch` (SSRF guard with DNS pinning). Never use plain
 * fetch here.
 *
 * Auth: API key passed as the `X-N8N-API-KEY` header.
 * Docs: https://docs.n8n.io/api/
 */

import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface N8nListWorkflowsInput {
    active?: boolean;
    limit?: number;
    cursor?: string;
}

export interface N8nListExecutionsInput {
    workflowId?: string;
    status?: 'error' | 'success' | 'waiting';
    limit?: number;
    cursor?: string;
}

export class N8nService {
    private apiKey: string;
    private baseUrl: string;
    private apiRoot: string;

    constructor(baseUrl: string, apiKey: string) {
        if (!baseUrl) throw new Error('n8n: baseUrl is required');
        if (!apiKey) throw new Error('n8n: apiKey is required');
        // Strip trailing slashes so path joins are predictable.
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.apiRoot = `${this.baseUrl}/api/v1`;
        this.apiKey = apiKey;
    }

    private async request(
        url: string,
        options: Parameters<typeof safeOutboundFetch>[1] = {},
    ): Promise<Record<string, unknown>> {
        const response = await fetchWithRetry(
            url,
            {
                ...options,
                headers: {
                    'X-N8N-API-KEY': this.apiKey,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...(options?.headers as Record<string, string> | undefined),
                },
                signal: AbortSignal.timeout(30_000),
            } as RequestInit,
            { label: 'n8n', fetchImpl: safeOutboundFetch }
        );

        const text = await response.text().catch(() => '');
        let data: Record<string, unknown> = {};
        if (text) {
            try {
                data = JSON.parse(text) as Record<string, unknown>;
            } catch {
                data = { raw: text };
            }
        }
        if (!response.ok) {
            const message =
                (data?.message as string | undefined) ||
                (data?.raw as string | undefined) ||
                response.statusText;
            const text = `n8n API Error: ${response.status} — ${message}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'n8n');
            }
            throw new Error(text);
        }
        return data;
    }

    /** List workflows. GET /workflows */
    async listWorkflows(input: N8nListWorkflowsInput = {}): Promise<Record<string, unknown>> {
        const limit = Math.max(1, Math.min(Number(input.limit) || 100, 100));
        const params = new URLSearchParams({ limit: String(limit) });
        if (typeof input.active === 'boolean') params.set('active', String(input.active));
        if (input.cursor) params.set('cursor', input.cursor);
        return this.request(`${this.apiRoot}/workflows?${params.toString()}`);
    }

    /** Get a workflow by id. GET /workflows/{id} */
    async getWorkflow(id: string): Promise<Record<string, unknown>> {
        if (!id) throw new Error('n8n: getWorkflow requires a workflow id');
        return this.request(`${this.apiRoot}/workflows/${encodeURIComponent(id)}`);
    }

    /** Activate a workflow. POST /workflows/{id}/activate */
    async activateWorkflow(id: string): Promise<Record<string, unknown>> {
        if (!id) throw new Error('n8n: activateWorkflow requires a workflow id');
        return this.request(`${this.apiRoot}/workflows/${encodeURIComponent(id)}/activate`, {
            method: 'POST',
        });
    }

    /** Deactivate a workflow. POST /workflows/{id}/deactivate */
    async deactivateWorkflow(id: string): Promise<Record<string, unknown>> {
        if (!id) throw new Error('n8n: deactivateWorkflow requires a workflow id');
        return this.request(`${this.apiRoot}/workflows/${encodeURIComponent(id)}/deactivate`, {
            method: 'POST',
        });
    }

    /** List executions. GET /executions */
    async listExecutions(input: N8nListExecutionsInput = {}): Promise<Record<string, unknown>> {
        const limit = Math.max(1, Math.min(Number(input.limit) || 100, 100));
        const params = new URLSearchParams({ limit: String(limit) });
        if (input.workflowId) params.set('workflowId', input.workflowId);
        if (input.status) params.set('status', input.status);
        if (input.cursor) params.set('cursor', input.cursor);
        return this.request(`${this.apiRoot}/executions?${params.toString()}`);
    }

    /** Get an execution by id. GET /executions/{id} */
    async getExecution(id: string): Promise<Record<string, unknown>> {
        if (!id) throw new Error('n8n: getExecution requires an execution id');
        return this.request(`${this.apiRoot}/executions/${encodeURIComponent(id)}`);
    }

    /**
     * Trigger a production webhook. Calls {base}/webhook/{path} — this is how
     * external systems start an n8n workflow. Goes through safeOutboundFetch.
     */
    async triggerWebhook(
        webhookPath: string,
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
        payload?: unknown,
    ): Promise<Record<string, unknown>> {
        if (!webhookPath) throw new Error('n8n: triggerWebhook requires a webhookPath');
        const path = webhookPath.replace(/^\/+/, '');
        const url = `${this.baseUrl}/webhook/${path}`;
        const sendBody = payload !== undefined && method !== 'GET';
        const response = await safeOutboundFetch(url, {
            method,
            headers: {
                'X-N8N-API-KEY': this.apiKey,
                ...(sendBody ? { 'Content-Type': 'application/json' } : {}),
                Accept: 'application/json',
            },
            body: sendBody ? JSON.stringify(payload) : undefined,
            signal: AbortSignal.timeout(30_000),
        });

        const text = await response.text().catch(() => '');
        let data: Record<string, unknown> = {};
        if (text) {
            try {
                data = JSON.parse(text) as Record<string, unknown>;
            } catch {
                data = { raw: text };
            }
        }
        if (!response.ok) {
            const message =
                (data?.message as string | undefined) ||
                (data?.raw as string | undefined) ||
                response.statusText;
            throw new Error(`n8n Webhook Error: ${response.status} — ${message}`);
        }
        return data;
    }
}

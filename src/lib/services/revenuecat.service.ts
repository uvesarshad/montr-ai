/**
 * RevenueCat Service
 * Thin client over the RevenueCat REST API (v2). Import-only (reads only).
 *
 * Auth: secret API key (v2) passed as `Authorization: Bearer {apiKey}`.
 * Docs: https://www.revenuecat.com/docs/api-v2
 */

import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export class RevenuecatService {
    private apiKey: string;
    private baseUrl = 'https://api.revenuecat.com/v2';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private async request(endpoint: string): Promise<Record<string, unknown>> {
        const response = await fetchWithRetry(
            `${this.baseUrl}${endpoint}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(30_000),
            },
            { label: 'revenuecat' }
        );

        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
            const message =
                ((data?.error as Record<string, unknown> | undefined)?.message as
                    | string
                    | undefined) ||
                (data?.message as string | undefined) ||
                response.statusText;
            const text = `RevenueCat API Error: ${response.status} — ${message}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'revenuecat');
            }
            throw new Error(text);
        }
        return data;
    }

    /**
     * List projects in the account. GET /projects
     */
    async listProjects(): Promise<Record<string, unknown>> {
        return this.request('/projects');
    }

    /**
     * Get a single customer. GET /projects/{projectId}/customers/{customerId}
     */
    async getCustomer(projectId: string, customerId: string): Promise<Record<string, unknown>> {
        this.assertProjectAndCustomer(projectId, customerId);
        return this.request(
            `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(customerId)}`,
        );
    }

    /**
     * List a customer's subscriptions.
     * GET /projects/{projectId}/customers/{customerId}/subscriptions
     */
    async listCustomerSubscriptions(
        projectId: string,
        customerId: string,
    ): Promise<Record<string, unknown>> {
        this.assertProjectAndCustomer(projectId, customerId);
        return this.request(
            `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(
                customerId,
            )}/subscriptions`,
        );
    }

    /**
     * List a customer's purchases.
     * GET /projects/{projectId}/customers/{customerId}/purchases
     */
    async listCustomerPurchases(
        projectId: string,
        customerId: string,
    ): Promise<Record<string, unknown>> {
        this.assertProjectAndCustomer(projectId, customerId);
        return this.request(
            `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(
                customerId,
            )}/purchases`,
        );
    }

    /**
     * List a project's entitlements. GET /projects/{projectId}/entitlements
     */
    async listEntitlements(projectId: string): Promise<Record<string, unknown>> {
        if (!projectId) throw new Error('RevenueCat: listEntitlements requires a projectId');
        return this.request(`/projects/${encodeURIComponent(projectId)}/entitlements`);
    }

    private assertProjectAndCustomer(projectId: string, customerId: string): void {
        if (!projectId) throw new Error('RevenueCat: projectId is required');
        if (!customerId) throw new Error('RevenueCat: customerId is required');
    }
}

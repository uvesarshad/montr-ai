/**
 * Stripe Service
 * Thin client over the Stripe REST API. Import-only (reads only) — NO write
 * actions, matching the integrations write-back policy (docs/modules/integrations.md).
 *
 * Implemented with raw `fetch` against the fixed api.stripe.com host — the
 * stripe SDK is deliberately NOT a dependency. Auth: secret/restricted key as
 * `Authorization: Bearer {apiKey}`.
 * Docs: https://stripe.com/docs/api
 */

export class StripeService {
    private apiKey: string;
    private baseUrl = 'https://api.stripe.com/v1';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private async request(path: string): Promise<Record<string, unknown>> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                Accept: 'application/json',
            },
            signal: AbortSignal.timeout(30_000),
        });

        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
            const message =
                ((data?.error as Record<string, unknown> | undefined)?.message as string | undefined) ||
                (data?.message as string | undefined) ||
                response.statusText;
            throw new Error(`Stripe API Error: ${response.status} — ${message}`);
        }
        return data;
    }

    /**
     * Find a customer by email. GET /customers?email=...&limit=1
     * Returns the first matching customer object, or null when none exist.
     */
    async getCustomerByEmail(email: string): Promise<Record<string, unknown> | null> {
        if (!email) throw new Error('Stripe: email is required for getCustomerByEmail');
        const result = await this.request(
            `/customers?email=${encodeURIComponent(email)}&limit=1`
        );
        const list = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
        return list[0] || null;
    }

    /**
     * List recent successful charges (payments). GET /charges?limit=N
     */
    async listRecentPayments(limit = 10): Promise<Record<string, unknown>[]> {
        const safeLimit = Math.min(Math.max(Math.trunc(limit) || 10, 1), 100);
        const result = await this.request(`/charges?limit=${safeLimit}`);
        return Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
    }

    /**
     * Resolve a customer's subscription status by email.
     * Returns { customerId, status, subscriptions } — status is the most
     * relevant active/trialing subscription status, or 'none' when there are no
     * subscriptions (or no customer for the email).
     */
    async getSubscriptionStatusByEmail(email: string): Promise<{
        customerId: string | null;
        status: string;
        subscriptions: Record<string, unknown>[];
    }> {
        const customer = await this.getCustomerByEmail(email);
        const customerId = customer && typeof customer.id === 'string' ? customer.id : null;
        if (!customerId) {
            return { customerId: null, status: 'none', subscriptions: [] };
        }
        const result = await this.request(
            `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`
        );
        const subscriptions = Array.isArray(result.data)
            ? (result.data as Record<string, unknown>[])
            : [];
        // Prefer an active/trialing subscription's status, else the first one.
        const active = subscriptions.find(
            (s) => s.status === 'active' || s.status === 'trialing'
        );
        const status =
            (active && typeof active.status === 'string' && active.status) ||
            (subscriptions[0] && typeof subscriptions[0].status === 'string'
                ? (subscriptions[0].status as string)
                : 'none');
        return { customerId, status, subscriptions };
    }
}

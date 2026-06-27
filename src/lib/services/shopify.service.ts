/**
 * Shopify Service
 *
 * Wraps the Shopify Admin GraphQL API (NOT the legacy REST API).
 * Used for read-only import flows — products, orders, customers, shop info.
 *
 * Endpoint: https://{shopDomain}/admin/api/{apiVersion}/graphql.json
 * Auth:     X-Shopify-Access-Token header (Admin API access token).
 *
 * All errors are surfaced as Error instances prefixed with 'Shopify:'.
 */

import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';
import { IntegrationAuthError } from '@/lib/integrations/server/connection-health';

export interface ShopifyPageInfo {
    hasNextPage: boolean;
    endCursor: string | null;
}

export interface ShopifyListResult<T = Record<string, unknown>> {
    nodes: T[];
    pageInfo: ShopifyPageInfo;
}

export interface ShopifyListParams {
    first?: number;
    after?: string;
    query?: string;
}

interface GraphQLResponse {
    data?: Record<string, unknown>;
    errors?: Array<{ message?: string }>;
    extensions?: Record<string, unknown>;
}

export class ShopifyService {
    private shopDomain: string;
    private accessToken: string;
    private apiVersion: string;

    constructor(shopDomain: string, accessToken: string, apiVersion = '2024-10') {
        if (!shopDomain) throw new Error('Shopify: shop domain is required');
        if (!accessToken) throw new Error('Shopify: access token is required');
        // Normalize: strip protocol/trailing slash so callers can pass either form.
        this.shopDomain = shopDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        this.accessToken = accessToken;
        this.apiVersion = apiVersion || '2024-10';
    }

    private get endpoint(): string {
        return `https://${this.shopDomain}/admin/api/${this.apiVersion}/graphql.json`;
    }

    /**
     * Execute a GraphQL query/mutation against the Admin API.
     * Throws on transport errors, GraphQL `errors`, and HTTP non-2xx.
     */
    private async request<T = Record<string, unknown>>(
        query: string,
        variables?: Record<string, unknown>
    ): Promise<T> {
        let response: Response;
        try {
            response = await fetchWithRetry(
                this.endpoint,
                {
                    method: 'POST',
                    headers: {
                        'X-Shopify-Access-Token': this.accessToken,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({ query, variables: variables || {} }),
                    signal: AbortSignal.timeout(30_000),
                },
                { label: 'shopify' }
            );
        } catch (error) {
            throw new Error(`Shopify: request failed — ${error instanceof Error ? error.message : String(error)}`);
        }

        let body: GraphQLResponse;
        try {
            body = (await response.json()) as GraphQLResponse;
        } catch {
            throw new Error(`Shopify: ${response.status} — invalid JSON response`);
        }

        if (!response.ok) {
            const msg =
                body?.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
                response.statusText ||
                'request failed';
            const text = `Shopify: ${response.status} — ${msg}`;
            if (response.status === 401 || response.status === 403) {
                throw new IntegrationAuthError(text, response.status, 'shopify');
            }
            throw new Error(text);
        }

        if (Array.isArray(body.errors) && body.errors.length > 0) {
            const msg = body.errors.map((e) => e.message).filter(Boolean).join('; ') || 'GraphQL error';
            throw new Error(`Shopify: ${msg}`);
        }

        if (!body.data) {
            throw new Error('Shopify: empty response data');
        }

        return body.data as T;
    }

    /**
     * Surface Shopify `userErrors` (mutation-style validation errors) as throws.
     * No-op for read queries but kept for symmetry/future write paths.
     */
    private assertNoUserErrors(userErrors: unknown): void {
        if (Array.isArray(userErrors) && userErrors.length > 0) {
            const msg = userErrors
                .map((e) => {
                    const err = e as { message?: string; field?: unknown };
                    return err?.message || JSON.stringify(e);
                })
                .join('; ');
            throw new Error(`Shopify: ${msg}`);
        }
    }

    /** Clamp page size to Shopify's per-connection cap (50). */
    private pageSize(first?: number): number {
        const n = Number(first) || 25;
        return Math.max(1, Math.min(n, 50));
    }

    /** Accept a numeric id or a gid and normalize to gid://shopify/{type}/{id}. */
    private toGid(id: string | number, type: 'Product' | 'Order' | 'Customer'): string {
        const raw = String(id).trim();
        if (raw.startsWith('gid://shopify/')) return raw;
        // Strip any non-digits (e.g. if a full URL slipped through).
        const numeric = raw.replace(/[^0-9]/g, '');
        if (!numeric) throw new Error(`Shopify: invalid ${type} id "${raw}"`);
        return `gid://shopify/${type}/${numeric}`;
    }

    // ------------------------------------------------------------------ shop

    async getShop(): Promise<Record<string, unknown>> {
        const query = `
            query Shop {
                shop {
                    id
                    name
                    email
                    myshopifyDomain
                    primaryDomain { url host }
                    currencyCode
                    ianaTimezone
                    plan { displayName }
                }
            }`;
        const data = await this.request<{ shop: Record<string, unknown> }>(query);
        return data.shop;
    }

    // -------------------------------------------------------------- products

    async listProducts(params: ShopifyListParams = {}): Promise<ShopifyListResult> {
        const query = `
            query Products($first: Int!, $after: String, $query: String) {
                products(first: $first, after: $after, query: $query) {
                    edges {
                        node {
                            id
                            title
                            handle
                            status
                            totalInventory
                            variants(first: 10) {
                                edges { node { id price sku } }
                            }
                        }
                    }
                    pageInfo { hasNextPage endCursor }
                }
            }`;
        const data = await this.request<{ products: ConnectionShape }>(query, {
            first: this.pageSize(params.first),
            after: params.after || null,
            query: params.query || null,
        });
        return this.unwrap(data.products);
    }

    async getProduct(id: string | number): Promise<Record<string, unknown> | null> {
        const query = `
            query Product($id: ID!) {
                product(id: $id) {
                    id
                    title
                    handle
                    status
                    description
                    totalInventory
                    onlineStoreUrl
                    variants(first: 50) {
                        edges { node { id title price sku inventoryQuantity } }
                    }
                }
            }`;
        const data = await this.request<{ product: Record<string, unknown> | null }>(query, {
            id: this.toGid(id, 'Product'),
        });
        return data.product;
    }

    // ---------------------------------------------------------------- orders

    async listOrders(params: ShopifyListParams = {}): Promise<ShopifyListResult> {
        const query = `
            query Orders($first: Int!, $after: String, $query: String) {
                orders(first: $first, after: $after, query: $query) {
                    edges {
                        node {
                            id
                            name
                            createdAt
                            displayFinancialStatus
                            totalPriceSet { shopMoney { amount currencyCode } }
                            customer { id displayName email }
                            lineItems(first: 10) {
                                edges { node { title quantity } }
                            }
                        }
                    }
                    pageInfo { hasNextPage endCursor }
                }
            }`;
        const data = await this.request<{ orders: ConnectionShape }>(query, {
            first: this.pageSize(params.first),
            after: params.after || null,
            query: params.query || null,
        });
        return this.unwrap(data.orders);
    }

    async getOrder(id: string | number): Promise<Record<string, unknown> | null> {
        const query = `
            query Order($id: ID!) {
                order(id: $id) {
                    id
                    name
                    createdAt
                    displayFinancialStatus
                    displayFulfillmentStatus
                    totalPriceSet { shopMoney { amount currencyCode } }
                    customer { id displayName email phone }
                    lineItems(first: 50) {
                        edges { node { title quantity originalUnitPriceSet { shopMoney { amount currencyCode } } } }
                    }
                }
            }`;
        const data = await this.request<{ order: Record<string, unknown> | null }>(query, {
            id: this.toGid(id, 'Order'),
        });
        return data.order;
    }

    // ------------------------------------------------------------- customers

    async listCustomers(params: ShopifyListParams = {}): Promise<ShopifyListResult> {
        const query = `
            query Customers($first: Int!, $after: String, $query: String) {
                customers(first: $first, after: $after, query: $query) {
                    edges {
                        node {
                            id
                            displayName
                            email
                            phone
                            numberOfOrders
                            amountSpent { amount currencyCode }
                        }
                    }
                    pageInfo { hasNextPage endCursor }
                }
            }`;
        const data = await this.request<{ customers: ConnectionShape }>(query, {
            first: this.pageSize(params.first),
            after: params.after || null,
            query: params.query || null,
        });
        return this.unwrap(data.customers);
    }

    async getCustomer(id: string | number): Promise<Record<string, unknown> | null> {
        const query = `
            query Customer($id: ID!) {
                customer(id: $id) {
                    id
                    displayName
                    firstName
                    lastName
                    email
                    phone
                    numberOfOrders
                    amountSpent { amount currencyCode }
                    createdAt
                }
            }`;
        const data = await this.request<{ customer: Record<string, unknown> | null }>(query, {
            id: this.toGid(id, 'Customer'),
        });
        return data.customer;
    }

    // ---------------------------------------------------------------- helpers

    /** Flatten a Shopify { edges: [{ node }], pageInfo } connection. */
    private unwrap(connection: ConnectionShape): ShopifyListResult {
        const nodes = (connection?.edges || []).map((e) => e.node);
        const pageInfo = connection?.pageInfo || { hasNextPage: false, endCursor: null };
        return {
            nodes,
            pageInfo: {
                hasNextPage: !!pageInfo.hasNextPage,
                endCursor: pageInfo.endCursor ?? null,
            },
        };
    }
}

interface ConnectionShape {
    edges?: Array<{ node: Record<string, unknown> }>;
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
}

export default ShopifyService;

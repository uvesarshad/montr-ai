/**
 * Shopify Webhook Auto-Registration
 *
 * Registers the webhook subscriptions MontrAI needs against a connected
 * Shopify store, using the Admin GraphQL API (NOT the legacy REST API).
 *
 * Endpoint: https://{shop}/admin/api/{apiVersion}/graphql.json
 * Auth:     X-Shopify-Access-Token header (Admin API access token).
 *
 * The host is always a fixed *.myshopify.com store domain, so plain `fetch`
 * is fine (no SSRF guard needed). All errors are surfaced as Error instances
 * prefixed with 'Shopify:', matching shopify.service.ts conventions.
 *
 * Idempotent: existing subscriptions already pointing at this connection's
 * callback URL are skipped. A failure registering one topic never aborts the
 * others — only a failure of the initial existing-subscriptions query throws.
 */

const DEFAULT_API_VERSION = '2024-10';

/**
 * GraphQL webhook topic enum values to register.
 *
 * READ-ONLY by product decision (see docs/modules/integrations.md → Write-back
 * policy): MontrAI never mutates Shopify. These are subscription topics whose
 * inbound deliveries START workflows (integration_webhook trigger). The cart /
 * checkout / order-paid topics make abandoned-cart and order-paid TRIGGERS
 * possible. The ingress route (api/webhooks/shopify/[connectionId]) reads the
 * REST-style topic header (e.g. CARTS_UPDATE → `carts/update`); no write
 * actions are ever derived from these.
 */
const WEBHOOK_TOPICS = [
    'ORDERS_CREATE',
    'CUSTOMERS_CREATE',
    'APP_UNINSTALLED',
    // Cart-recovery + order-paid triggers (read-only, 2026-06-06):
    'CARTS_UPDATE',
    'CHECKOUTS_CREATE',
    'CHECKOUTS_UPDATE',
    'ORDERS_PAID',
] as const;

type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

export interface RegisterShopifyWebhooksParams {
    shop: string;
    accessToken: string;
    connectionId: string;
    apiVersion?: string;
}

export interface RegisterShopifyWebhooksResult {
    registered: string[];
    skipped: string[];
    errors: Array<{ topic: string; error: string }>;
}

interface GraphQLResponse {
    data?: Record<string, unknown>;
    errors?: Array<{ message?: string }>;
    extensions?: Record<string, unknown>;
}

interface ExistingSubscriptionsData {
    webhookSubscriptions?: {
        edges?: Array<{
            node?: {
                id?: string;
                topic?: string;
                endpoint?: {
                    __typename?: string;
                    callbackUrl?: string;
                };
            };
        }>;
    };
}

interface UserError {
    field?: string[] | null;
    message?: string;
}

interface CreateSubscriptionData {
    webhookSubscriptionCreate?: {
        webhookSubscription?: { id?: string } | null;
        userErrors?: UserError[];
    };
}

/**
 * Execute a GraphQL query/mutation against a store's Admin API.
 * Throws (with a 'Shopify:'-prefixed message) on transport errors, HTTP
 * non-2xx, top-level GraphQL `errors`, or empty data — mutation `userErrors`
 * are returned in `data` and handled by the caller per-topic.
 */
async function shopifyGraphQL<T = Record<string, unknown>>(
    endpoint: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ query, variables: variables || {} }),
            signal: AbortSignal.timeout(30_000),
        });
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
        throw new Error(`Shopify: ${response.status} — ${msg}`);
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

/** Strip protocol/trailing slash so callers can pass either form. */
function normalizeShopDomain(shop: string): string {
    return shop.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/**
 * Ensure the webhook subscriptions MontrAI needs exist on the given store,
 * creating any that are missing and skipping any already pointing at this
 * connection's callback URL.
 */
export async function registerShopifyWebhooks(
    params: RegisterShopifyWebhooksParams
): Promise<RegisterShopifyWebhooksResult> {
    const { shop, accessToken, connectionId } = params;
    if (!shop) throw new Error('Shopify: shop domain is required');
    if (!accessToken) throw new Error('Shopify: access token is required');
    if (!connectionId) throw new Error('Shopify: connectionId is required');

    const apiVersion = params.apiVersion || DEFAULT_API_VERSION;
    const shopDomain = normalizeShopDomain(shop);
    const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
    const callbackUrl = `${appUrl}/api/webhooks/shopify/${connectionId}`;

    const result: RegisterShopifyWebhooksResult = {
        registered: [],
        skipped: [],
        errors: [],
    };

    // 1. Query existing subscriptions to make this idempotent. A failure here
    //    (auth/network) is fatal — we cannot safely decide what to create.
    const existingQuery = `
        query WebhookSubscriptions {
            webhookSubscriptions(first: 50) {
                edges {
                    node {
                        id
                        topic
                        endpoint {
                            __typename
                            ... on WebhookHttpEndpoint { callbackUrl }
                        }
                    }
                }
            }
        }`;

    const existingData = await shopifyGraphQL<ExistingSubscriptionsData>(endpoint, accessToken, existingQuery);

    // Topics already pointing at exactly this connection's callback URL.
    const alreadyRegistered = new Set<string>();
    for (const edge of existingData.webhookSubscriptions?.edges || []) {
        const node = edge?.node;
        if (node?.topic && node.endpoint?.callbackUrl === callbackUrl) {
            alreadyRegistered.add(node.topic);
        }
    }

    // 2. Create each missing topic. Per-topic failures are collected, not thrown.
    const createMutation = `
        mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
                webhookSubscription { id }
                userErrors { field message }
            }
        }`;

    for (const topic of WEBHOOK_TOPICS as readonly WebhookTopic[]) {
        if (alreadyRegistered.has(topic)) {
            result.skipped.push(topic);
            continue;
        }

        try {
            const data = await shopifyGraphQL<CreateSubscriptionData>(endpoint, accessToken, createMutation, {
                topic,
                webhookSubscription: {
                    callbackUrl,
                    format: 'JSON',
                },
            });

            const userErrors = data.webhookSubscriptionCreate?.userErrors || [];
            if (userErrors.length > 0) {
                const msg = userErrors.map((e) => e?.message).filter(Boolean).join('; ') || 'unknown userError';
                result.errors.push({ topic, error: msg });
                continue;
            }

            if (!data.webhookSubscriptionCreate?.webhookSubscription?.id) {
                result.errors.push({ topic, error: 'no subscription id returned' });
                continue;
            }

            result.registered.push(topic);
        } catch (error) {
            result.errors.push({
                topic,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return result;
}

export default registerShopifyWebhooks;

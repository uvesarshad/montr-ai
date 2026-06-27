/**
 * Calendly Webhook Auto-Registration
 *
 * Creates the webhook subscription MontrAI needs against a connected Calendly
 * account, using the v2 REST API.
 *
 * Endpoint: POST https://api.calendly.com/webhook_subscriptions
 * Auth:     Authorization: Bearer <personal access token>.
 *
 * The host is always the fixed api.calendly.com, so plain `fetch` is fine
 * (no SSRF guard needed) — matching the Shopify webhook-registration idiom.
 *
 * READ-ONLY by product decision: Calendly is a trigger source only. The
 * subscription's inbound deliveries START workflows via the integration_webhook
 * trigger (topics invitee.created / invitee.canceled); no write actions are ever
 * derived from it.
 *
 * Calendly returns a per-subscription `signing_key` ONLY in the create response.
 * The caller persists it on the connection metadata (`webhookSigningKey`) so the
 * ingress route can verify the `Calendly-Webhook-Signature` header.
 */

const API_BASE = 'https://api.calendly.com';

/** Events whose deliveries start workflows. */
const WEBHOOK_EVENTS = ['invitee.created', 'invitee.canceled'] as const;

export interface RegisterCalendlyWebhookParams {
    /** Personal access token (Bearer). */
    accessToken: string;
    connectionId: string;
}

export interface RegisterCalendlyWebhookResult {
    /** The signing key from the create response, to persist on the connection. */
    signingKey?: string;
    /** The created subscription uri (informational). */
    subscriptionUri?: string;
    /** True when an existing subscription already targeted our callback URL. */
    alreadyExists: boolean;
}

interface CalendlyUserMe {
    resource?: {
        uri?: string;
        current_organization?: string;
    };
}

interface CalendlyWebhookListItem {
    uri?: string;
    callback_url?: string;
}

interface CalendlyWebhookCreate {
    resource?: {
        uri?: string;
        callback_url?: string;
        signing_key?: string;
    };
}

async function calendlyFetch<T>(
    accessToken: string,
    path: string,
    init?: RequestInit
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(init?.headers || {}),
            },
            signal: AbortSignal.timeout(30_000),
        });
    } catch (error) {
        throw new Error(
            `Calendly: request failed — ${error instanceof Error ? error.message : String(error)}`
        );
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown> & T;
    if (!response.ok) {
        const message =
            (data?.message as string | undefined) ||
            (data?.title as string | undefined) ||
            response.statusText;
        throw new Error(`Calendly: ${response.status} — ${message}`);
    }
    return data as T;
}

/**
 * Ensure a webhook subscription for invitee.created / invitee.canceled exists
 * for this connection, pointing at our ingress callback URL. Idempotent: if a
 * subscription already targets the same callback URL it is left untouched (its
 * signing key is not retrievable after creation, so the stored key is kept).
 */
export async function registerCalendlyWebhook(
    params: RegisterCalendlyWebhookParams
): Promise<RegisterCalendlyWebhookResult> {
    const { accessToken, connectionId } = params;
    if (!accessToken) throw new Error('Calendly: access token is required');
    if (!connectionId) throw new Error('Calendly: connectionId is required');

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
    const callbackUrl = `${appUrl}/api/webhooks/calendly/${connectionId}`;

    // 1. Identify the user + organization the subscription is scoped to.
    const me = await calendlyFetch<CalendlyUserMe>(accessToken, '/users/me');
    const organization = me.resource?.current_organization;
    if (!organization) {
        throw new Error('Calendly: could not resolve current_organization from /users/me');
    }

    // 2. Idempotency: skip if a subscription already targets this callback URL.
    const listUrl = `/webhook_subscriptions?organization=${encodeURIComponent(
        organization
    )}&scope=organization&count=100`;
    const existing = await calendlyFetch<{ collection?: CalendlyWebhookListItem[] }>(
        accessToken,
        listUrl
    );
    const match = (existing.collection || []).find((s) => s.callback_url === callbackUrl);
    if (match) {
        return { alreadyExists: true, subscriptionUri: match.uri };
    }

    // 3. Create the subscription. Calendly returns the signing key only here.
    const created = await calendlyFetch<CalendlyWebhookCreate>(accessToken, '/webhook_subscriptions', {
        method: 'POST',
        body: JSON.stringify({
            url: callbackUrl,
            events: [...WEBHOOK_EVENTS],
            organization,
            scope: 'organization',
        }),
    });

    return {
        alreadyExists: false,
        signingKey: created.resource?.signing_key,
        subscriptionUri: created.resource?.uri,
    };
}

export default registerCalendlyWebhook;

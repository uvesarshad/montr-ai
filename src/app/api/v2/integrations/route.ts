import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationProvider, isIntegrationProviderId } from '@/lib/integrations/registry';
import { getProviderServerConfig } from '@/lib/integrations/server/provider-config';
import { resolveIntegrationContext } from '@/lib/integrations/server/route-helpers';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';
import { connectApiKeyIntegrationSchema } from '@/validations/integration';

/**
 * GET /api/v2/integrations — list the org's integration connections.
 * Credentials are never included (select:false on the model).
 */
export async function GET(_request: NextRequest) {
    try {
        const auth = await resolveIntegrationContext();
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const connections = await integrationConnectionRepository.findByOrganization(
);

        return NextResponse.json({
            connections: connections.map((c) => ({
                _id: c._id,
                provider: c.provider,
                authType: c.authType,
                brandId: c.brandId,
                externalAccountId: c.externalAccountId,
                externalAccountName: c.externalAccountName,
                status: c.status,
                lastError: c.lastError,
                lastTestedAt: c.lastTestedAt,
                tokenExpiresAt: c.tokenExpiresAt,
                createdAt: c.createdAt,
            })),
        });
    } catch (error) {
        console.error('Error listing integrations:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * POST /api/v2/integrations — connect an api_key provider.
 * The key is validated with a live call before anything is stored.
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await resolveIntegrationContext();
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        // Throttle connect attempts — the live validation call makes this
        // endpoint a potential key-bruteforce oracle.
        const { checkRateLimitGeneric } = await import('@/lib/rate-limiter');
        const rate = await checkRateLimitGeneric({
            bucket: 'integration-connect',
            identifier: auth.context.userId,
            limit: 10,
            windowSeconds: 300,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many connection attempts. Try again shortly.' },
                { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
            );
        }

        const parsed = connectApiKeyIntegrationSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const { provider, brandId, credentials } = parsed.data;

        if (!isIntegrationProviderId(provider)) {
            return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
        }
        const definition = getIntegrationProvider(provider)!;
        if (definition.authType !== 'api_key') {
            return NextResponse.json(
                { error: `${definition.name} connects via OAuth, not an API key` },
                { status: 400 }
            );
        }

        // Only accept the fields the registry declares for this provider.
        const allowedKeys = new Set((definition.apiKeyFields || []).map((f) => f.key));
        const sanitized: Record<string, string> = {};
        for (const field of definition.apiKeyFields || []) {
            const value = credentials[field.key]?.trim();
            if (field.required && !value) {
                return NextResponse.json(
                    { error: `${field.label} is required` },
                    { status: 400 }
                );
            }
            if (value) sanitized[field.key] = value;
        }
        const unknownKeys = Object.keys(credentials).filter((k) => !allowedKeys.has(k));
        if (unknownKeys.length > 0) {
            return NextResponse.json(
                { error: `Unknown credential fields: ${unknownKeys.join(', ')}` },
                { status: 400 }
            );
        }

        // Validate the key with a live call before saving.
        const serverConfig = getProviderServerConfig(provider);
        const result = await serverConfig.test(sanitized, {});
        if (!result.ok) {
            return NextResponse.json(
                { error: result.error || 'Credential validation failed' },
                { status: 422 }
            );
        }

        const connection = await integrationConnectionRepository.create({
            brandId: brandId || null,
            provider,
            authType: 'api_key',
            credentials: sanitized,
            connectedBy: auth.context.userId,
        });

        // Calendly: auto-register the meeting-booked / canceled webhook for this
        // connection and persist the returned signing key on metadata so the
        // ingress route can verify deliveries. Best-effort — a registration
        // failure must not break the connect flow (the connection is already
        // saved and the test passed); the user can re-test/reconnect to retry.
        if (provider === 'calendly') {
            try {
                const { registerCalendlyWebhook } = await import(
                    '@/lib/integrations/server/calendly-webhooks'
                );
                const result = await registerCalendlyWebhook({
                    accessToken: sanitized.apiKey,
                    connectionId: connection._id!.toString(),
                });
                if (result.signingKey) {
                    const IntegrationConnection = (
                        await import('@/lib/db/models/integration-connection.model')
                    ).default;
                    await IntegrationConnection.findByIdAndUpdate(connection._id, {
                        $set: { 'metadata.webhookSigningKey': result.signingKey },
                    });
                }
            } catch (err) {
                console.error('[integrations.calendly] webhook registration failed:', err);
            }
        }

        return NextResponse.json(
            {
                connection: {
                    _id: connection._id,
                    provider: connection.provider,
                    authType: connection.authType,
                    brandId: connection.brandId,
                    status: connection.status,
                    createdAt: connection.createdAt,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error connecting integration:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

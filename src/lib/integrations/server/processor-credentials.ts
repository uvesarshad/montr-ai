/**
 * Credential resolution for integration node processors.
 *
 * Order:
 *  1. config.credentialId → workflow credential vault (context.credentials)
 *  2. config.connectionId → a specific IntegrationConnection (org-checked)
 *  3. auto-resolve        → brand connection, falling back to the org-level one
 *
 * Multi-tenancy: organizationId always comes from the executing workflow,
 * never from node config.
 */

import type { IntegrationProviderId } from '@/lib/integrations/registry';
import {
    integrationConnectionRepository,
    type IntegrationCredentials,
} from '@/lib/db/repository/integration-connection.repository';

export interface ResolvedProcessorCredentials {
    credentials: IntegrationCredentials;
    /** Provider metadata stored at connect time (dc, apiDomain, shop, …). */
    metadata: Record<string, unknown>;
    /** Set when resolved from an IntegrationConnection (for markUsed). */
    connectionId?: string;
    /**
     * Connection ownership/identity, present when resolved from an
     * IntegrationConnection. Used to track runtime auth failures
     * (markConnectionAuthFailure) and clear them on success.
     */
    connection?: {
        id: string;
        brandId?: string | null;
        provider: string;
        connectedBy: string;
    };
}

export async function resolveProcessorCredentials(params: {
    provider: IntegrationProviderId;
    config: Record<string, unknown>;
    workflowCredentials?: Record<string, Record<string, unknown>>;
}): Promise<ResolvedProcessorCredentials> {
    const { provider, config, workflowCredentials } = params;

    // 1. Workflow credential vault
    const credentialId = typeof config.credentialId === 'string' ? config.credentialId : undefined;
    if (credentialId && workflowCredentials?.[credentialId]) {
        const cred = workflowCredentials[credentialId];
        const credentials: IntegrationCredentials = {};
        for (const [key, value] of Object.entries(cred)) {
            if (typeof value === 'string') credentials[key] = value;
        }
        const metadata =
            cred.metadata && typeof cred.metadata === 'object'
                ? (cred.metadata as Record<string, unknown>)
                : {};
        return { credentials, metadata };
    }
    // 2. Explicit connection
    const connectionId = typeof config.connectionId === 'string' ? config.connectionId : undefined;
    if (connectionId) {
        const resolved = await integrationConnectionRepository.findByIdWithCredentials(
            connectionId
        );
        if (!resolved) {
            throw new Error(`${provider}: connection ${connectionId} not found for this organization.`);
        }
        // Fail fast on a connection that already needs reconnecting — don't burn
        // an API call (and another auth failure) on a known-bad token.
        if (resolved.connection.status === 'needs_reauth' || resolved.connection.status === 'expired') {
            throw new Error(
                `${provider} connection needs to be reconnected. Reconnect it in Settings → Connections → Apps.`
            );
        }
        return {
            credentials: resolved.credentials,
            metadata: resolved.connection.metadata || {},
            connectionId,
            connection: {
                id: connectionId,
                brandId: resolved.connection.brandId,
                provider: resolved.connection.provider,
                connectedBy: resolved.connection.connectedBy,
            },
        };
    }

    // 3. Brand → org resolution
    const brandId = typeof config.brandId === 'string' ? config.brandId : undefined;
    const resolved = await integrationConnectionRepository.resolveForBrand(
        provider,
        brandId
    );
    if (!resolved) {
        throw new Error(
            `${provider}: not connected. Connect it in Settings → Connections → Apps first.`
        );
    }
    const resolvedId = resolved.connection._id!.toString();
    return {
        credentials: resolved.credentials,
        metadata: resolved.connection.metadata || {},
        connectionId: resolvedId,
        connection: {
            id: resolvedId,
            brandId: resolved.connection.brandId,
            provider: resolved.connection.provider,
            connectedBy: resolved.connection.connectedBy,
        },
    };
}

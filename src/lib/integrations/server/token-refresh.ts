/**
 * Preemptive OAuth token refresh for integration connections.
 *
 * Runs from the worker process on a repeatable BullMQ cron (see
 * scripts/workflow-worker.ts). HubSpot tokens live ~30 minutes and Airtable
 * 60, so refresh is mandatory, not best-effort.
 */

import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';
import { publishDomainEvent } from '@/lib/events/domain-bus';
import { getProviderServerConfig } from './provider-config';
import { expiresInToDate, refreshAccessToken } from './oauth';

/** Refresh tokens expiring within the next 15 minutes. */
const REFRESH_WINDOW_MS = 15 * 60 * 1000;

export interface TokenRefreshResult {
    scanned: number;
    refreshed: number;
    failed: number;
}

export async function refreshExpiringIntegrationTokens(): Promise<TokenRefreshResult> {
    const expiring = await integrationConnectionRepository.findExpiringSoon(REFRESH_WINDOW_MS);

    let refreshed = 0;
    let failed = 0;

    for (const { connection, credentials } of expiring) {
        const id = connection._id!.toString();
        const provider = connection.provider;

        const oauthConfig = getProviderServerConfig(provider).oauth;
        if (!oauthConfig?.refreshSupported) continue;

        if (!credentials.refreshToken) {
            failed++;
            await integrationConnectionRepository.setStatus(
                id,
                'expired',
                'Access token expired and no refresh token is stored — reconnect the account.'
            );
            emitExpired(connection.brandId, id, provider, connection.connectedBy);
            continue;
        }

        try {
            const region =
                typeof connection.metadata?.region === 'string'
                    ? connection.metadata.region
                    : undefined;

            const tokens = await refreshAccessToken(provider, {
                refreshToken: credentials.refreshToken,
                region,
            });

            await integrationConnectionRepository.updateCredentials(
                id,
                {
                    ...credentials,
                    accessToken: tokens.accessToken,
                    // Some providers rotate the refresh token on every refresh.
                    refreshToken: tokens.refreshToken || credentials.refreshToken,
                },
                expiresInToDate(tokens.expiresIn)
            );
            refreshed++;
        } catch (error) {
            failed++;
            const message = error instanceof Error ? error.message : 'Token refresh failed';
            console.error(`[TokenRefresh] ${provider} connection ${id}: ${message}`);
            await integrationConnectionRepository.setStatus(id, 'expired', message);
            emitExpired(connection.brandId, id, provider, connection.connectedBy);
        }
    }

    return { scanned: expiring.length, refreshed, failed };
}

/** Notify (via the domain bus → notification dispatcher) that a connection needs reconnecting. */
function emitExpired(
    brandId: string | null | undefined,
    connectionId: string,
    provider: string,
    connectedBy: string
): void {
    publishDomainEvent({
        type: 'integration.connection_expired',
        brandId: brandId || undefined,
        source: 'integrations.token-refresh',
        payload: { connectionId, provider, userId: connectedBy },
    });
}

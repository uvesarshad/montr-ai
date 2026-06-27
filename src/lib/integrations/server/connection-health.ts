/**
 * Connection-health helpers shared across the integration service layer.
 *
 * When a connection-backed API call returns 401/403 the access token (or the
 * grant behind it) is no longer valid. Instead of failing silently on every
 * subsequent run, we flip the connection record into a needs-reauth state so
 * the UI can surface a clear "reconnect" prompt and the domain bus can notify.
 *
 * Two connection stores exist:
 *   - IntegrationConnection  (the integrations hub: Mailchimp/HubSpot/Zoho/…)
 *   - SocialAccount          (Notion + social-publishing accounts)
 * Both expose a status/error surface; the helpers below normalize the write.
 */

import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { publishDomainEvent } from '@/lib/events/domain-bus';

/** True for the HTTP statuses that mean "this connection needs reconnecting". */
export function isAuthFailureStatus(status: number): boolean {
    return status === 401 || status === 403;
}

/**
 * Thrown by integration services when the provider rejects the credentials
 * (HTTP 401/403). Carrying a discriminable type lets the processor layer flag
 * the backing IntegrationConnection as needs-reauth without string-matching
 * error messages.
 */
export class IntegrationAuthError extends Error {
    readonly status: number;
    readonly provider?: string;
    constructor(message: string, status = 401, provider?: string) {
        super(message);
        this.name = 'IntegrationAuthError';
        this.status = status;
        this.provider = provider;
    }
}

export interface ConnectionHealthContext {
    /** IntegrationConnection id resolved for this call (omit for vault creds). */
    connectionId?: string;
    brandId?: string | null;
    provider?: string;
    userId?: string;
}

/**
 * Run an integration service call and, on an auth failure (IntegrationAuthError),
 * flip the backing IntegrationConnection into needs-reauth before re-throwing a
 * clear error. No-op marking when the credentials came from the workflow vault
 * (no connectionId). The original error is always re-thrown so the engine's
 * normal error reporting still fires.
 */
export async function runWithConnectionHealth<T>(
    ctx: ConnectionHealthContext,
    fn: () => Promise<T>
): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof IntegrationAuthError && ctx.connectionId) {
            await markIntegrationConnectionNeedsReauth(
                ctx.connectionId,
                error.message,
                {
                    brandId: ctx.brandId,
                    provider: ctx.provider ?? error.provider,
                    userId: ctx.userId,
                }
            );
        }
        throw error;
    }
}

/**
 * Mark an IntegrationConnection as needing re-auth after a 401/403.
 * Uses the 'expired' status (the model's reconnect-required state) so the
 * Connections UI shows a reconnect prompt. Best-effort: never throws.
 */
export async function markIntegrationConnectionNeedsReauth(
    connectionId: string,
    message: string,
    context?: { brandId?: string | null; provider?: string; userId?: string }
): Promise<void> {
    try {
        await integrationConnectionRepository.setStatus(connectionId, 'expired', message);
        if (context?.userId && context.provider) {
            publishDomainEvent({
                type: 'integration.connection_expired',
                brandId: context.brandId || undefined,
                source: 'integrations.connection-health',
                payload: {
                    connectionId,
                    provider: context.provider,
                    userId: context.userId,
                },
            });
        }
    } catch (error) {
        console.error(
            `[connection-health] Failed to mark IntegrationConnection ${connectionId} needs-reauth:`,
            error
        );
    }
}

/**
 * Mark a SocialAccount-backed connection (e.g. Notion) as needing re-auth after
 * a 401/403. Records the error on the account so the connection card can flag a
 * reconnect. Best-effort: never throws.
 */
export async function markSocialAccountNeedsReauth(
    socialAccountId: string,
    message: string
): Promise<void> {
    try {
        await socialAccountRepository.recordError(
            socialAccountId,
            `Reconnect required — ${message}`
        );
    } catch (error) {
        console.error(
            `[connection-health] Failed to mark SocialAccount ${socialAccountId} needs-reauth:`,
            error
        );
    }
}

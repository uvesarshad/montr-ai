// OSS single-tenant override of src/lib/db/repository/integration-connection.repository.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import { connectDB } from '@/lib/mongodb';
import IntegrationConnection, {
    IIntegrationConnection,
    IntegrationConnectionStatus,
} from '@/lib/db/models/integration-connection.model';
import type { IntegrationAuthType, IntegrationProviderId } from '@/lib/integrations/registry';
import { encryptToken, decryptToken } from '@/lib/encryption';
import { getRedisConnection } from '@/lib/workflow/queue/connection';
import { publishDomainEvent } from '@/lib/events/domain-bus';

/**
 * Consecutive runtime auth failures (401/403 during workflow runs) that flip a
 * connection to `needs_reauth` and fire the reconnect notification. After that,
 * workflows fail fast instead of hammering the provider until the owner
 * reconnects (which resets the counter via `updateCredentials`/`markUsed`).
 */
const AUTH_FAILURE_THRESHOLD = 5;
const AUTH_FAILURE_TTL_SEC = 24 * 60 * 60; // counter window — reset if a day passes clean

/** Decrypted credential blob — shape depends on the provider's authType. */
export interface IntegrationCredentials {
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    baseUrl?: string;
    [key: string]: string | undefined;
}

export interface CreateIntegrationConnectionInput {
    brandId?: string | null;
    provider: IntegrationProviderId;
    authType: IntegrationAuthType;
    credentials: IntegrationCredentials;
    tokenExpiresAt?: Date | null;
    scopes?: string[];
    externalAccountId?: string;
    externalAccountName?: string;
    metadata?: Record<string, unknown>;
    connectedBy: string;
}

export interface DecryptedIntegrationConnection {
    connection: IIntegrationConnection;
    credentials: IntegrationCredentials;
}

function encryptCredentials(credentials: IntegrationCredentials): string {
    return encryptToken(JSON.stringify(credentials));
}

/**
 * Decrypt a connection credential blob. Throws a clear, connection-tagged error
 * on failure (a wrong/rotated SOCIAL_TOKEN_ENCRYPTION_KEY, corrupt ciphertext,
 * or a non-JSON payload) instead of leaking secrets. NEVER include plaintext or
 * the ciphertext in the message.
 */
function decryptCredentials(encrypted: string, connectionId?: string): IntegrationCredentials {
    try {
        return JSON.parse(decryptToken(encrypted)) as IntegrationCredentials;
    } catch (error) {
        const idPart = connectionId ? ` (connection ${connectionId})` : '';
        console.error(
            `[IntegrationConnection] credential decrypt failed${idPart}:`,
            error instanceof Error ? error.message : error
        );
        throw new Error(
            `Failed to decrypt integration credentials${idPart}. The connection must be reconnected.`
        );
    }
}

/**
 * Integration Connection Repository
 *
 * Single-tenant: there is one implicit workspace, so connections are not
 * org-scoped. They remain brand-resolved (an optional brandId pins a connection
 * to a brand, otherwise it is a workspace-level default).
 */
export const integrationConnectionRepository = {
    async create(input: CreateIntegrationConnectionInput): Promise<IIntegrationConnection> {
        await connectDB();

        const connection = new IntegrationConnection({
            brandId: input.brandId || null,
            provider: input.provider,
            authType: input.authType,
            encryptedCredentials: encryptCredentials(input.credentials),
            tokenExpiresAt: input.tokenExpiresAt || null,
            scopes: input.scopes || [],
            externalAccountId: input.externalAccountId || null,
            externalAccountName: input.externalAccountName || null,
            metadata: input.metadata || {},
            connectedBy: input.connectedBy,
            status: 'connected',
        });

        return await connection.save();
    },

    /**
     * Upsert on (provider, externalAccountId, brandId) so reconnecting the same
     * external account refreshes credentials instead of duplicating.
     */
    async upsertByExternalAccount(input: CreateIntegrationConnectionInput): Promise<IIntegrationConnection> {
        await connectDB();

        if (!input.externalAccountId) {
            return this.create(input);
        }

        const existing = await IntegrationConnection.findOne({
            provider: input.provider,
            externalAccountId: input.externalAccountId,
            brandId: input.brandId || null,
        });

        if (!existing) {
            return this.create(input);
        }

        existing.set({
            encryptedCredentials: encryptCredentials(input.credentials),
            tokenExpiresAt: input.tokenExpiresAt || null,
            scopes: input.scopes || existing.scopes,
            externalAccountName: input.externalAccountName || existing.externalAccountName,
            metadata: { ...existing.metadata, ...(input.metadata || {}) },
            status: 'connected',
            lastError: null,
        });
        return await existing.save();
    },

    async findById(id: string): Promise<IIntegrationConnection | null> {
        await connectDB();
        return await IntegrationConnection.findOne({ _id: id });
    },

    async findByIdWithCredentials(
        id: string
    ): Promise<DecryptedIntegrationConnection | null> {
        await connectDB();
        const connection = await IntegrationConnection.findOne({ _id: id }).select(
            '+encryptedCredentials'
        );
        if (!connection) return null;

        return {
            connection,
            credentials: decryptCredentials(
                connection.encryptedCredentials,
                connection._id!.toString()
            ),
        };
    },

    async findAll(): Promise<IIntegrationConnection[]> {
        await connectDB();
        return await IntegrationConnection.find({}).sort({ createdAt: -1 });
    },

    /**
     * All connections for the (single-tenant) workspace. The former org filter
     * is a no-op; the `organizationId` param is retained (ignored) so surviving
     * core call-sites — api/v2/integrations, strategy/connected-channels — keep
     * their arity. Equivalent to `findAll` in the OSS build.
     */
    async findByOrganization(_organizationId?: string): Promise<IIntegrationConnection[]> {
        await connectDB();
        return await IntegrationConnection.find({}).sort({ createdAt: -1 });
    },

    /**
     * Resolve the connection to use for a provider in a brand context.
     * Chain: brand-pinned connection → workspace-level connection (brandId null).
     */
    async resolveForBrand(
        provider: IntegrationProviderId,
        brandId?: string | null
    ): Promise<DecryptedIntegrationConnection | null> {
        await connectDB();

        let connection: IIntegrationConnection | null = null;

        if (brandId) {
            connection = await IntegrationConnection.findOne({
                provider,
                brandId,
                status: { $nin: ['error', 'expired', 'needs_reauth'] },
            }).select('+encryptedCredentials');
        }

        if (!connection) {
            connection = await IntegrationConnection.findOne({
                provider,
                brandId: null,
                status: { $nin: ['error', 'expired', 'needs_reauth'] },
            }).select('+encryptedCredentials');
        }

        if (!connection) return null;

        return {
            connection,
            credentials: decryptCredentials(
                connection.encryptedCredentials,
                connection._id!.toString()
            ),
        };
    },

    /** Update the stored credential blob (e.g. after a token refresh). */
    async updateCredentials(
        id: string,
        credentials: IntegrationCredentials,
        tokenExpiresAt?: Date | null
    ): Promise<IIntegrationConnection | null> {
        await connectDB();

        const updateData: Record<string, unknown> = {
            encryptedCredentials: encryptCredentials(credentials),
            status: 'connected',
            lastError: null,
        };
        if (tokenExpiresAt !== undefined) {
            updateData.tokenExpiresAt = tokenExpiresAt;
        }

        return await IntegrationConnection.findByIdAndUpdate(id, updateData, { new: true });
    },

    async setStatus(
        id: string,
        status: IntegrationConnectionStatus,
        lastError?: string | null
    ): Promise<void> {
        await connectDB();
        await IntegrationConnection.findByIdAndUpdate(id, {
            status,
            lastError: lastError ?? null,
        });
    },

    async markTested(id: string, ok: boolean, error?: string): Promise<void> {
        await connectDB();
        await IntegrationConnection.findByIdAndUpdate(id, {
            lastTestedAt: new Date(),
            status: ok ? 'connected' : 'error',
            lastError: ok ? null : error || 'Connection test failed',
        });
    },

    async markUsed(id: string): Promise<void> {
        await connectDB();
        await IntegrationConnection.findByIdAndUpdate(id, { lastUsedAt: new Date() });
    },

    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await IntegrationConnection.findOneAndDelete({ _id: id });
        return !!result;
    },

    /**
     * Connections whose OAuth access token expires within `withinMs` and that
     * have a refresh token candidate. Used by the token-refresh worker job.
     */
    async findExpiringSoon(withinMs: number): Promise<DecryptedIntegrationConnection[]> {
        await connectDB();

        const cutoff = new Date(Date.now() + withinMs);
        const connections = await IntegrationConnection.find({
            authType: { $in: ['oauth2', 'oauth2_pkce'] },
            tokenExpiresAt: { $ne: null, $lte: cutoff },
            status: { $ne: 'error' },
        }).select('+encryptedCredentials');

        const decrypted: DecryptedIntegrationConnection[] = [];
        for (const connection of connections) {
            // This batch job intentionally tolerates a single bad row (a
            // rotated key / corrupt blob) rather than aborting the whole sweep —
            // decryptCredentials already logged the connection id. Skip it.
            try {
                decrypted.push({
                    connection,
                    credentials: decryptCredentials(
                        connection.encryptedCredentials,
                        connection._id!.toString()
                    ),
                });
            } catch {
                // already logged with connection id inside decryptCredentials
            }
        }
        return decrypted;
    },

    /**
     * Record one runtime auth failure (401/403 during a workflow run) for a
     * connection. After AUTH_FAILURE_THRESHOLD consecutive failures, flip the
     * connection to `needs_reauth` and fire ONE owner notification (the existing
     * `integration.connection_expired` dispatcher path, deduped per connection)
     * so workflows stop hammering the provider.
     *
     * The counter lives in Redis (INCR + EXPIRE) when available; without Redis
     * (single-process dev) it falls back to flipping status on the first failure
     * — better to fail safe than to never auto-pause.
     */
    async markConnectionAuthFailure(connection: {
        id: string;
        brandId?: string | null;
        provider: string;
        connectedBy: string;
    }): Promise<void> {
        const redis = getRedisConnection();
        let tripped = false;

        if (redis) {
            const key = `intg:authfail:${connection.id}`;
            try {
                const count = await redis.incr(key);
                if (count === 1) await redis.expire(key, AUTH_FAILURE_TTL_SEC);
                tripped = count >= AUTH_FAILURE_THRESHOLD;
            } catch (err) {
                console.error('[IntegrationConnection] auth-failure counter error:', err);
                tripped = true; // fail safe — flip rather than loop forever
            }
        } else {
            tripped = true;
        }

        if (!tripped) return;

        await connectDB();
        // Atomically claim the transition so concurrent failing runs fire ONE
        // notification (only the run that actually flips the status emits).
        const res = await IntegrationConnection.updateOne(
            { _id: connection.id, status: { $ne: 'needs_reauth' } },
            {
                status: 'needs_reauth',
                lastError: 'Authentication failed repeatedly — reconnect the account.',
            }
        );
        if (res.modifiedCount === 0) return; // already needs_reauth — don't re-notify

        publishDomainEvent({
            type: 'integration.connection_expired',
            brandId: connection.brandId || undefined,
            source: 'integrations.auth-failure',
            payload: {
                connectionId: connection.id,
                provider: connection.provider,
                userId: connection.connectedBy,
            },
        });
    },

    /** Reset the consecutive auth-failure counter after a successful call. */
    async clearConnectionAuthFailure(connectionId: string): Promise<void> {
        const redis = getRedisConnection();
        if (!redis) return;
        try {
            await redis.del(`intg:authfail:${connectionId}`);
        } catch (err) {
            console.error('[IntegrationConnection] auth-failure counter clear error:', err);
        }
    },
};

export default integrationConnectionRepository;

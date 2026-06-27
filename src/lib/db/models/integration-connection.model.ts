import mongoose, { Schema, Document, Model } from 'mongoose';
import type { IntegrationAuthType, IntegrationProviderId } from '@/lib/integrations/registry';

/**
 * - connected     : healthy.
 * - expired       : the preemptive token-refresh job exhausted refresh (no/invalid
 *                   refresh token). Set by `token-refresh.ts`.
 * - needs_reauth  : runtime auth failures crossed the threshold during workflow
 *                   runs (see `markConnectionAuthFailure`). Workflows fail fast
 *                   against it instead of hammering the provider until the owner
 *                   reconnects.
 * - error         : a connection test failed (manual "Test connection").
 */
export type IntegrationConnectionStatus = 'connected' | 'expired' | 'needs_reauth' | 'error';

/**
 * A connected third-party business-tool account (Mailchimp, HubSpot, Airtable…).
 *
 * Ownership is hybrid: every connection belongs to an organization; an optional
 * brandId pins it to a single brand. Resolution rule (see repository): prefer a
 * connection matching the current brand, fall back to the org-level one
 * (brandId: null). Multiple connections per provider are allowed.
 *
 * Social-publishing accounts stay in SocialAccount — this model is for the
 * integrations hub.
 */
export interface IIntegrationConnection extends Document {
    brandId?: string | null;
    provider: IntegrationProviderId;
    authType: IntegrationAuthType;

    /**
     * Encrypted JSON blob (AES-256-GCM via src/lib/encryption.ts) holding
     * { accessToken?, refreshToken?, apiKey?, baseUrl?, ... } depending on authType.
     */
    encryptedCredentials: string;
    tokenExpiresAt?: Date | null;
    scopes: string[];

    /** Provider-side account identity (workspace id, hub id, account id…). */
    externalAccountId?: string;
    externalAccountName?: string;

    status: IntegrationConnectionStatus;
    lastError?: string | null;
    lastUsedAt?: Date | null;
    lastTestedAt?: Date | null;

    /** Provider-specific extras: { dc, apiDomain, region, ... } */
    metadata: Record<string, unknown>;

    /** User who connected the account. */
    connectedBy: string;

    createdAt: Date;
    updatedAt: Date;
}

const IntegrationConnectionSchema = new Schema<IIntegrationConnection>(
    {
        brandId: {
            type: String,
            default: null,
            index: true,
        },
        provider: {
            type: String,
            required: true,
        },
        authType: {
            type: String,
            enum: ['oauth2', 'oauth2_pkce', 'api_key'],
            required: true,
        },
        encryptedCredentials: {
            type: String,
            required: true,
            select: false, // Never include in queries by default
        },
        tokenExpiresAt: {
            type: Date,
            default: null,
        },
        scopes: {
            type: [String],
            default: [],
        },
        externalAccountId: {
            type: String,
            default: null,
        },
        externalAccountName: {
            type: String,
            default: null,
        },
        status: {
            type: String,
            enum: ['connected', 'expired', 'needs_reauth', 'error'],
            default: 'connected',
        },
        lastError: {
            type: String,
            default: null,
        },
        lastUsedAt: {
            type: Date,
            default: null,
        },
        lastTestedAt: {
            type: Date,
            default: null,
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
        connectedBy: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'integration_connections',
    }
);

IntegrationConnectionSchema.index({ provider: 1 });
IntegrationConnectionSchema.index({ brandId: 1, provider: 1 });
// Token refresh job scans for soon-to-expire OAuth tokens.
IntegrationConnectionSchema.index({ tokenExpiresAt: 1 }, { sparse: true });

const IntegrationConnection: Model<IIntegrationConnection> =
    mongoose.models.IntegrationConnection ||
    mongoose.model<IIntegrationConnection>('IntegrationConnection', IntegrationConnectionSchema);

export default IntegrationConnection;

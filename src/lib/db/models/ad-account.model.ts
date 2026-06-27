import mongoose, { Schema, Document, Model } from 'mongoose';

export type AdPlatform = 'google_ads' | 'meta_ads';

export interface IAdAccount extends Document {
    brandId: string;
    userId: string;              // User who connected the account

    platform: AdPlatform;
    externalAccountId: string;   // Google Ads customer ID / Meta ad account ID (digits only, no "act_" prefix)
    accountName: string;
    currencyCode?: string;
    timezone?: string;

    // Encrypted credentials (AES-256-GCM)
    // meta_ads: long-lived user access token (~60 days)
    // google_ads: access token (1h) + refresh token
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    tokenExpiresAt?: Date;

    // Metadata
    scopes: string[];            // Granted permissions
    /** google_ads: shared secret the user pastes into their Google lead
     *  form webhook config ("Google key") — identifies the connection. */
    webhookKey?: string;
    isActive: boolean;
    lastSyncedAt?: Date;         // Last successful insights sync
    lastUsedAt?: Date;
    lastError?: string;          // Store last error for debugging

    // Platform specific metadata
    googleMetadata?: {
        loginCustomerId?: string; // Manager (MCC) customer ID for the login-customer-id header
        isManager?: boolean;
        isTestAccount?: boolean;
    };
    metaMetadata?: {
        businessId?: string;
        businessName?: string;
        accountStatus?: number;   // Meta account_status (1 = active, 2 = disabled, ...)
    };

    createdAt: Date;
    updatedAt: Date;
}

const AdAccountSchema = new Schema<IAdAccount>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
        },
        platform: {
            type: String,
            enum: ['google_ads', 'meta_ads'],
            required: true,
        },
        externalAccountId: {
            type: String,
            required: true,
        },
        accountName: {
            type: String,
            required: true,
        },
        currencyCode: {
            type: String,
            default: null,
        },
        timezone: {
            type: String,
            default: null,
        },
        encryptedAccessToken: {
            type: String,
            required: true,
            select: false, // Don't include in queries by default for security
        },
        encryptedRefreshToken: {
            type: String,
            default: null,
            select: false,
        },
        tokenExpiresAt: {
            type: Date,
            default: null,
        },
        scopes: {
            type: [String],
            default: [],
        },
        webhookKey: {
            type: String,
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastSyncedAt: {
            type: Date,
            default: null,
        },
        lastUsedAt: {
            type: Date,
            default: null,
        },
        lastError: {
            type: String,
            default: null,
        },
        googleMetadata: {
            loginCustomerId: String,
            isManager: Boolean,
            isTestAccount: Boolean,
        },
        metaMetadata: {
            businessId: String,
            businessName: String,
            accountStatus: Number,
        },
    },
    {
        timestamps: true,
        collection: 'ad_accounts',
    }
);

// Indexes
AdAccountSchema.index({ platform: 1 });
AdAccountSchema.index({ brandId: 1, platform: 1 });
AdAccountSchema.index({ platform: 1, externalAccountId: 1 }, { unique: true }); // Prevent duplicate connections
AdAccountSchema.index({ webhookKey: 1 }, { unique: true, sparse: true }); // Google lead-form webhook lookup

// Prevent model recompilation in development
const AdAccount: Model<IAdAccount> =
    mongoose.models.AdAccount || mongoose.model<IAdAccount>('AdAccount', AdAccountSchema);

export default AdAccount;

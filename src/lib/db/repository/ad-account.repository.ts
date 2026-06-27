import { connectDB } from '@/lib/mongodb';
import AdAccount, { IAdAccount, AdPlatform } from '@/lib/db/models/ad-account.model';
import { encryptToken, decryptToken } from '@/lib/encryption';

export interface CreateAdAccountInput {
    brandId: string;
    userId: string;
    platform: AdPlatform;
    externalAccountId: string;
    accountName: string;
    currencyCode?: string;
    timezone?: string;
    accessToken: string;          // Will be encrypted
    refreshToken?: string;        // Will be encrypted
    tokenExpiresAt?: Date;
    scopes?: string[];
    webhookKey?: string;
    googleMetadata?: IAdAccount['googleMetadata'];
    metaMetadata?: IAdAccount['metaMetadata'];
}

export interface UpdateAdAccountInput {
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    isActive?: boolean;
    lastSyncedAt?: Date;
    lastUsedAt?: Date;
    lastError?: string;
    accountName?: string;
    currencyCode?: string;
    timezone?: string;
    googleMetadata?: IAdAccount['googleMetadata'];
    metaMetadata?: IAdAccount['metaMetadata'];
}

export interface DecryptedAdAccount {
    account: IAdAccount;
    accessToken: string;
    refreshToken?: string;
}

/**
 * Ad Account Repository
 * Provides CRUD operations with automatic token encryption/decryption.
 * All read paths are organization-scoped — callers must pass the
 * organizationId resolved from the session user (never client-supplied).
 */
export const adAccountRepository = {
    /**
     * Create a new ad account with encrypted tokens
     */
    async create(input: CreateAdAccountInput): Promise<IAdAccount> {
        await connectDB();

        const account = new AdAccount({
            brandId: input.brandId,
            userId: input.userId,
            platform: input.platform,
            externalAccountId: input.externalAccountId,
            accountName: input.accountName,
            currencyCode: input.currencyCode || null,
            timezone: input.timezone || null,
            encryptedAccessToken: encryptToken(input.accessToken),
            encryptedRefreshToken: input.refreshToken ? encryptToken(input.refreshToken) : null,
            tokenExpiresAt: input.tokenExpiresAt || null,
            scopes: input.scopes || [],
            webhookKey: input.webhookKey || null,
            googleMetadata: input.googleMetadata,
            metaMetadata: input.metaMetadata,
            isActive: true,
        });

        return await account.save();
    },

    /**
     * Find ad account by ID (without decrypted tokens)
     */
    async findById(id: string): Promise<IAdAccount | null> {
        await connectDB();
        return await AdAccount.findById(id);
    },

    /**
     * Find ad account by ID with decrypted tokens
     */
    async findByIdWithTokens(id: string): Promise<DecryptedAdAccount | null> {
        await connectDB();
        const account = await AdAccount.findById(id).select('+encryptedAccessToken +encryptedRefreshToken');

        if (!account) return null;

        return {
            account,
            accessToken: decryptToken(account.encryptedAccessToken),
            refreshToken: account.encryptedRefreshToken ? decryptToken(account.encryptedRefreshToken) : undefined,
        };
    },

    /**
     * Find all active accounts for an organization
     */
    async findByOrganizationId(): Promise<IAdAccount[]> {
        await connectDB();
        return await AdAccount.find({ isActive: true }).sort({ createdAt: -1 });
    },

    /**
     * Find all active accounts for a brand
     */
    async findByBrandId(brandId: string): Promise<IAdAccount[]> {
        await connectDB();
        return await AdAccount.find({ brandId, isActive: true }).sort({ createdAt: -1 });
    },

    /**
     * Find accounts by platform within an organization
     */
    async findByOrganizationAndPlatform(platform: AdPlatform): Promise<IAdAccount[]> {
        await connectDB();
        return await AdAccount.find({ platform, isActive: true });
    },

    /**
     * Find account by external account ID (to check if already connected)
     */
    async findByExternalAccountId(platform: AdPlatform, externalAccountId: string): Promise<IAdAccount | null> {
        await connectDB();
        return await AdAccount.findOne({ platform, externalAccountId });
    },

    /**
     * Find account by its lead-webhook key (Google lead form "Google key")
     */
    async findByWebhookKey(webhookKey: string): Promise<IAdAccount | null> {
        await connectDB();
        return await AdAccount.findOne({ webhookKey, isActive: true });
    },

    /**
     * Find all active accounts that need an insights sync (for the scheduler)
     */
    async findAllActive(platform?: AdPlatform): Promise<IAdAccount[]> {
        await connectDB();
        const query: Record<string, unknown> = { isActive: true };
        if (platform) query.platform = platform;
        return await AdAccount.find(query);
    },

    /**
     * Update tokens (with encryption)
     */
    async updateTokens(id: string, accessToken: string, refreshToken?: string, expiresAt?: Date): Promise<IAdAccount | null> {
        await connectDB();

        const updateData: Record<string, unknown> = {
            encryptedAccessToken: encryptToken(accessToken),
            lastError: null, // Clear any previous error
        };

        if (refreshToken) {
            updateData.encryptedRefreshToken = encryptToken(refreshToken);
        }
        if (expiresAt) {
            updateData.tokenExpiresAt = expiresAt;
        }

        return await AdAccount.findByIdAndUpdate(id, updateData, { new: true });
    },

    /**
     * Update account metadata
     */
    async update(id: string, input: UpdateAdAccountInput): Promise<IAdAccount | null> {
        await connectDB();

        const updateData: Record<string, unknown> = {};

        // Handle token updates with encryption
        if (input.accessToken) {
            updateData.encryptedAccessToken = encryptToken(input.accessToken);
        }
        if (input.refreshToken) {
            updateData.encryptedRefreshToken = encryptToken(input.refreshToken);
        }

        // Handle other fields
        if (input.tokenExpiresAt !== undefined) updateData.tokenExpiresAt = input.tokenExpiresAt;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;
        if (input.lastSyncedAt !== undefined) updateData.lastSyncedAt = input.lastSyncedAt;
        if (input.lastUsedAt !== undefined) updateData.lastUsedAt = input.lastUsedAt;
        if (input.lastError !== undefined) updateData.lastError = input.lastError;
        if (input.accountName !== undefined) updateData.accountName = input.accountName;
        if (input.currencyCode !== undefined) updateData.currencyCode = input.currencyCode;
        if (input.timezone !== undefined) updateData.timezone = input.timezone;
        if (input.googleMetadata !== undefined) updateData.googleMetadata = input.googleMetadata;
        if (input.metaMetadata !== undefined) updateData.metaMetadata = input.metaMetadata;

        return await AdAccount.findByIdAndUpdate(id, updateData, { new: true });
    },

    /**
     * Mark account as used
     */
    async markUsed(id: string): Promise<void> {
        await connectDB();
        await AdAccount.findByIdAndUpdate(id, { lastUsedAt: new Date(), lastError: null });
    },

    /**
     * Mark a successful insights sync
     */
    async markSynced(id: string): Promise<void> {
        await connectDB();
        await AdAccount.findByIdAndUpdate(id, { lastSyncedAt: new Date(), lastError: null });
    },

    /**
     * Record an error
     */
    async recordError(id: string, error: string): Promise<void> {
        await connectDB();
        await AdAccount.findByIdAndUpdate(id, { lastError: error });
    },

    /**
     * Soft delete (deactivate) an account
     */
    async deactivate(id: string): Promise<IAdAccount | null> {
        await connectDB();
        return await AdAccount.findByIdAndUpdate(id, { isActive: false }, { new: true });
    },

    /**
     * Hard delete an account
     */
    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await AdAccount.findByIdAndDelete(id);
        return !!result;
    },

    /**
     * Check if token needs refresh (within 5 minutes of expiry)
     */
    async needsRefresh(id: string): Promise<boolean> {
        await connectDB();
        const account = await AdAccount.findById(id);
        if (!account || !account.tokenExpiresAt) return false;

        const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
        return account.tokenExpiresAt < fiveMinutesFromNow;
    },
};

export default adAccountRepository;

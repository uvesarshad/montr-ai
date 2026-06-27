import { connectDB } from '@/lib/mongodb';
import SocialAccount, { ISocialAccount, SocialPlatform } from '@/lib/db/models/social-account.model';
import { encryptToken, decryptToken } from '@/lib/encryption';

export interface CreateSocialAccountInput {
    brandId: string;
    platform: SocialPlatform;
    platformAccountId: string;
    platformUsername: string;
    platformDisplayName?: string;
    avatarUrl?: string;
    accessToken: string;          // Will be encrypted
    refreshToken?: string;        // Will be encrypted
    botToken?: string;            // For Telegram, will be encrypted
    tokenExpiresAt?: Date;
    scopes?: string[];
}

export interface UpdateSocialAccountInput {
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    isActive?: boolean;
    lastUsedAt?: Date;
    lastError?: string;
    avatarUrl?: string;
    platformUsername?: string;
    platformDisplayName?: string;
}

export interface DecryptedSocialAccount {
    account: ISocialAccount;
    accessToken: string;
    refreshToken?: string;
    botToken?: string;
}

/**
 * Social Account Repository
 * Provides CRUD operations with automatic token encryption/decryption
 */
export const socialAccountRepository = {
    /**
     * Create a new social account with encrypted tokens
     */
    async create(input: CreateSocialAccountInput): Promise<ISocialAccount> {
        await connectDB();

        const account = new SocialAccount({
            brandId: input.brandId,
            platform: input.platform,
            platformAccountId: input.platformAccountId,
            platformUsername: input.platformUsername,
            platformDisplayName: input.platformDisplayName || null,
            avatarUrl: input.avatarUrl || null,
            encryptedAccessToken: encryptToken(input.accessToken),
            encryptedRefreshToken: input.refreshToken ? encryptToken(input.refreshToken) : null,
            encryptedBotToken: input.botToken ? encryptToken(input.botToken) : null,
            tokenExpiresAt: input.tokenExpiresAt || null,
            scopes: input.scopes || [],
            isActive: true,
        });

        return await account.save();
    },

    /**
     * Find social account by ID (without decrypted tokens)
     */
    async findById(id: string): Promise<ISocialAccount | null> {
        await connectDB();
        return await SocialAccount.findById(id);
    },

    /**
     * Find social account by ID with decrypted tokens
     */
    async findByIdWithTokens(id: string): Promise<DecryptedSocialAccount | null> {
        await connectDB();
        const account = await SocialAccount.findById(id).select('+encryptedAccessToken +encryptedRefreshToken +encryptedBotToken');

        if (!account) return null;

        return {
            account,
            accessToken: decryptToken(account.encryptedAccessToken),
            refreshToken: account.encryptedRefreshToken ? decryptToken(account.encryptedRefreshToken) : undefined,
            botToken: account.encryptedBotToken ? decryptToken(account.encryptedBotToken) : undefined,
        };
    },

    /**
     * Find all accounts for a brand
     */
    async findByBrandId(brandId: string): Promise<ISocialAccount[]> {
        await connectDB();
        return await SocialAccount.find({ brandId, isActive: true }).sort({ createdAt: -1 });
    },

    /**
     * Find account by platform and brand
     */
    async findByBrandAndPlatform(brandId: string, platform: SocialPlatform): Promise<ISocialAccount[]> {
        await connectDB();
        return await SocialAccount.find({ brandId, platform, isActive: true });
    },

    /**
     * Find account by platform account ID (to check if already connected)
     */
    async findByPlatformAccountId(platform: SocialPlatform, platformAccountId: string): Promise<ISocialAccount | null> {
        await connectDB();
        return await SocialAccount.findOne({ platform, platformAccountId });
    },

    /**
     * Update tokens (with encryption)
     */
    async updateTokens(id: string, accessToken: string, refreshToken?: string, expiresAt?: Date): Promise<ISocialAccount | null> {
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

        return await SocialAccount.findByIdAndUpdate(id, updateData, { new: true });
    },

    /**
     * Update account metadata
     */
    async update(id: string, input: UpdateSocialAccountInput): Promise<ISocialAccount | null> {
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
        if (input.lastUsedAt !== undefined) updateData.lastUsedAt = input.lastUsedAt;
        if (input.lastError !== undefined) updateData.lastError = input.lastError;
        if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl;
        if (input.platformUsername !== undefined) updateData.platformUsername = input.platformUsername;
        if (input.platformDisplayName !== undefined) updateData.platformDisplayName = input.platformDisplayName;

        return await SocialAccount.findByIdAndUpdate(id, updateData, { new: true });
    },

    /**
     * Mark account as used
     */
    async markUsed(id: string): Promise<void> {
        await connectDB();
        await SocialAccount.findByIdAndUpdate(id, { lastUsedAt: new Date(), lastError: null });
    },

    /**
     * Record an error
     */
    async recordError(id: string, error: string): Promise<void> {
        await connectDB();
        await SocialAccount.findByIdAndUpdate(id, { lastError: error });
    },

    /**
     * Soft delete (deactivate) an account
     */
    async deactivate(id: string): Promise<ISocialAccount | null> {
        await connectDB();
        return await SocialAccount.findByIdAndUpdate(id, { isActive: false }, { new: true });
    },

    /**
     * Hard delete an account
     */
    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await SocialAccount.findByIdAndDelete(id);
        return !!result;
    },

    /**
     * Delete all accounts for a brand
     */
    async deleteByBrandId(brandId: string): Promise<number> {
        await connectDB();
        const result = await SocialAccount.deleteMany({ brandId });
        return result.deletedCount || 0;
    },

    /**
     * Count accounts for a brand (for limit checking)
     */
    async countByBrandId(brandId: string): Promise<number> {
        await connectDB();
        return await SocialAccount.countDocuments({ brandId, isActive: true });
    },

    /**
     * Check if token needs refresh (within 5 minutes of expiry)
     */
    async needsRefresh(id: string): Promise<boolean> {
        await connectDB();
        const account = await SocialAccount.findById(id);
        if (!account || !account.tokenExpiresAt) return false;

        const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
        return account.tokenExpiresAt < fiveMinutesFromNow;
    },

    /**
     * Scan for active accounts whose token expires within the lookahead window
     * (audit C6). Only accounts with a stored `tokenExpiresAt` are eligible —
     * tokens that never expire are skipped. Returns docs WITH decrypted refresh
     * tokens so the cron can attempt a refresh without a second round-trip.
     * Accounts already marked `revoked` are excluded (manual reconnect needed).
     */
    async findAccountsNeedingRefresh(
        lookaheadMs: number = 30 * 60 * 1000,
        limit: number = 200
    ): Promise<DecryptedSocialAccount[]> {
        await connectDB();
        const cutoff = new Date(Date.now() + lookaheadMs);
        const accounts = await SocialAccount.find({
            isActive: true,
            connectionStatus: { $ne: 'revoked' },
            tokenExpiresAt: { $ne: null, $lt: cutoff },
        })
            .select('+encryptedAccessToken +encryptedRefreshToken +encryptedBotToken')
            .sort({ tokenExpiresAt: 1 })
            .limit(limit);

        return accounts.map((account) => ({
            account,
            accessToken: account.encryptedAccessToken ? decryptToken(account.encryptedAccessToken) : '',
            refreshToken: account.encryptedRefreshToken ? decryptToken(account.encryptedRefreshToken) : undefined,
            botToken: account.encryptedBotToken ? decryptToken(account.encryptedBotToken) : undefined,
        }));
    },

    /**
     * Record a successful validation/refresh: stamp lastValidatedAt and clear
     * any prior expired/revoked status + error.
     */
    async markRefreshed(id: string): Promise<void> {
        await connectDB();
        await SocialAccount.findByIdAndUpdate(id, {
            connectionStatus: 'active',
            lastValidatedAt: new Date(),
            lastError: null,
        });
    },

    /**
     * Flag an account's credential health after a failed refresh (audit C6).
     */
    async markConnectionStatus(
        id: string,
        status: 'active' | 'expired' | 'revoked',
        error?: string
    ): Promise<void> {
        await connectDB();
        const update: Record<string, unknown> = { connectionStatus: status };
        if (error !== undefined) update.lastError = error;
        await SocialAccount.findByIdAndUpdate(id, update);
    },

    /**
     * Merge keys into the account's free-form `metadata` map (audit C6 —
     * TikTok advertiserId capture).
     */
    async setMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
        await connectDB();
        const $set: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(metadata)) {
            $set[`metadata.${key}`] = value;
        }
        if (Object.keys($set).length === 0) return;
        await SocialAccount.findByIdAndUpdate(id, { $set });
    },

    // ============ Telegram Channel Management ============

    /**
     * Add a Telegram channel to an account
     */
    async addTelegramChannel(
        accountId: string,
        channel: { chatId: string; title: string; type: 'channel' | 'group' | 'supergroup'; username?: string }
    ): Promise<ISocialAccount | null> {
        await connectDB();

        // Get current account
        const account = await SocialAccount.findById(accountId);
        if (!account || account.platform !== 'telegram') return null;

        // Build the new channels array
        const existingChannels = account.telegramChannels || [];
        const existingIndex = existingChannels.findIndex(ch => ch.chatId === channel.chatId);

        let newChannels;
        if (existingIndex >= 0) {
            // Update existing channel
            newChannels = [...existingChannels];
            newChannels[existingIndex] = channel;
        } else {
            // Add new channel
            newChannels = [...existingChannels, channel];
        }

        // Use $set with the full array (more reliable than $push when schema changes)
        const updated = await SocialAccount.findByIdAndUpdate(
            accountId,
            { $set: { telegramChannels: newChannels } },
            { new: true }
        );

        return updated;
    },

    /**
     * Remove a Telegram channel from an account
     */
    async removeTelegramChannel(accountId: string, chatId: string): Promise<ISocialAccount | null> {
        await connectDB();
        return await SocialAccount.findByIdAndUpdate(
            accountId,
            { $pull: { telegramChannels: { chatId } } },
            { new: true }
        );
    },

    /**
     * Get all Telegram channels for an account
     */
    async getTelegramChannels(accountId: string): Promise<{ chatId: string; title: string; type: string; username?: string }[]> {
        await connectDB();
        const account = await SocialAccount.findById(accountId);
        if (!account || account.platform !== 'telegram') return [];
        return account.telegramChannels || [];
    },
};

export default socialAccountRepository;
